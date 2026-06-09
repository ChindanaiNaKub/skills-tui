import React from 'react';
import { Text, Box } from 'ink';
import { AppState } from '../types.js';

interface StatusBarProps {
  state: AppState;
  activeIndex: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ state, activeIndex }) => {
  const { skills, filteredSkills, selectedIndices, loading, error, showDetails } = state;
  
  if (showDetails) {
    return (
      <Box flexDirection="row" paddingX={1} backgroundColor="black">
        <Text dimColor>Esc: Back | q: Quit</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="row" paddingX={1} backgroundColor="black">
        <Text color="cyan">Loading...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="row" paddingX={1} backgroundColor="black">
        <Text color="red">Error: {error}</Text>
      </Box>
    );
  }

  const selectedCount = selectedIndices.size;
  const totalCount = filteredSkills.length;
  const currentSkill = filteredSkills[activeIndex];

  return (
    <Box flexDirection="row" paddingX={1} backgroundColor="black">
      <Text dimColor>
        {selectedCount > 0 ? `Selected: ${selectedCount} ` : ''}
        {totalCount} skills | {activeIndex + 1}/{totalCount}
      </Text>
      {currentSkill?.hasUpdate && (
        <Box marginLeft={2}>
          <Text color="green" bold>Update available for {currentSkill.name}</Text>
        </Box>
      )}
      <Box marginLeft={2}>
        <Text dimColor>
          ↑↓: Navigate | Space: Toggle | Enter: Details | u: Update | d: Delete | /: Search | Tab: Switch tab | q: Quit
        </Text>
      </Box>
    </Box>
  );
};