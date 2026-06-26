import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { Suspense } from 'react';
import { Text, useColorScheme, View } from 'react-native';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';

import { brand } from '@/constants/brand';
import { migrateReaderDb } from '@/lib/reader-db';

function LoadingShell() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: brand.colors.paper,
      }}>
      <Text style={{ color: brand.colors.ink, fontWeight: '800', fontSize: 18 }}>正在打开墨屿</Text>
    </View>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Suspense fallback={<LoadingShell />}>
        <SQLiteProvider databaseName="inbox-reader.db" onInit={migrateReaderDb} useSuspense>
          <Stack
            screenOptions={{
              headerShown: false,
              headerShadowVisible: false,
              contentStyle: { backgroundColor: brand.colors.paper },
            }}>
            <Stack.Screen name="index" />
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
  );
}
