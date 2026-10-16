import { SkillLock, Skill, SkillLocation, VaultEntry } from './types.js';
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync,
  renameSync, symlinkSync, readlinkSync, lstatSync, unlinkSync,
} from 'fs';
import { join, dirname } from 'path';
import { homedir, tmpdir } from 'os';
import { execSync } from 'child_process';

import { loadSkillMap, getSkillLockPath } from './data.js';

const SKILL_LOCK_PATH = getSkillLockPath();
const VAULT_DIR = process.env.SKILLS_TUI_VAULT || join(homedir(), '.config', 'skills-tui', 'vault');
const VAULT_MANIFEST = join(VAULT_DIR, 'vault.json');

export function loadSkillLock(): SkillLock {
  try {
    const content = readFileSync(SKILL_LOCK_PATH, 'utf-8');
    return JSON.parse(content);
  } catch {
    return { version: 1, skills: {} };
  }
}

export function saveSkillLock(lock: SkillLock): void {
  // Ensure no runtime-only fields leak into lock
  const cleaned: SkillLock = {
    ...lock,
    skills: {},
  };
  for (const [name, entry] of Object.entries(lock.skills)) {
    cleaned.skills[name] = {
      source: entry.source,
      sourceType: entry.sourceType,
      sourceUrl: entry.sourceUrl,
      skillPath: entry.skillPath,
      skillFolderHash: entry.skillFolderHash,
      installedAt: entry.installedAt,
      updatedAt: entry.updatedAt,
      latestCommitDate: entry.latestCommitDate,
      pluginName: entry.pluginName,
    };
  }
  writeFileSync(SKILL_LOCK_PATH, JSON.stringify(cleaned, null, 2));
}

/** Vault: deleted skills are moved here instead of being erased, so restore is possible. */
export function loadVault(): VaultEntry[] {
  try {
    return JSON.parse(readFileSync(VAULT_MANIFEST, 'utf-8'));
  } catch {
    return [];
  }
}

function saveVault(entries: VaultEntry[]): void {
  mkdirSync(VAULT_DIR, { recursive: true });
  writeFileSync(VAULT_MANIFEST, JSON.stringify(entries, null, 2));
}

function isLink(p: string): boolean {
  try { return lstatSync(p).isSymbolicLink(); } catch { return false; }
}

/** Move a path, falling back to copy+delete across filesystems. */
function movePath(src: string, dst: string): void {
  mkdirSync(dirname(dst), { recursive: true });
  try {
    renameSync(src, dst);
  } catch {
    cpSync(src, dst, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
}

function locationsOf(skill: Skill): SkillLocation[] {
  if (skill.locations && skill.locations.length > 0) return skill.locations;
  return [{ path: skill.diskPath, realPath: skill.diskPath, agent: 'agents', scope: 'global', isSymlink: false }];
}

/** Move every disk location of the named skills into the vault (undoable delete). */
export function removeSkills(skillNames: string[]): { success: string[]; failed: string[] } {
  const lock = loadSkillLock();
  const runtimeMap = loadSkillMap();
  const success: string[] = [];
  const failed: string[] = [];
  const removedAt = new Date().toISOString();
  const newEntries: VaultEntry[] = [];

  for (const name of skillNames) {
    const runtime = runtimeMap.get(name);
    if (!runtime) {
      failed.push(`${name} (not found on disk)`);
      continue;
    }

    let removedAny = false;
    let hadError = false;
    for (const loc of locationsOf(runtime)) {
      try {
        if (loc.isSymlink) {
          if (!isLink(loc.path) && !existsSync(loc.path)) continue;
          const linkTarget = (() => { try { return readlinkSync(loc.path); } catch { return undefined; } })();
          unlinkSync(loc.path);
          newEntries.push({
            name, agent: loc.agent, scope: loc.scope, originalPath: loc.path,
            storedPath: '', isSymlink: true, linkTarget,
            lockEntry: lock.skills[name], removedAt,
          });
        } else {
          if (!existsSync(loc.path)) continue;
          const storedPath = join(VAULT_DIR, loc.agent, `${loc.scope}__${name}`);
          movePath(loc.path, existsSync(storedPath) ? `${storedPath}__${Date.now()}` : storedPath);
          newEntries.push({
            name, agent: loc.agent, scope: loc.scope, originalPath: loc.path,
            storedPath, isSymlink: false,
            lockEntry: lock.skills[name], removedAt,
          });
        }
        removedAny = true;
      } catch (e) {
        hadError = true;
        failed.push(`${name} (${loc.path}: ${e})`);
      }
    }

    if (removedAny) {
      delete lock.skills[name];
      success.push(name);
    } else if (!hadError) {
      failed.push(`${name} (no files found on disk)`);
    }
  }

  if (success.length > 0) {
    saveSkillLock(lock);
    const stale = new Set(newEntries.map(e => e.originalPath));
    saveVault([...loadVault().filter(e => !stale.has(e.originalPath)), ...newEntries]);
  }

  return { success, failed };
}

/** Put vaulted entries back at their original paths. */
export function restoreSkills(originalPaths: string[]): { success: string[]; failed: string[] } {
  const lock = loadSkillLock();
  const vault = loadVault();
  const success: string[] = [];
  const failed: string[] = [];
  const restored = new Set<string>();

  for (const originalPath of originalPaths) {
    const entry = vault.find(e => e.originalPath === originalPath);
    if (!entry) {
      failed.push(`${originalPath} (not in vault)`);
      continue;
    }
    try {
      mkdirSync(dirname(entry.originalPath), { recursive: true });
      if (entry.isSymlink) {
        if (isLink(entry.originalPath) || existsSync(entry.originalPath)) unlinkSync(entry.originalPath);
        if (entry.linkTarget) symlinkSync(entry.linkTarget, entry.originalPath);
      } else {
        if (!existsSync(entry.storedPath)) {
          failed.push(`${entry.name} (vault copy missing)`);
          continue;
        }
        if (isLink(entry.originalPath) || existsSync(entry.originalPath)) {
          rmSync(entry.originalPath, { recursive: true, force: true });
        }
        movePath(entry.storedPath, entry.originalPath);
      }
      if (entry.lockEntry) lock.skills[entry.name] = entry.lockEntry;
      restored.add(entry.originalPath);
      success.push(entry.name);
    } catch (e) {
      failed.push(`${entry.name} (${e})`);
    }
  }

  if (restored.size > 0) {
    saveSkillLock(lock);
    saveVault(vault.filter(e => !restored.has(e.originalPath)));
  }

  return { success, failed };
}

export function updateSkills(skillNames: string[]): { success: string[]; failed: string[] } {
  const lock = loadSkillLock();
  const runtimeMap = loadSkillMap();
  const success: string[] = [];
  const failed: string[] = [];

  for (const name of skillNames) {
    const lockEntry = lock.skills[name];
    const runtime = runtimeMap.get(name);

    if (!lockEntry) {
      failed.push(`${name} (not found in lock — inferred skills cannot be updated)`);
      continue;
    }

    if (!lockEntry.sourceUrl) {
      failed.push(`${name} (no source URL in lock)`);
      continue;
    }

    const skillPathInRepo = lockEntry.skillPath; // e.g. "skills/my-skill"
    const skillDir = dirname(skillPathInRepo);
    const targetDir = runtime?.diskPath ?? join(homedir(), '.agents', 'skills', name);
    const tempDir = join(tmpdir(), `skills-update-${name}-${Date.now()}`);

    try {
      execSync(
        `git clone --depth 1 --filter=blob:none "${lockEntry.sourceUrl}" "${tempDir}"`,
        { timeout: 30000, stdio: 'pipe' }
      );

      const treeHashResult = execSync(
        `git -C "${tempDir}" ls-tree HEAD "${skillDir}"`,
        { timeout: 5000, stdio: 'pipe', encoding: 'utf-8' }
      );

      const hashMatch = treeHashResult.match(/^(\d+)\s+tree\s+(\S+)/);
      if (!hashMatch) {
        failed.push(`${name} (skill path not found in repo)`);
        rmSync(tempDir, { recursive: true, force: true });
        continue;
      }

      const latestHash = hashMatch[2];
      if (latestHash === lockEntry.skillFolderHash) {
        failed.push(`${name} (already up to date)`);
        rmSync(tempDir, { recursive: true, force: true });
        continue;
      }

      const sourceDir = join(tempDir, skillDir);

      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      mkdirSync(targetDir, { recursive: true });
      cpSync(sourceDir, targetDir, { recursive: true });

      const latestCommitDate = execSync(
        `git -C "${tempDir}" log -1 --format=%cI`,
        { timeout: 5000, stdio: 'pipe', encoding: 'utf-8' }
      ).trim();

      // Update only lock fields
      lockEntry.skillFolderHash = latestHash;
      lockEntry.updatedAt = new Date().toISOString();
      if (latestCommitDate) {
        lockEntry.latestCommitDate = latestCommitDate;
      }

      rmSync(tempDir, { recursive: true, force: true });
      success.push(name);
    } catch (e: any) {
      failed.push(`${name} (${e.message || e})`);
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }

  if (success.length > 0) {
    saveSkillLock(lock);
  }

  return { success, failed };
}
