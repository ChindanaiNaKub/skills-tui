# CONTEXT — Skills Manager TUI

## Glossary

**Skill**
A versioned agent skill installed from a git repository. Stored on disk under `~/.agents/skills/` and tracked in `~/.agents/.skill-lock.json`. Each skill has a unique `name` that serves as the stable identifier across the application.

**Skill Lock File**
The `.skill-lock.json` file at `~/.agents/.skill-lock.json`. The single source of truth for which skills are installed, their source repos, commit hashes, and install/update timestamps.

**Skill Selection Model**
User-facing selection of skills within the TUI is keyed by **skill name**, never by list position. Name-based keys survive tab switches, search filtering, and list mutations (deletes, updates) — only a skill actually removed from the lock file disappears from selection. This avoids ghost-checkbox bugs after destructive actions shrink the filtered list.
