import React, { useState, useEffect } from 'react';
import { Text, Box, useInput } from 'ink';

interface SearchInputProps {
  query: string;
  onChange: (query: string) => void;
  onExit: () => void;
  active: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({ 
  query, 
  onChange, 
  onExit, 
  active 
}) => {
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  useInput((input, key) => {
    if (!active) return;
    
    if (key.return) {
      onChange(localQuery);
      onExit();
    } else if (key.escape) {
      onExit();
    } else if (key.backspace) {
      setLocalQuery(prev => prev.slice(0, -1));
    } else if (input && !key.ctrl && !key.meta) {
      setLocalQuery(prev => prev + input);
    }
  });

  if (!active) return null;

  return (
    <Box flexDirection="row" marginBottom={1} paddingX={1}>
      <Text color="cyan">/</Text>
      <Text>{localQuery}</Text>
      <Text dimColor>_</Text>
    </Box>
  );
};