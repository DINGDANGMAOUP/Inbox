import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as Linking from 'expo-linking';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { brand } from '@/constants/brand';
import { migrateReaderDb } from '@/lib/reader-db';
import { importBookFromUri, type ImportBookProgress } from '@/lib/reader-service';

const navigationBackground = brand.appThemes.mist.background ?? brand.colors.paper;
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: navigationBackground,
    card: navigationBackground,
  },
};
const darkNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: navigationBackground,
    card: navigationBackground,
  },
};

function LoadingShell() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: navigationBackground,
      }}>
      <Text style={{ color: brand.colors.ink, fontWeight: '800', fontSize: 18 }}>正在打开墨屿</Text>
    </View>
  );
}

function externalBookUrl(url: string) {
  if (url.startsWith('content://') || url.startsWith('file://')) {
    return url;
  }

  if (url.startsWith('inbox:///')) {
    const path = decodeURIComponent(url.slice('inbox://'.length));
    const isKnownAppRoute = /^\/(?:reader|search|settings|app-settings|storage|about)(?:\/|$)/.test(path);
    if (isKnownAppRoute) {
      return null;
    }

    return /\.(?:epub|txt)(?:$|[?#])/i.test(path) ? `file://${path}` : null;
  }

  if (!url.startsWith('inbox://')) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('.documents')) {
      return `content://${parsed.hostname}${decodeURIComponent(parsed.pathname)}`;
    }
  } catch {
    return null;
  }

  return null;
}

function ExternalBookImportHandler() {
  const db = useSQLiteContext();
  const importingRef = useRef(false);
  const [importProgress, setImportProgress] = useState<ImportBookProgress | null>(null);

  const handleUrl = useCallback(
    async (url: string | null) => {
      const bookUrl = url ? externalBookUrl(url) : null;
      if (!bookUrl || importingRef.current) {
        return;
      }

      importingRef.current = true;
      try {
        const book = await importBookFromUri(db, bookUrl, setImportProgress);
        if (book) {
          router.replace({ pathname: '/reader/[id]', params: { id: book.id } });
        }
      } catch (error) {
        Alert.alert('导入失败', error instanceof Error ? error.message : '无法导入所选书籍。');
      } finally {
        setImportProgress(null);
        importingRef.current = false;
      }
    },
    [db],
  );

  useEffect(() => {
    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleUrl(url);
    });

    return () => subscription.remove();
  }, [handleUrl]);

  if (!importProgress) {
    return null;
  }

  const percent = Math.round(importProgress.progress * 100);
  return (
    <View pointerEvents="none" style={styles.externalImportOverlay}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={styles.externalImportPanel}>
        <ActivityIndicator color={brand.appThemes.mist.accent} />
        <View style={styles.externalImportCopy}>
          <Text numberOfLines={1} style={styles.externalImportTitle}>
            {importProgress.title}
          </Text>
          <Text numberOfLines={1} style={styles.externalImportDetail}>
            {importProgress.detail}
          </Text>
          <View style={styles.externalImportTrack}>
            <View style={[styles.externalImportFill, { width: `${Math.max(6, percent)}%` }]} />
          </View>
        </View>
        <Text style={styles.externalImportPercent}>{percent}%</Text>
      </View>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider value={colorScheme === 'dark' ? darkNavigationTheme : navigationTheme}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Suspense fallback={<LoadingShell />}>
          <SQLiteProvider databaseName="inbox-reader.db" onInit={migrateReaderDb} useSuspense>
            <Stack
              screenOptions={{
                headerShown: false,
                headerShadowVisible: false,
                contentStyle: { backgroundColor: navigationBackground },
              }}>
              <Stack.Screen name="index" />
              <Stack.Screen
                name="search"
                options={{
                  animation: 'none',
                  presentation: 'transparentModal',
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="settings"
                options={{
                  animation: 'none',
                  presentation: 'transparentModal',
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="app-settings"
                options={{
                  animation: 'none',
                  presentation: 'transparentModal',
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="storage"
                options={{
                  animation: 'none',
                  presentation: 'transparentModal',
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="about"
                options={{
                  animation: 'none',
                  presentation: 'transparentModal',
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="reader/[id]"
                options={{
                  animation: 'fade_from_bottom',
                }}
              />
              <Stack.Screen name="+not-found" />
            </Stack>
            <ExternalBookImportHandler />
          </SQLiteProvider>
        </Suspense>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  externalImportOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 1000,
    justifyContent: 'flex-end',
    padding: 20,
  },
  externalImportPanel: {
    minHeight: 76,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: brand.appThemes.mist.line,
    backgroundColor: brand.appThemes.mist.surfaceSolid,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 18px 34px rgba(18, 20, 15, 0.18)',
  },
  externalImportCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  externalImportTitle: {
    color: brand.appThemes.mist.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  externalImportDetail: {
    color: brand.appThemes.mist.muted,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  externalImportTrack: {
    height: 7,
    borderRadius: brand.radius.round,
    backgroundColor: brand.appThemes.mist.line,
    overflow: 'hidden',
  },
  externalImportFill: {
    height: '100%',
    borderRadius: brand.radius.round,
    backgroundColor: brand.appThemes.mist.accent,
  },
  externalImportPercent: {
    minWidth: 44,
    color: brand.appThemes.mist.accent,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
});
