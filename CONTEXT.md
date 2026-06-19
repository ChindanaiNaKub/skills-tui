# CONTEXT — Skills Manager TUI

## Glossary

**Skill**
A versioned agent skill installed from a git repository or discovered on disk. Skills can live in multiple directories: `~/.agents/skills/`, `~/.config/opencode/skills/`, `~/.claude/skills/`, and project-local `.agents/skills/` and `.claude/skills/`. Each skill has a unique `name` that serves as the stable identifier across the application. Skills are merged from two sources: the lock file (`~/.agents/.skill-lock.json`) and disk inference (scanning known directories).

**Skill Lock File**
The `.skill-lock.json` file at `~/.agents/.skill-lock.json`. Tracks installed skills with their source repos, commit hashes, and install/update timestamps. Only persisted fields are written: source, sourceType, sourceUrl, skillPath, skillFolderHash, installedAt, updatedAt, latestCommitDate, pluginName. Runtime-only fields (diskPath, description, inferred) are never written to the lock.

**Skill Selection Model**
User-facing selection of skills within the TUI is keyed by **skill name**, never by list position. Name-based keys survive tab switches, search filtering, and list mutations (deletes, updates) — only a skill actually removed from the lock file disappears from selection. This avoids ghost-checkbox bugs after destructive actions shrink the filtered list.
