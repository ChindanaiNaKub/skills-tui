import React from 'react';
import { Text, Box } from 'ink';

interface ConfirmDialogProps {
  action: 'remove' | 'update';
  skillNames: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ 
  action, 
  skillNames, 
  onConfirm, 
  onCancel 
}) => {
  const verb = action === 'remove' ? 'Remove' : 'Update';

  return (
    <Box 
      flexDirection="column" 
      paddingX={4} 
      paddingY={2} 
      borderStyle="round"
      borderColor="yellow"
      marginTop={2}
    >
      <Text bold>{verb} {skillNames.length} skill(s)?</Text>
      <Box marginTop={1} marginBottom={1}>
        {skillNames.map(name => (
          <Text key={name} dimColor>  • {name}</Text>
        ))}
      </Box>
      <Box flexDirection="row">
        <Box marginRight={2}>
          <Text color="green">[y] Yes</Text>
        </Box>
        <Text color="red">[n] No</Text>
      </Box>
    </Box>
  );
};