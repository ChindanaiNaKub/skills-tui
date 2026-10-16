/** Persisted lock entry — only fields written to .skill-lock.json */
export interface SkillLockEntry {
  source: string;
  sourceType: 'github' | 'git' | 'unknown';
  sourceUrl?: string;
  skillPath: string;
  skillFolderHash: string;
  installedAt: string;
  updatedAt: string;
  latestCommitDate?: string;
  pluginName?: string;
}

/** One place on disk a skill was found — one entry per agent directory. */
export interface SkillLocation {
  /** Path as it appears in the agent dir (may be a symlink). */
  path: string;
  /** Real path the symlink resolves to. */
  realPath: string;
  /** Agent dir label, e.g. "claude", "codex", "opencode", "agents". */
  agent: string;
  scope: 'global' | 'project';
  isSymlink: boolean;
}

/** A skill moved aside by delete, so it can be restored later. */
export interface VaultEntry {
  name: string;
  agent: string;
  scope: 'global' | 'project';
  /** Where it lived before deletion. */
  originalPath: string;
  /** Where the directory now lives in the vault (empty for symlinks). */
  storedPath: string;
  isSymlink: boolean;
  linkTarget?: string;
  /** Lock entry captured at delete time, restored alongside the files. */
  lockEntry?: SkillLockEntry;
  removedAt: string;
}

/** Runtime skill — enriched with disk-inferred fields */
export interface Skill {
  name: string;
  diskPath: string;
  locations?: SkillLocation[];
  source?: string;
  sourceType?: 'github' | 'git' | 'unknown';
  sourceUrl?: string;
  skillPath?: string;
  skillFolderHash?: string;
  installedAt?: string;
  updatedAt?: string;
  latestCommitDate?: string;
  pluginName?: string;
  description?: string;
  inferred?: boolean;
}

export interface SkillLock {
  version: number;
  skills: Record<string, SkillLockEntry>;
  dismissed?: Record<string, boolean>;
  lastSelectedAgents?: string[];
}

export interface SkillWithMeta extends Skill {
  hasUpdate: boolean;
  latestHash?: string;
  latestCommitDate?: string;
}

export type Tab = 'installed' | 'updates' | 'all';

export interface AppState {
  skills: SkillWithMeta[];
  filteredSkills: SkillWithMeta[];
  selectedNames: Set<string>;
  activeTab: Tab;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  showDetails: boolean;
  detailSkillName: string | null;
  confirmAction: 'remove' | 'update' | null;
}
