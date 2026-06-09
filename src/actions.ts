import { Skill, SkillLock, SkillWithMeta } from './types.js';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir, tmpdir } from 'os';
import { execSync } from 'child_process';

const SKILL_LOCK_PATH = join(homedir(), '.agents', '.skill-lock.json');
const SKILLS_DIR = join(homedir(), '.agents', 'skills');

export function loadSkillLock(): SkillLock {
  const content = readFileSync(SKILL_LOCK_PATH, 'utf-8');
  return JSON.parse(content);
}

export function saveSkillLock(lock: SkillLock): void {
  writeFileSync(SKILL_LOCK_PATH, JSON.stringify(lock, null, 2));
}

export function removeSkills(skillNames: string[]): { success: string[]; failed: string[] } {
  const lock = loadSkillLock();
  const success: string[] = [];
  const failed: string[] = [];

  for (const name of skillNames) {
    if (!lock.skills[name]) {
      failed.push(`${name} (not found in lock)`);
      continue;
    }

    const skill = lock.skills[name];
    const skillPath = join(SKILLS_DIR, name);

    try {
      if (existsSync(skillPath)) {
        rmSync(skillPath, { recursive: true, force: true });
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
  const success: string[] = [];
  const failed: string[] = [];

  for (const name of skillNames) {
    if (!lock.skills[name]) {
      failed.push(`${name} (not found in lock)`);
      continue;
    }

    const skill = lock.skills[name];
    const skillDir = dirname(skill.skillPath); // e.g. "skills/skill-creator"
    const tempDir = join(tmpdir(), `skills-update-${name}-${Date.now()}`);

    try {
      execSync(
        `git clone --depth 1 --filter=blob:none "${skill.sourceUrl}" "${tempDir}"`,
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
      if (latestHash === skill.skillFolderHash) {
        failed.push(`${name} (already up to date)`);
        rmSync(tempDir, { recursive: true, force: true });
        continue;
      }

      const sourceDir = join(tempDir, skillDir);
      const targetDir = join(SKILLS_DIR, name);

      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
      mkdirSync(targetDir, { recursive: true });
      cpSync(sourceDir, targetDir, { recursive: true });

      const latestCommitDate = execSync(
        `git -C "${tempDir}" log -1 --format=%cI`,
        { timeout: 5000, stdio: 'pipe', encoding: 'utf-8' }
      ).trim();

      lock.skills[name] = {
        ...skill,
        skillFolderHash: latestHash,
        updatedAt: new Date().toISOString(),
      };

      if (latestCommitDate) {
        lock.skills[name].latestCommitDate = latestCommitDate;
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