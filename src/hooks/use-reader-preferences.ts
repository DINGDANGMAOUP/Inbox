import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { useColorScheme, type ColorSchemeName } from 'react-native';

import { getReaderPreferences, updateReaderPreferences } from '@/lib/reader-service';
import type { AppThemeMode, ReaderPreferences, ResolvedAppTheme } from '@/types/reader';

export const defaultReaderPreferences: ReaderPreferences = {
  appThemeMode: 'system',
  readerTheme: 'paper',
  fontSize: 19,
  lineHeight: 1.7,
  margin: 22,
  readingMode: 'scroll',
};

export function resolveAppTheme(mode: AppThemeMode, systemScheme?: ColorSchemeName): ResolvedAppTheme {
  if (mode === 'mist' || mode === 'deep') {
    return mode;
  }
  return systemScheme === 'dark' ? 'deep' : 'mist';
}

export function useReaderPreferences() {
  const db = useSQLiteContext();
  const systemColorScheme = useColorScheme();
  const [preferences, setPreferences] = useState<ReaderPreferences>(defaultReaderPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const resolvedAppTheme = resolveAppTheme(preferences.appThemeMode, systemColorScheme);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setLoading(true);
      getReaderPreferences(db)
        .then((nextPreferences) => {
          if (mounted) {
            setPreferences(nextPreferences);
          }
        })
        .finally(() => {
          if (mounted) {
            setLoading(false);
          }
        });

      return () => {
        mounted = false;
      };
    }, [db])
  );

  const updatePreferences = useCallback(
    async (nextPreferences: ReaderPreferences) => {
      setPreferences(nextPreferences);
      setSaving(true);
      try {
        await updateReaderPreferences(db, nextPreferences);
      } finally {
        setSaving(false);
      }
    },
    [db]
  );

  return {
    preferences,
    resolvedAppTheme,
    systemColorScheme,
    loading,
    saving,
    updatePreferences,
  };
}
