import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as Linking from 'expo-linking';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { Alert, Text, useColorScheme, View } from 'react-native';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { brand } from '@/constants/brand';
import { migrateReaderDb } from '@/lib/reader-db';
import { importBookFromUri } from '@/lib/reader-service';

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

function isExternalBookUrl(url: string) {
  return url.startsWith('content://') || url.startsWith('file://');
}

function ExternalBookImportHandler() {
  const db = useSQLiteContext();
  const importingRef = useRef(false);

  const handleUrl = useCallback(
    async (url: string | null) => {
      if (!url || !isExternalBookUrl(url) || importingRef.current) {
        return;
      }

      importingRef.current = true;
      try {
        const book = await importBookFromUri(db, url);
        if (book) {
          router.replace({ pathname: '/reader/[id]', params: { id: book.id } });
        }
      } catch (error) {
        Alert.alert('导入失败', error instanceof Error ? error.message : '无法导入所选书籍。');
      } finally {
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

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ThemeProvider value={colorScheme === 'dark' ? darkNavigationTheme : navigationTheme}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Suspense fallback={<LoadingShell />}>
          <SQLiteProvider databaseName="inbox-reader.db" onInit={migrateReaderDb} useSuspense>
            <ExternalBookImportHandler />
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
            </Stack>
          </SQLiteProvider>
        </Suspense>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
