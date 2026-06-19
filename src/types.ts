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

/** Runtime skill — enriched with disk-inferred fields */
export interface Skill {
  name: string;
  diskPath: string;
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
