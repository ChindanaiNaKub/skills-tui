#!/bin/sh
#
# skills-tui installer — no npm package required.
#
#   curl -fsSL https://raw.githubusercontent.com/ChindanaiNaKub/skills-tui/master/install.sh | sh
#
# Env overrides:
#   SKILLS_TUI_HOME  install location   (default: ~/.local/share/skills-tui)
#   SKILLS_TUI_BIN   launcher location  (default: ~/.local/bin)
#   SKILLS_TUI_REF   git ref to install (default: master)
#   SKILLS_TUI_REPO  git URL override  (default: github.com/ChindanaiNaKub/skills-tui)

set -eu

OWNER_REPO="ChindanaiNaKub/skills-tui"
REPO_URL="${SKILLS_TUI_REPO:-https://github.com/${OWNER_REPO}.git}"
REF="${SKILLS_TUI_REF:-master}"
INSTALL_DIR="${SKILLS_TUI_HOME:-$HOME/.local/share/skills-tui}"
BIN_DIR="${SKILLS_TUI_BIN:-$HOME/.local/bin}"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "Node.js >=18 is required — https://nodejs.org"
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || die "Node.js >=18 required (found $(node -v))"
command -v npm  >/dev/null 2>&1 || die "npm is required to install dependencies"

printf 'Installing skills-tui into %s\n' "$INSTALL_DIR"
rm -rf "$INSTALL_DIR"
mkdir -p "$(dirname "$INSTALL_DIR")"

if command -v git >/dev/null 2>&1; then
  git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR" >/dev/null 2>&1 \
    || die "git clone failed"
else
  command -v curl >/dev/null 2>&1 || die "need git or curl to download"
  archive="$(mktemp "${TMPDIR:-/tmp}/skills-tui.XXXXXX")"
  curl -fsSL "https://github.com/${OWNER_REPO}/archive/refs/heads/${REF}.tar.gz" -o "$archive" \
    || die "download failed"
  mkdir -p "$INSTALL_DIR"
  tar -xzf "$archive" -C "$INSTALL_DIR" --strip-components 1 || die "extract failed"
  rm -f "$archive"
fi

(
  cd "$INSTALL_DIR"
  npm install --no-audit --no-fund >/dev/null 2>&1 || die "dependency install failed"
  npm run build >/dev/null 2>&1 || die "build failed"
)

mkdir -p "$BIN_DIR"
launcher="$BIN_DIR/skills-tui"
cat > "$launcher" <<EOF
#!/bin/sh
exec node "$INSTALL_DIR/dist/index.js" "\$@"
EOF
chmod +x "$launcher"

printf 'Done. Run: skills-tui\n'
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) printf '\nAdd %s to your PATH:\n  export PATH="%s:$PATH"\n' "$BIN_DIR" "$BIN_DIR" ;;
esac
