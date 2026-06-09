import { SkillLock, Skill, SkillWithMeta } from './types.js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SKILL_LOCK_PATH = join(homedir(), '.agents', '.skill-lock.json');

export function loadSkills(): SkillWithMeta[] {
  try {
    const content = readFileSync(SKILL_LOCK_PATH, 'utf-8');
    const lock: SkillLock = JSON.parse(content);
    
    return Object.entries(lock.skills).map(([name, skill]) => ({
      ...skill,
      name,
      hasUpdate: false,
    }));
  } catch (e) {
    return [];
  }
}

export function getSkillLockPath(): string {
  return SKILL_LOCK_PATH;
}