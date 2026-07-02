import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { Suspense } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { brand } from '@/constants/brand';
import { migrateReaderDb } from '@/lib/reader-db';

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
