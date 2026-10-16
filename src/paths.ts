import { existsSync } from 'fs';
import { homedir } from 'os';
import { delimiter, isAbsolute, join, resolve } from 'path';

/** A directory to scan for skills, tagged with the agent it belongs to. */
export interface SkillDir {
  path: string;
  agent: string;
  scope: 'global' | 'project';
}

/** Known global skill dirs, in priority order. Missing dirs are skipped. */
const GLOBAL_AGENT_DIRS: Array<[string, string]> = [
  ['.agents/skills', 'agents'],
  ['.claude/skills', 'claude'],
  ['.config/opencode/skills', 'opencode'],
  ['.codex/skills', 'codex'],
  ['.cursor/skills', 'cursor'],
  ['.gemini/skills', 'gemini'],
  ['.commandcode/skills', 'commandcode'],
  ['.config/crush/skills', 'crush'],
  ['.config/goose/skills', 'goose'],
  ['.config/devin/skills', 'devin'],
  ['.config/agents/skills', 'agents-config'],
];

/** Project-local skill dirs, relative to the current working directory. */
const PROJECT_AGENT_DIRS: Array<[string, string]> = [
  ['.agents/skills', 'agents'],
  ['.claude/skills', 'claude'],
  ['.codex/skills', 'codex'],
  ['.cursor/skills', 'cursor'],
  ['.gemini/skills', 'gemini'],
  ['.opencode/skills', 'opencode'],
  ['.windsurf/skills', 'windsurf'],
  ['.kiro/skills', 'kiro'],
  ['.agent/skills', 'agent'],
  ['.github/skills', 'github'],
  ['.commandcode/skills', 'commandcode'],
];

/** Extra paths from SKILLS_TUI_DIRS (path-delimited), for anything not auto-detected. */
function envDirs(): SkillDir[] {
  const raw = process.env.SKILLS_TUI_DIRS;
  if (!raw) return [];
  return raw
    .split(delimiter)
    .filter(Boolean)
    .map(p => ({ path: isAbsolute(p) ? p : resolve(p), agent: 'custom', scope: 'global' }));
}

export function getSkillDirs(): SkillDir[] {
  const dirs: SkillDir[] = [];
  for (const [rel, agent] of GLOBAL_AGENT_DIRS) {
    const path = join(homedir(), rel);
    if (existsSync(path)) dirs.push({ path, agent, scope: 'global' });
  }
  for (const [rel, agent] of PROJECT_AGENT_DIRS) {
    const path = join(process.cwd(), rel);
    if (existsSync(path)) dirs.push({ path, agent, scope: 'project' });
  }
  dirs.push(...envDirs());
  return dirs;
}
