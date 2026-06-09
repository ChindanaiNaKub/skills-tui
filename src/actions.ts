import { Skill, SkillLock, SkillWithMeta } from './types.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { rmSync, existsSync } from 'fs';

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

export function updateSkill(name: string): { success: boolean; error?: string } {
  // This would need to fetch from GitHub and re-clone
  // For now, just return not implemented
  return { success: false, error: 'Update not yet implemented - use `npx skills update` for now' };
}