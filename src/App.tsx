import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Text, Box, useInput, useApp, useStdout } from 'ink';
import { SkillWithMeta, Tab } from './types.js';
import { loadSkills } from './data.js';
import { removeSkills } from './actions.js';

const TABS: Tab[] = ['installed', 'updates', 'all'];
const OVERHEAD_ROWS = 8;

export const App: React.FC = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows ?? 40;
  const listHeight = Math.max(5, terminalHeight - OVERHEAD_ROWS);

  const [skills, setSkills] = useState<SkillWithMeta[]>([]);
  const [filteredSkills, setFilteredSkills] = useState<SkillWithMeta[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndices, setSelected] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{action: 'remove' | 'update'; skillNames: string[]} | null>(null);
  const [lastActionResult, setLastActionResult] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const scrollOffset = useRef(0);

  // Refs for latest state in useInput callback
  const refs = useRef({
    activeIndex: 0,
    filteredSkills: [] as SkillWithMeta[],
    searchMode: false,
    confirmDialog: null as {action: 'remove' | 'update'; skillNames: string[]} | null,
    showDetails: false,
    selectedIndices: new Set<number>(),
    activeTab: 'all' as Tab,
    searchQuery: '',
  });
  refs.current = { activeIndex, filteredSkills, searchMode, confirmDialog, showDetails, selectedIndices, activeTab, searchQuery };

  // Load skills
  useEffect(() => {
    const loaded = loadSkills();
    setSkills(loaded);
    setFilteredSkills(loaded);
  }, []);

  // Scroll window adjustment
  useEffect(() => {
    const total = filteredSkills.length;
    if (total === 0 || showDetails) {
      return;
    }
    if (activeIndex < scrollOffset.current) {
      scrollOffset.current = activeIndex;
    } else if (activeIndex >= scrollOffset.current + listHeight) {
      scrollOffset.current = activeIndex - listHeight + 1;
    }
    if (scrollOffset.current < 0) scrollOffset.current = 0;
    if (scrollOffset.current > total - listHeight) {
      scrollOffset.current = Math.max(0, total - listHeight);
    }
  }, [activeIndex, filteredSkills.length, listHeight, showDetails]);

  const applyFilters = useCallback((src: SkillWithMeta[], q: string, tab: Tab): SkillWithMeta[] => {
    let filtered = src;
    if (tab === 'installed') filtered = filtered.filter(s => !s.hasUpdate);
    else if (tab === 'updates') filtered = filtered.filter(s => s.hasUpdate);
    if (q) {
      const lq = q.toLowerCase();
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(lq) ||
        s.source.toLowerCase().includes(lq) ||
        (s.pluginName?.toLowerCase().includes(lq))
      );
    }
    return filtered;
  }, []);

  const reloadSkills = useCallback(() => {
    const loaded = loadSkills();
    const r = refs.current;
    setSkills(loaded);
    setFilteredSkills(applyFilters(loaded, r.searchQuery, r.activeTab));
  }, [applyFilters]);

  useInput((input, key) => {
    const r = refs.current;

    if (r.confirmDialog) {
      if (input === 'y') {
        const { action, skillNames } = r.confirmDialog;
        if (action === 'remove') {
          const result = removeSkills(skillNames);
          let msg = '';
          if (result.success.length > 0) msg += `Removed: ${result.success.join(', ')}`;
          if (result.failed.length > 0) msg += (msg ? ' | ' : '') + `Failed: ${result.failed.join(', ')}`;
          setLastActionResult(msg || 'No skills removed');
          reloadSkills();
        } else {
          setLastActionResult('Update not yet implemented - use `npx skills update`');
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

    if (r.searchMode) {
      if (key.return) {
        setSearchQuery(searchInput);
        setFilteredSkills(applyFilters(skills, searchInput, r.activeTab));
        setActiveIndex(0);
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
      setActiveIndex(prev => {
        const len = r.filteredSkills.length;
        if (len === 0) return prev;
        return (((prev - 1) % len) + len) % len;
      });
      return;
    }

    if (key.downArrow || input === 'j') {
      setActiveIndex(prev => {
        const len = r.filteredSkills.length;
        if (len === 0) return prev;
        return (prev + 1) % len;
      });
      return;
    }

    if (input === ' ') {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(r.activeIndex)) {
          next.delete(r.activeIndex);
        } else {
          next.add(r.activeIndex);
        }
        return next;
      });
      return;
    }

    if (key.return) {
      if (r.showDetails) {
        setShowDetails(false);
        setDetailIndex(null);
      } else {
        const detailSkill = r.filteredSkills[r.activeIndex];
        if (detailSkill) {
          setShowDetails(true);
          setDetailIndex(r.activeIndex);
        }
      }
      return;
    }

    if (input === 'u') {
      const indices = Array.from(r.selectedIndices);
      const cur = r.activeIndex;
      if (indices.length === 0 && r.filteredSkills[cur]) indices.push(cur);
      if (indices.length > 0) {
        setConfirmDialog({ action: 'update', skillNames: indices.map(i => r.filteredSkills[i].name) });
      }
      return;
    }

    if (input === 'd') {
      const indices = Array.from(r.selectedIndices);
      const cur = r.activeIndex;
      if (indices.length === 0 && r.filteredSkills[cur]) indices.push(cur);
      if (indices.length > 0) {
        setConfirmDialog({ action: 'remove', skillNames: indices.map(i => r.filteredSkills[i].name) });
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
      setActiveTab(newTab);
      setActiveIndex(0);
      setFilteredSkills(applyFilters(skills, r.searchQuery, newTab));
      setSearchQuery('');
      return;
    }

    if (key.escape) {
      if (r.showDetails) {
        setShowDetails(false);
        setDetailIndex(null);
      } else {
        exit();
      }
      return;
    }

    if (input === 'q') exit();
  });

  // ---- RENDER (all hooks are above, no conditional returns before this) ----

  const detailSkill = showDetails && detailIndex !== null ? filteredSkills[detailIndex] : null;

  if (detailSkill) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold underline>{detailSkill.name}</Text>
        <Box marginTop={1}><Text dimColor>Source:</Text><Text> {detailSkill.source}</Text></Box>
        <Box><Text dimColor>Repo:</Text><Text> {detailSkill.sourceUrl}</Text></Box>
        <Box><Text dimColor>Path:</Text><Text> {detailSkill.skillPath}</Text></Box>
        <Box><Text dimColor>Installed:</Text><Text> {new Date(detailSkill.installedAt).toLocaleString()}</Text></Box>
        <Box><Text dimColor>Updated:</Text><Text> {new Date(detailSkill.updatedAt).toLocaleString()}</Text></Box>
        <Box><Text dimColor>Hash:</Text><Text dimColor> {detailSkill.skillFolderHash}</Text></Box>
        {detailSkill.pluginName && <Box><Text dimColor>Plugin:</Text><Text> {detailSkill.pluginName}</Text></Box>}
        {detailSkill.hasUpdate && <Box marginTop={1}><Text color="green" bold>Update available!</Text></Box>}
        <Box marginTop={2}><Text dimColor>Esc: Back | q: Quit</Text></Box>
      </Box>
    );
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
        <Box marginLeft={2}><Text dimColor>Interactive skill manager for ~/.agents/skills</Text></Box>
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

        {filteredSkills.slice(start, end).map((skill, sliceIdx) => {
          const idx = start + sliceIdx;
          const isSelected = selectedIndices.has(idx);
          const isActive = idx === activeIndex;
          const indicator = isActive ? '▸ ' : '  ';
          const checkbox = isSelected ? '[x]' : '[ ]';
          const name = skill.name.slice(0, 30).padEnd(30);
          const source = skill.source.slice(0, 30).padEnd(30);
          const date = new Date(skill.updatedAt).toLocaleDateString();
          const updateIcon = skill.hasUpdate ? ' ↻' : '  ';

          return (
            <Box key={skill.name} flexDirection="row">
              <Text color={isActive ? 'cyan' : undefined} bold={isActive} inverse={isActive}>
                {indicator}{checkbox} {name} | {source} | {date}{updateIcon}
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
          {selectedIndices.size > 0 ? `Selected: ${selectedIndices.size} ` : ''}
          {filteredSkills.length} skills | {activeIndex + 1}/{filteredSkills.length}
        </Text>
        <Box marginLeft={2}>
          <Text dimColor>j/k or ↑↓: Navigate | Space: Toggle | Enter: Details | u: Update | d: Delete | /: Search | Tab: Tab | q: Quit</Text>
        </Box>
      </Box>

      {confirmDialog && (
        <Box flexDirection="column" paddingX={4} paddingY={2} borderStyle="round" borderColor="yellow" marginTop={2}>
          <Text bold>{confirmDialog.action === 'remove' ? 'Remove' : 'Update'} {confirmDialog.skillNames.length} skill(s)?</Text>
          <Box marginTop={1} marginBottom={1}>
            {confirmDialog.skillNames.map(n => (
              <Text key={n} dimColor>  • {n}</Text>
            ))}
          </Box>
          <Box flexDirection="row">
            <Box marginRight={2}><Text color="green">[y] Yes</Text></Box>
            <Text color="red">[n] No</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};