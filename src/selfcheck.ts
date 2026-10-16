/**
 * Assert-based self-check for the vault move/restore round trip — the path that
 * can lose user data. Runs entirely in a temp dir; never touches real skills.
 * Run with: npm run selfcheck
 */
import assert from 'assert';
import { existsSync, mkdirSync, writeFileSync, symlinkSync, readFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, delimiter } from 'path';

const root = mkdtempSync(join(tmpdir(), 'skills-tui-selfcheck-'));
process.env.SKILLS_TUI_VAULT = join(root, 'vault');
process.env.SKILLS_TUI_LOCK = join(root, 'lock.json');

const dirA = join(root, 'agent-a');
const dirB = join(root, 'agent-b');
mkdirSync(join(dirA, 'real'), { recursive: true });
mkdirSync(dirB, { recursive: true });
writeFileSync(join(dirA, 'real', 'SKILL.md'), '---\nname: real\ndescription: demo\n---\n');
// agent-b has only a symlink to agent-a's skill (the common multi-agent setup).
symlinkSync(join(dirA, 'real'), join(dirB, 'real'));
process.env.SKILLS_TUI_DIRS = [dirA, dirB].join(delimiter);

const { loadSkills } = await import('./data.js');
const { removeSkills, restoreSkills, loadVault } = await import('./actions.js');

const skills = loadSkills();
const real = skills.find(s => s.name === 'real');
assert(real, 'skill "real" should be discovered');
assert.equal(real!.locations!.length, 2, 'both agent locations should be listed');

const { success } = removeSkills(['real']);
assert.deepEqual(success, ['real'], 'remove should report success');
assert(!existsSync(join(dirA, 'real')), 'real dir should be moved out of agent-a');
assert(!existsSync(join(dirB, 'real')), 'symlink should be unlinked from agent-b');

const vault = loadVault();
assert.equal(vault.length, 2, 'both locations should be recorded in the vault');
assert(vault.some(e => !e.isSymlink), 'real dir should be vaulted as a directory');
assert(vault.some(e => e.isSymlink), 'symlink should be recorded as a symlink');

const restored = restoreSkills(vault.map(e => e.originalPath));
assert.equal(restored.failed.length, 0, `restore should not fail: ${restored.failed.join(', ')}`);
assert(existsSync(join(dirA, 'real', 'SKILL.md')), 'real dir should be back');
assert.equal(readFileSync(join(dirA, 'real', 'SKILL.md'), 'utf-8').includes('name: real'), true, 'content preserved');
assert(existsSync(join(dirB, 'real')), 'symlink should be recreated');
assert.equal(loadVault().length, 0, 'vault should be empty after restore');

rmSync(root, { recursive: true, force: true });
console.log('selfcheck: OK');
