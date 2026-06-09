import React, { useMemo } from 'react';
import { Text, Box, useInput } from 'ink';
import { SkillWithMeta, Tab } from '../types.js';
import truncate from 'cli-truncate';

interface SkillListProps {
  skills: SkillWithMeta[];
  filteredSkills: SkillWithMeta[];
  selectedIndices: Set<number>;
  activeIndex: number;
  onSelect: (index: number) => void;
  onToggleSelect: (index: number) => void;
  searchQuery: string;
  activeTab: Tab;
  showDetails: boolean;
  detailIndex: number | null;
}

export const SkillList: React.FC<SkillListProps> = ({
  skills,
  filteredSkills,
  selectedIndices,
  activeIndex,
  onSelect,
  onToggleSelect,
  searchQuery,
  activeTab,
  showDetails,
  detailIndex,
}) => {
  const tabLabel = (tab: Tab) => {
    const counts = {
      installed: skills.filter(s => !s.hasUpdate).length,
      updates: skills.filter(s => s.hasUpdate).length,
      all: skills.length,
    };
    return `${tab} (${counts[tab]})`;
  };

  if (showDetails && detailIndex !== null && filteredSkills[detailIndex]) {
    const skill = filteredSkills[detailIndex];
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text bold underline>{skill.name}</Text>
        <Text dimColor>Source:</Text> <Text> {skill.source}</Text>
        <Text dimColor>Repo:</Text> <Text> {skill.sourceUrl}</Text>
        <Text dimColor>Path:</Text> <Text> {skill.skillPath}</Text>
        <Text dimColor>Installed:</Text> <Text> {new Date(skill.installedAt).toLocaleString()}</Text>
        <Text dimColor>Updated:</Text> <Text> {new Date(skill.updatedAt).toLocaleString()}</Text>
        <Text dimColor>Hash:</Text> <Text dimColor> {skill.skillFolderHash}</Text>
        {skill.pluginName && <><Text dimColor>Plugin:</Text> <Text> {skill.pluginName}</Text></>}
        {skill.hasUpdate && <Text color="green" bold>Update available!</Text>}
        <Box marginTop={1}>
          <Text dimColor>Press Esc to go back</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" marginBottom={1}>
        {(['installed', 'updates', 'all'] as Tab[]).map(tab => (
          <Box key={tab} marginRight={2}>
            <Text 
              bold={activeTab === tab}
              color={activeTab === tab ? 'cyan' : 'white'}
            >
              {tabLabel(tab)}
            </Text>
          </Box>
        ))}
      </Box>
      <Box flexDirection="column">
        {filteredSkills.map((skill, idx) => {
          const isSelected = selectedIndices.has(idx);
          const isActive = activeIndex === idx;
          const prefix = isSelected ? '[x]' : '[ ]';
          const indicator = isActive ? '▸ ' : '  ';
          
          let nameColor: 'white' | 'green' | 'yellow' | 'red' = 'white';
          if (skill.hasUpdate) nameColor = 'green';
          
          const name = truncate(skill.name, 30);
          const source = truncate(skill.source, 40);
          const date = new Date(skill.updatedAt).toLocaleDateString();
          
          return (
            <Box 
              key={skill.name}
              flexDirection="row"
              backgroundColor={isActive ? 'blue' : undefined}
            >
              <Text color={isActive ? 'cyan' : 'white'}>{indicator}</Text>
              <Text color={isActive ? 'cyan' : 'yellow'}>{prefix} </Text>
              <Text color={nameColor} bold={isActive}>{name}</Text>
              <Text dimColor> | </Text>
              <Text dimColor>{source}</Text>
              <Text dimColor> | </Text>
              <Text dimColor>{date}</Text>
              {skill.hasUpdate && <Text color="green" bold> ↻</Text>}
            </Box>
          );
        })}
        {filteredSkills.length === 0 && (
          <Box paddingTop={2} paddingBottom={2}>
            <Text dimColor>No skills found</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};