import { SkillLock, SkillLockEntry, Skill, SkillWithMeta } from './types.js';
import { readFileSync, readdirSync, existsSync, realpathSync, lstatSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const SKILL_LOCK_PATH = join(homedir(), '.agents', '.skill-lock.json');

const SKILL_DIRS = [
  join(homedir(), '.agents', 'skills'),
  join(homedir(), '.config', 'opencode', 'skills'),
  join(homedir(), '.claude', 'skills'),
  join(process.cwd(), '.agents', 'skills'),
  join(process.cwd(), '.claude', 'skills'),
];

/** Try to get a command output; returns null on failure. */
function tryExec(cmd: string): string | null {
  try {
    return execSync(cmd, { timeout: 5000, stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

/** Parse SKILL.md frontmatter for name and description. */
function parseFrontmatter(skillMd: string): { name?: string; description?: string } {
  const fmMatch = skillMd.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return {};
  const block = fmMatch[1];
  const result: { name?: string; description?: string } = {};
  for (const line of block.split('\n')) {
    const [key, ...rest] = line.split(':');
    const val = rest.join(':').trim().replace(/^["']|["']$/g, '');
    if (key === 'name') result.name = val;
    else if (key === 'description') result.description = val;
  }
  return result;
}

/** Compute folder hash: git tree hash if .git exists, else SHA-256 of SKILL.md. */
function computeFolderHash(realPath: string): string {
  const gitDir = join(realPath, '.git');
  if (existsSync(gitDir) && lstatSync(gitDir).isDirectory()) {
    const treeHash = tryExec(`git -C "${realPath}" rev-parse HEAD:./`);
    if (treeHash) return treeHash;
  }
  // Fallback: hash SKILL.md
  const skillMd = join(realPath, 'SKILL.md');
  if (existsSync(skillMd)) {
    const content = readFileSync(skillMd);
    return createHash('sha256').update(content).digest('hex');
  }
  return createHash('sha256').update(realPath).digest('hex');
}

/** Infer git source from a skill directory's own .git remote. */
function inferGitSource(realPath: string): { source: string; sourceType: 'github' | 'git' | 'unknown'; sourceUrl?: string } {
  const gitDir = join(realPath, '.git');
  if (!existsSync(gitDir) || !lstatSync(gitDir).isDirectory()) {
    return { source: 'unknown', sourceType: 'unknown' };
  }
  const raw = tryExec(`git -C "${realPath}" remote get-url origin`);
  if (!raw) return { source: 'unknown', sourceType: 'unknown' };

  let url = raw;
  // Convert git@github.com:owner/repo.git → https://github.com/owner/repo.git
  const sshMatch = url.match(/^git@github\.com:(.+)\.git$/);
  if (sshMatch) {
    url = `https://github.com/${sshMatch[1]}.git`;
  }

  const httpsMatch = url.match(/github\.com[/:](.+?)(?:\.git)?$/);
  if (httpsMatch) {
    const repoPath = httpsMatch[1].replace(/\.git$/, '');
    return { source: repoPath, sourceType: 'github', sourceUrl: url.replace(/\.git$/, '') };
  }

  // Non-github git
  return { source: url, sourceType: 'git', sourceUrl: url.replace(/\.git$/, '') };
}

export function loadSkills(): SkillWithMeta[] {
  // 1. Load lock
  let lock: SkillLock;
  try {
    const content = readFileSync(SKILL_LOCK_PATH, 'utf-8');
    lock = JSON.parse(content);
  } catch {
    lock = { version: 1, skills: {} };
  }

  // Build runtime map keyed by skill name
  const runtimeMap = new Map<string, Skill>();

  // Seed from lock entries
  for (const [name, entry] of Object.entries(lock.skills)) {
    const defaultDiskPath = join(homedir(), '.agents', 'skills', name);
    runtimeMap.set(name, {
      name,
      diskPath: defaultDiskPath,
      source: entry.source,
      sourceType: entry.sourceType,
      sourceUrl: entry.sourceUrl,
      skillPath: entry.skillPath,
      skillFolderHash: entry.skillFolderHash,
      installedAt: entry.installedAt,
      updatedAt: entry.updatedAt,
      latestCommitDate: entry.latestCommitDate,
      pluginName: entry.pluginName,
      inferred: false,
    });
  }

  // Track seen real paths for dedup
  const seenPaths = new Set<string>();

  for (const dir of SKILL_DIRS) {
    if (!existsSync(dir)) continue;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

      const fullPath = join(dir, entry.name);
      let realPath: string;
      try {
        realPath = realpathSync(fullPath);
      } catch {
        continue;
      }

      // Skip if not a directory after resolving
      try {
        if (!statSync(realPath).isDirectory()) continue;
      } catch {
        continue;
      }

      // Dedup by real path — first dir wins
      if (seenPaths.has(realPath)) continue;
      seenPaths.add(realPath);

      // Parse SKILL.md
      const skillMdPath = join(realPath, 'SKILL.md');
      let skillMdContent = '';
      try {
        skillMdContent = readFileSync(skillMdPath, 'utf-8');
      } catch {
        // No SKILL.md — still usable
      }

      const fm = parseFrontmatter(skillMdContent);
      const name = fm.name || entry.name;
      const description = fm.description;

      // Infer git source
      const gitInfo = inferGitSource(realPath);

      // Compute folder hash
      const skillFolderHash = computeFolderHash(realPath);

      // Stat mtime for fallback dates
      let mtime: string;
      try {
        mtime = statSync(realPath).mtime.toISOString();
      } catch {
        mtime = new Date().toISOString();
      }

      const defaultDiskPath = join(homedir(), '.agents', 'skills', name);
      const existing = runtimeMap.get(name);
      if (existing) {
        // First discovered directory wins — only resolve default placeholder to real path
        if (existing.diskPath === defaultDiskPath) {
          existing.diskPath = realPath;
        }
        if (description) existing.description = description;
        // Do NOT overwrite source/sourceType/sourceUrl/skillPath/skillFolderHash/installedAt/updatedAt
      } else {
        // New inferred skill
        runtimeMap.set(name, {
          name,
          diskPath: realPath,
          source: gitInfo.source,
          sourceType: gitInfo.sourceType,
          sourceUrl: gitInfo.sourceUrl,
          skillPath: join(dir, entry.name),
          skillFolderHash,
          installedAt: mtime,
          updatedAt: mtime,
          description,
          inferred: true,
        });
      }
    }
  }

  // Convert to sorted array with SkillWithMeta
  const skills: SkillWithMeta[] = Array.from(runtimeMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => ({
      ...s,
      hasUpdate: false,
    }));

  return skills;
}

export function getSkillLockPath(): string {
  return SKILL_LOCK_PATH;
}

/** Build a runtime name→Skill map (used by actions). */
export function loadSkillMap(): Map<string, Skill> {
  const skills = loadSkills();
  const map = new Map<string, Skill>();
  for (const s of skills) {
    map.set(s.name, s);
  }
  return map;
}
