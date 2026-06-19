import { SkillLock, SkillLockEntry } from './types.js';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, tmpdir } from 'os';
import { execSync } from 'child_process';

import { loadSkillMap, getSkillLockPath } from './data.js';

const SKILL_LOCK_PATH = getSkillLockPath();

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

export function removeSkills(skillNames: string[]): { success: string[]; failed: string[] } {
  const lock = loadSkillLock();
  const runtimeMap = loadSkillMap();
  const success: string[] = [];
  const failed: string[] = [];

  for (const name of skillNames) {
    const runtime = runtimeMap.get(name);
    if (!runtime) {
      failed.push(`${name} (not found on disk)`);
      continue;
    }

    const targetPath = runtime.diskPath;

    try {
      if (existsSync(targetPath)) {
        rmSync(targetPath, { recursive: true, force: true });
      }
      delete lock.skills[name];
      success.push(name);
    } catch (e) {
      failed.push(`${name} (${e})`);
    }
  }

  if (success.length > 0) {
    saveSkillLock(lock);
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
