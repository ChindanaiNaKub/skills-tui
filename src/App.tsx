import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Text, Box, useInput, useApp, useStdout } from 'ink';
import { SkillWithMeta, Tab, VaultEntry } from './types.js';
import { loadSkills } from './data.js';
import { removeSkills, updateSkills, restoreSkills, loadVault } from './actions.js';

const TABS: Tab[] = ['installed', 'updates', 'all'];
const OVERHEAD_ROWS = 8;

/** Compact agent badge that fits maxLen, e.g. "claude,codex+7" ('*' = project-local). */
function agentBadge(locations: SkillWithMeta['locations'], maxLen: number): string {
  if (!locations || locations.length === 0) return 'unknown';
  const labels = Array.from(new Set(locations.map(l => (l.scope === 'project' ? `${l.agent}*` : l.agent))));
  const shown: string[] = [];
  for (const label of labels) {
    if (shown.length > 0 && [...shown, label].join(',').length > maxLen) break;
    shown.push(label);
  }
  const text = shown.join(',') + (shown.length < labels.length ? `+${labels.length - shown.length}` : '');
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

type ConfirmState = { action: 'remove' | 'update' | 'restore'; skillNames: string[]; restorePaths?: string[] };

export const App: React.FC = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 40;
  const listHeight = Math.max(5, terminalHeight - OVERHEAD_ROWS);

  // Column widths follow the terminal so rows do not wrap.
  const avail = Math.max(40, (stdout?.columns ?? 100) - 26);
  const nameW = Math.floor(avail * 0.34);
  const agentW = Math.floor(avail * 0.22);
  const srcW = avail - nameW - agentW;

  const [skills, setSkills] = useState<SkillWithMeta[]>([]);
  const [filteredSkills, setFilteredSkills] = useState<SkillWithMeta[]>([]);
  const [activeSkillName, setActiveSkillName] = useState<string | null>(null);
  const [selectedNames, setSelected] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailSkillName, setDetailSkillName] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState | null>(null);
  const [lastActionResult, setLastActionResult] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([]);
  const [vaultActive, setVaultActive] = useState(0);
  const [vaultSelected, setVaultSelected] = useState<Set<string>>(new Set());
  const scrollOffset = useRef(0);

  // Refs for latest state in useInput callback
  const refs = useRef({
    activeSkillName: null as string | null,
    filteredSkills: [] as SkillWithMeta[],
    searchMode: false,
    confirmDialog: null as ConfirmState | null,
    showDetails: false,
    selectedNames: new Set<string>(),
    activeTab: 'all' as Tab,
    searchQuery: '',
    listHeight: 32,
    vaultOpen: false,
    vaultEntries: [] as VaultEntry[],
    vaultActive: 0,
    vaultSelected: new Set<string>(),
  });
  refs.current = { activeSkillName, filteredSkills, searchMode, confirmDialog, showDetails, selectedNames, activeTab, searchQuery, listHeight, vaultOpen, vaultEntries, vaultActive, vaultSelected };

  // --- scroll-viewport helper: keep the active row inside the visible window ---
  const clampScrollForIndex = (targetIndex: number, total: number, lh: number) => {
    if (total === 0) { scrollOffset.current = 0; return; }
    if (targetIndex < scrollOffset.current) {
      scrollOffset.current = targetIndex;
    } else if (targetIndex >= scrollOffset.current + lh) {
      scrollOffset.current = targetIndex - lh + 1;
    }
    if (scrollOffset.current < 0) scrollOffset.current = 0;
    const maxOff = Math.max(0, total - lh);
    if (scrollOffset.current > maxOff) scrollOffset.current = maxOff;
  };

  const resolvedIndex = activeSkillName ? filteredSkills.findIndex(s => s.name === activeSkillName) : -1;
  const activeIndex = resolvedIndex >= 0 ? resolvedIndex : 0;

  // Load skills
  useEffect(() => {
    const loaded = loadSkills();
    setSkills(loaded);
    setFilteredSkills(loaded);
    if (loaded.length > 0 && !activeSkillName) setActiveSkillName(loaded[0].name);
  }, []);

  const applyFilters = useCallback((src: SkillWithMeta[], q: string, tab: Tab): SkillWithMeta[] => {
    let filtered = src;
    if (tab === 'installed') filtered = filtered.filter(s => !s.hasUpdate);
    else if (tab === 'updates') filtered = filtered.filter(s => s.hasUpdate);
    if (q) {
      const lq = q.toLowerCase();
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(lq) ||
        (s.source?.toLowerCase().includes(lq)) ||
        (s.pluginName?.toLowerCase().includes(lq))
      );
    }
    return filtered;
  }, []);

  const reloadSkills = useCallback(() => {
    const loaded = loadSkills();
    const r = refs.current;
    const newFiltered = applyFilters(loaded, r.searchQuery, r.activeTab);
    scrollOffset.current = 0;
    setSkills(loaded);
    setFilteredSkills(newFiltered);

    // Purge selected names that no longer exist in the loaded list
    const validNames = new Set(loaded.map(s => s.name));
    setSelected(prev => {
      const next = new Set<string>();
      for (const n of prev) {
        if (validNames.has(n)) next.add(n);
      }
      return next;
    });

    // Keep activeSkillName if still valid, otherwise fall back to first item
    if (r.activeSkillName && !validNames.has(r.activeSkillName)) {
      setActiveSkillName(newFiltered[0]?.name ?? null);
    }
  }, [applyFilters]);

  useInput((input, key) => {
    const r = refs.current;

    if (r.confirmDialog) {
      if (input === 'y') {
        const { action, skillNames, restorePaths } = r.confirmDialog;
        if (action === 'remove') {
          const result = removeSkills(skillNames);
          let msg = '';
          if (result.success.length > 0) msg += `Vaulted: ${result.success.join(', ')}`;
          if (result.failed.length > 0) msg += (msg ? ' | ' : '') + `Failed: ${result.failed.join(', ')}`;
          setLastActionResult(msg || 'No skills removed');
          reloadSkills();
        } else if (action === 'restore') {
          const result = restoreSkills(restorePaths ?? []);
          let msg = '';
          if (result.success.length > 0) msg += `Restored: ${result.success.join(', ')}`;
          if (result.failed.length > 0) msg += (msg ? ' | ' : '') + `Failed: ${result.failed.join(', ')}`;
          setLastActionResult(msg || 'Nothing restored');
          setVaultEntries(loadVault());
          setVaultSelected(new Set());
          setVaultActive(0);
          reloadSkills();
        } else {
          const result = updateSkills(skillNames);
          let msg = '';
          if (result.success.length > 0) msg += `Updated: ${result.success.join(', ')}`;
          if (result.failed.length > 0) msg += (msg ? ' | ' : '') + `Failed: ${result.failed.join(', ')}`;
          setLastActionResult(msg || 'No skills updated');
          reloadSkills();
        }
        setConfirmDialog(null);
        return;
      }
      if (input === 'n' || key.escape) {
        setConfirmDialog(null);
        return;
      }
      return;
    }

    if (r.vaultOpen) {
      const entries = r.vaultEntries;
      if (key.escape) {
        setVaultOpen(false);
        return;
      }
      if (entries.length > 0) {
        if (key.upArrow || input === 'k') {
          setVaultActive(prev => (prev - 1 + entries.length) % entries.length);
          return;
        }
        if (key.downArrow || input === 'j') {
          setVaultActive(prev => (prev + 1) % entries.length);
          return;
        }
        if (input === ' ') {
          const p = entries[r.vaultActive]?.originalPath;
          if (p) {
            setVaultSelected(prev => {
              const next = new Set(prev);
              if (next.has(p)) next.delete(p); else next.add(p);
              return next;
            });
          }
          return;
        }
        if (input === 'a') {
          setVaultSelected(prev => (prev.size === entries.length ? new Set() : new Set(entries.map(e => e.originalPath))));
          return;
        }
        if (key.return || input === 'r') {
          const paths = r.vaultSelected.size > 0
            ? Array.from(r.vaultSelected)
            : (entries[r.vaultActive] ? [entries[r.vaultActive].originalPath] : []);
          if (paths.length > 0) {
            const names = entries.filter(e => paths.includes(e.originalPath)).map(e => e.name);
            setConfirmDialog({ action: 'restore', skillNames: names, restorePaths: paths });
          }
          return;
        }
      }
      return;
    }

    if (r.searchMode) {
      if (key.return) {
        const newFiltered = applyFilters(skills, searchInput, r.activeTab);
        scrollOffset.current = 0;
        setSearchQuery(searchInput);
        setFilteredSkills(newFiltered);
        setActiveSkillName(newFiltered[0]?.name ?? null);
        setSearchMode(false);
        return;
      }
      if (key.escape) {
        setSearchMode(false);
        setSearchInput('');
        return;
      }
      if (key.backspace) {
        setSearchInput(prev => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setSearchInput(prev => prev + input);
        return;
      }
      return;
    }

    if (key.upArrow || input === 'k') {
      const len = r.filteredSkills.length;
      if (len === 0) return;
      const name = r.activeSkillName;
      const idx = name ? r.filteredSkills.findIndex(s => s.name === name) : -1;
      const prevIdx = idx >= 0 ? (((idx - 1) % len) + len) % len : 0;
      clampScrollForIndex(prevIdx, len, r.listHeight);
      setActiveSkillName(r.filteredSkills[prevIdx]?.name ?? null);
      return;
    }

    if (key.downArrow || input === 'j') {
      const len = r.filteredSkills.length;
      if (len === 0) return;
      const name = r.activeSkillName;
      const idx = name ? r.filteredSkills.findIndex(s => s.name === name) : -1;
      const nextIdx = idx >= 0 ? (idx + 1) % len : 0;
      clampScrollForIndex(nextIdx, len, r.listHeight);
      setActiveSkillName(r.filteredSkills[nextIdx]?.name ?? null);
      return;
    }

    if (input === ' ') {
      const name = r.activeSkillName;
      if (name) {
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(name)) {
            next.delete(name);
          } else {
            next.add(name);
          }
          return next;
        });
      }
      return;
    }

    if (input === 'a') {
      const names = r.filteredSkills.map(s => s.name);
      setSelected(names.length > 0 && names.every(n => r.selectedNames.has(n)) ? new Set() : new Set(names));
      return;
    }

    if (input === 'r') {
      const entries = loadVault();
      setVaultEntries(entries);
      setVaultSelected(new Set());
      setVaultActive(0);
      setVaultOpen(true);
      return;
    }

    if (key.return) {
      if (r.showDetails) {
        setShowDetails(false);
        setDetailSkillName(null);
      } else {
        const name = r.activeSkillName;
        if (name) {
          setShowDetails(true);
          setDetailSkillName(name);
        }
      }
      return;
    }

    if (input === 'u') {
      const names = Array.from(r.selectedNames);
      if (names.length === 0 && r.activeSkillName) names.push(r.activeSkillName);
      if (names.length > 0) {
        setConfirmDialog({ action: 'update', skillNames: names });
      }
      return;
    }

    if (input === 'd') {
      const names = Array.from(r.selectedNames);
      if (names.length === 0 && r.activeSkillName) names.push(r.activeSkillName);
      if (names.length > 0) {
        setConfirmDialog({ action: 'remove', skillNames: names });
      }
      return;
    }

    if (input === '/') {
      setSearchMode(true);
      setSearchInput('');
      return;
    }

    if (key.tab) {
      const ci = TABS.indexOf(r.activeTab);
      const newTab = TABS[(ci + 1) % TABS.length];
      const newFiltered = applyFilters(skills, r.searchQuery, newTab);
      const firstIdx = 0;
      scrollOffset.current = 0;
      setActiveTab(newTab);
      setActiveSkillName(newFiltered[firstIdx]?.name ?? null);
      setFilteredSkills(newFiltered);
      setSearchQuery('');
      return;
    }

    if (key.escape) {
      if (r.showDetails) {
        setShowDetails(false);
        setDetailSkillName(null);
      } else {
        exit();
      }
      return;
    }

    if (input === 'q') exit();
  });

  // ---- RENDER (all hooks are above, no conditional returns before this) ----

  const confirmNode = confirmDialog ? (
    <Box flexDirection="column" paddingX={4} paddingY={2} borderStyle="round" borderColor="yellow" marginTop={2}>
      <Text bold>
        {confirmDialog.action === 'remove' ? 'Vault' : confirmDialog.action === 'restore' ? 'Restore' : 'Update'} {confirmDialog.skillNames.length} skill(s)?
      </Text>
      <Box marginTop={1} marginBottom={1} flexDirection="column">
        {confirmDialog.skillNames.slice(0, 8).map(n => (
          <Text key={n} dimColor>  • {n}</Text>
        ))}
        {confirmDialog.skillNames.length > 8 && (
          <Text dimColor>  ... and {confirmDialog.skillNames.length - 8} more</Text>
        )}
      </Box>
      <Box flexDirection="row">
        <Box marginRight={2}><Text color="green">[y] Yes</Text></Box>
        <Text color="red">[n] No</Text>
      </Box>
    </Box>
  ) : null;

  const detailSkill = showDetails && detailSkillName ? filteredSkills.find(s => s.name === detailSkillName) ?? null : null;

  if (vaultOpen) {
    const total = vaultEntries.length;
    const activeIdx = Math.min(vaultActive, Math.max(0, total - 1));
    const vStart = Math.max(0, Math.min(activeIdx - Math.floor(listHeight / 2), total - listHeight));
    const vEnd = Math.min(Math.max(vStart, 0) + listHeight, total);
    return (
      <Box flexDirection="column">
        <Box paddingX={1} paddingY={1} borderStyle="single" borderColor="dim">
          <Text bold color="cyan">Vault</Text>
          <Box marginLeft={2}><Text dimColor>Deleted skills are kept here — press Enter to restore</Text></Box>
        </Box>

        <Box flexDirection="column" paddingX={1} marginTop={1}>
          {total === 0 && <Text dimColor>Vault is empty</Text>}
          {vaultEntries.slice(vStart, vEnd).map((e, i) => {
            const idx = vStart + i;
            const isActive = idx === activeIdx;
            const label = (e.scope === 'project' ? `${e.agent}*` : e.agent).slice(0, 16).padEnd(16);
            return (
              <Box key={e.originalPath} flexDirection="row">
                <Text color={isActive ? 'cyan' : undefined} bold={isActive} inverse={isActive}>
                  {isActive ? '▸ ' : '  '}{vaultSelected.has(e.originalPath) ? '[x]' : '[ ]'} {e.name.slice(0, 30).padEnd(30)} | {label} | {new Date(e.removedAt).toLocaleString()}
                </Text>
              </Box>
            );
          })}
        </Box>

        {lastActionResult && (
          <Box paddingX={1} paddingY={1}><Text color="green">{lastActionResult}</Text></Box>
        )}

        <Box paddingX={1} borderStyle="single" borderColor="dim" marginTop={1}>
          <Text dimColor>
            {vaultSelected.size > 0 ? `Selected: ${vaultSelected.size} ` : ''}
            {total} vaulted | {total === 0 ? 0 : activeIdx + 1}/{total}
          </Text>
          <Box marginLeft={2}>
            <Text dimColor>j/k: Navigate | Space: Toggle | a: All | Enter/r: Restore | Esc: Close</Text>
          </Box>
        </Box>

        {confirmNode}
      </Box>
    );
  }

  if (detailSkill) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold underline>{detailSkill.name}</Text>
        {detailSkill.description && <Box marginTop={1}><Text dimColor>Description:</Text><Text> {detailSkill.description}</Text></Box>}
        <Box marginTop={1}><Text dimColor>Path:</Text><Text> {detailSkill.diskPath}</Text></Box>
        {detailSkill.locations && detailSkill.locations.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Locations ({detailSkill.locations.length}):</Text>
            {detailSkill.locations.map(l => (
              <Text key={l.path} dimColor>
                {'  '}{l.agent}{l.scope === 'project' ? ' (project)' : ''}{l.isSymlink ? ' (symlink)' : ''} {'->'} {l.path}
              </Text>
            ))}
          </Box>
        )}
        {detailSkill.source && <Box><Text dimColor>Source:</Text><Text> {detailSkill.source}</Text></Box>}
        {detailSkill.sourceUrl && <Box><Text dimColor>Repo:</Text><Text> {detailSkill.sourceUrl}</Text></Box>}
        {detailSkill.skillPath && <Box><Text dimColor>Skill Path:</Text><Text> {detailSkill.skillPath}</Text></Box>}
        {detailSkill.installedAt && <Box><Text dimColor>Installed:</Text><Text> {new Date(detailSkill.installedAt).toLocaleString()}</Text></Box>}
        {detailSkill.updatedAt && <Box><Text dimColor>Updated:</Text><Text> {new Date(detailSkill.updatedAt).toLocaleString()}</Text></Box>}
        {detailSkill.skillFolderHash && <Box><Text dimColor>Hash:</Text><Text dimColor> {detailSkill.skillFolderHash}</Text></Box>}
        {detailSkill.pluginName && <Box><Text dimColor>Plugin:</Text><Text> {detailSkill.pluginName}</Text></Box>}
        {detailSkill.inferred && <Box><Text dimColor>Inferred from disk</Text></Box>}
        {detailSkill.hasUpdate && <Box marginTop={1}><Text color="green" bold>Update available!</Text></Box>}
        <Box marginTop={2}><Text dimColor>Esc: Back | q: Quit</Text></Box>
      </Box>
    );
  }

  // Compute scroll offset synchronously during render so viewport
  // scrolls in the same frame as the highlight moves.
  {
    const total = filteredSkills.length;
    if (total === 0) {
      scrollOffset.current = 0;
    } else {
      if (activeIndex < scrollOffset.current) {
        scrollOffset.current = activeIndex;
      } else if (activeIndex >= scrollOffset.current + listHeight) {
        scrollOffset.current = activeIndex - listHeight + 1;
      }
      if (scrollOffset.current < 0) scrollOffset.current = 0;
      if (scrollOffset.current > total - listHeight) {
        scrollOffset.current = Math.max(0, total - listHeight);
      }
    }
  }

  // Build visible row slice
  const start = scrollOffset.current;
  const end = Math.min(start + listHeight, filteredSkills.length);
  const topPad = start;
  const bottomPad = filteredSkills.length - end;

  const tabCounts = {
    installed: skills.filter(s => !s.hasUpdate).length,
    updates: skills.filter(s => s.hasUpdate).length,
    all: skills.length,
  };

  return (
    <Box flexDirection="column">
      <Box paddingX={1} paddingY={1} borderStyle="single" borderColor="dim">
        <Text bold color="cyan">Skills Manager</Text>
        <Box marginLeft={2}><Text dimColor>Skills across agent dirs — claude, codex, cursor, opencode, gemini and project-local. `r` for vault/restore.</Text></Box>
      </Box>

      {searchMode && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="cyan">/</Text><Text>{searchInput}</Text><Text dimColor>_</Text>
        </Box>
      )}

      <Box flexDirection="row" marginBottom={1} paddingX={1}>
        {TABS.map(tab => (
          <Box key={tab} marginRight={2}>
            <Text color={activeTab === tab ? 'cyan' : undefined} bold={activeTab === tab}>
              {tab} ({tabCounts[tab]})
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column" paddingX={1}>
        {filteredSkills.length === 0 && <Text dimColor>No skills found</Text>}

        {topPad > 0 && (
          <Box flexDirection="row">
            <Text dimColor>  ... {topPad} more above ...</Text>
          </Box>
        )}

        {filteredSkills.slice(start, end).map((skill) => {
          const isSelected = selectedNames.has(skill.name);
          const isActive = skill.name === activeSkillName;
          const indicator = isActive ? '▸ ' : '  ';
          const checkbox = isSelected ? '[x]' : '[ ]';
          const name = skill.name.slice(0, nameW).padEnd(nameW);
          const agents = agentBadge(skill.locations, agentW).padEnd(agentW);
          const source = (skill.source ?? 'unknown').slice(0, srcW).padEnd(srcW);
          const date = skill.updatedAt ? new Date(skill.updatedAt).toLocaleDateString() : '—';
          const updateIcon = skill.hasUpdate ? ' ↻' : '  ';

          return (
            <Box key={skill.name} flexDirection="row">
              <Text color={isActive ? 'cyan' : undefined} bold={isActive} inverse={isActive}>
                {indicator}{checkbox} {name} | {agents} | {source} | {date}{updateIcon}
              </Text>
            </Box>
          );
        })}

        {bottomPad > 0 && (
          <Box flexDirection="row">
            <Text dimColor>  ... {bottomPad} more below ...</Text>
          </Box>
        )}
      </Box>

      {lastActionResult && (
        <Box paddingX={1} paddingY={1}>
          <Text color="green">{lastActionResult}</Text>
        </Box>
      )}

      <Box paddingX={1} borderStyle="single" borderColor="dim" marginTop={1}>
        <Text dimColor>
          {selectedNames.size > 0 ? `Selected: ${selectedNames.size} ` : ''}
          {filteredSkills.length} skills | {activeIndex + 1}/{filteredSkills.length}
        </Text>
        <Box marginLeft={2}>
          <Text dimColor>j/k: Move | Space: Toggle | a: All | Enter: Details | u: Update | d: Delete | r: Vault/Restore | /: Search | Tab: Tab | q: Quit</Text>
        </Box>
      </Box>

      {confirmNode}
    </Box>
  );
};
