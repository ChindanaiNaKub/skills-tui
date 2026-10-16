import { SkillLock, Skill, SkillWithMeta, SkillLocation } from './types.js';
import { readFileSync, readdirSync, existsSync, realpathSync, lstatSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { getSkillDirs } from './paths.js';

// Overridable so tests/self-checks never touch the user's real lock.
const SKILL_LOCK_PATH = process.env.SKILLS_TUI_LOCK || join(homedir(), '.agents', '.skill-lock.json');

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

/** Per-real-path facts, cached so symlink fan-out does not repeat git/file reads. */
interface DirInfo {
  name?: string;
  description?: string;
  hash: string;
  source: string;
  sourceType: 'github' | 'git' | 'unknown';
  sourceUrl?: string;
  mtime: string;
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
    runtimeMap.set(name, {
      name,
      diskPath: join(homedir(), '.agents', 'skills', name),
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
      locations: [],
    });
  }

  const seenPaths = new Set<string>(); // dedup identical paths (not real paths — one entry per agent dir)
  const dirInfoCache = new Map<string, DirInfo>();

  for (const dir of getSkillDirs()) {
    if (!existsSync(dir.path)) continue;

    let entries;
    try {
      entries = readdirSync(dir.path, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith('.')) continue; // e.g. codex's .system — not a user skill

      const fullPath = join(dir.path, entry.name);
      if (seenPaths.has(fullPath)) continue;
      seenPaths.add(fullPath);

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

      let info = dirInfoCache.get(realPath);
      if (!info) {
        let skillMdContent = '';
        try {
          skillMdContent = readFileSync(join(realPath, 'SKILL.md'), 'utf-8');
        } catch {
          // No SKILL.md — still usable
        }
        const fm = parseFrontmatter(skillMdContent);
        let mtime: string;
        try {
          mtime = statSync(realPath).mtime.toISOString();
        } catch {
          mtime = new Date().toISOString();
        }
        const gitInfo = inferGitSource(realPath);
        info = {
          name: fm.name,
          description: fm.description,
          hash: computeFolderHash(realPath),
          source: gitInfo.source,
          sourceType: gitInfo.sourceType,
          sourceUrl: gitInfo.sourceUrl,
          mtime,
        };
        dirInfoCache.set(realPath, info);
      }

      const name = info.name || entry.name;
      const location: SkillLocation = {
        path: fullPath,
        realPath,
        agent: dir.agent,
        scope: dir.scope,
        isSymlink: entry.isSymbolicLink(),
      };

      const existing = runtimeMap.get(name);
      if (existing) {
        // Keep every agent location; never overwrite lock-sourced fields.
        (existing.locations ??= []).push(location);
        if (!existing.description && info.description) existing.description = info.description;
      } else {
        runtimeMap.set(name, {
          name,
          diskPath: fullPath,
          source: info.source,
          sourceType: info.sourceType,
          sourceUrl: info.sourceUrl,
          skillPath: fullPath,
          skillFolderHash: info.hash,
          installedAt: info.mtime,
          updatedAt: info.mtime,
          description: info.description,
          inferred: true,
          locations: [location],
        });
      }
    }
  }

  // Convert to sorted array; prefer a real (non-symlink) directory as the primary path.
  return Array.from(runtimeMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(s => {
      const locations = s.locations ?? [];
      const primary = locations.find(l => !l.isSymlink) ?? locations[0];
      return { ...s, locations, diskPath: primary ? primary.path : s.diskPath, hasUpdate: false };
    });
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
