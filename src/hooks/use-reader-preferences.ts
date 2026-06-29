import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { getReaderPreferences, updateReaderPreferences } from '@/lib/reader-service';
import type { ReaderPreferences } from '@/types/reader';

export const defaultReaderPreferences: ReaderPreferences = {
  theme: 'mist',
  fontSize: 19,
  lineHeight: 1.7,
  margin: 22,
  readingMode: 'scroll',
};

export function useReaderPreferences() {
  const db = useSQLiteContext();
  const [preferences, setPreferences] = useState<ReaderPreferences>(defaultReaderPreferences);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    loading,
    saving,
    updatePreferences,
  };
}
