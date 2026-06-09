export interface Skill {
  name: string;
  source: string;
  sourceType: 'github';
  sourceUrl: string;
  skillPath: string;
  skillFolderHash: string;
  installedAt: string;
  updatedAt: string;
  pluginName?: string;
}

export interface SkillLock {
  version: number;
  skills: Record<string, Skill>;
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
  selectedIndices: Set<number>;
  activeTab: Tab;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  showDetails: boolean;
  detailIndex: number | null;
  confirmAction: 'remove' | 'update' | null;
}