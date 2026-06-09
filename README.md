# skills-tui

Interactive terminal UI for managing AI agent skills. Browse, search, multi-select, delete, and update skills installed via the [`skills` CLI](https://skills.sh).

## Install

```bash
npm install -g skills-tui
```

Or run without installing:

```bash
npx skills-tui
```

## Usage

```bash
skills-tui
```

### Keys

| Key | Action |
|-----|--------|
| `j` / `↓` | Move down |
| `k` / `↑` | Move up |
| `Space` | Toggle select |
| `Enter` | View skill details |
| `u` | Update selected skill(s) |
| `d` | Delete selected skill(s) |
| `/` | Search / filter |
| `Tab` | Switch tab (installed / updates / all) |
| `Esc` | Back / quit |
| `q` | Quit |

## Features

- **Tabs** — Switch between installed, update-available, and all skills
- **Search** — Filter by name, source repo, or plugin
- **Multi-select** — Space to toggle, then bulk update or delete
- **Scroll windowing** — Handles hundreds of skills without slowdown
- **Delete** — Removes skill directory from `~/.agents/skills/` and updates `.skill-lock.json`
- **Details view** — Shows source repo, install dates, commit hashes

## How it works

Reads from `~/.agents/.skill-lock.json` (managed by the `skills` CLI) and operates on `~/.agents/skills/`. Uses [Ink](https://github.com/vadimdemedes/ink) for the React-based terminal UI.

## Related

- [`skills` CLI](https://skills.sh) — Skill package manager (`npx skills`)

## License

MIT
