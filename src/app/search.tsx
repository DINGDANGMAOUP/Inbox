import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { LibraryBookRow } from '@/components/reader/library-book-row';
import { IconButton } from '@/components/reader/icon-button';
import { M3Screen, M3StatePanel } from '@/components/reader/m3';
import { m3Motion } from '@/components/reader/motion-presets';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol } from '@/components/reader/material-symbol';
import { useRouteSlideTransition } from '@/components/reader/route-slide-transition';
import { brand } from '@/constants/brand';
import { appThemeAssets } from '@/constants/theme-assets';
import { useReaderPreferences } from '@/hooks/use-reader-preferences';
import { authorLabel, bookTitleLabel, progressLabel } from '@/lib/library-book-labels';
import { listBooks } from '@/lib/reader-service';
import type { LibraryBook } from '@/types/reader';

function normalizedSearchText(book: LibraryBook) {
  return [
    bookTitleLabel(book),
    book.author,
    authorLabel(book.author),
    book.format,
    book.currentChapterTitle,
    progressLabel(book),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function SearchScreen() {
  const db = useSQLiteContext();
  const { resolvedAppTheme } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const inputRef = useRef<TextInput>(null);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const theme = brand.appThemes[resolvedAppTheme];
  const isDeepTheme = resolvedAppTheme === 'deep';

  const closeSearch = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    closeRoute();
  }, [closeRoute]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSearch();
      return true;
    });
    return () => subscription.remove();
  }, [closeSearch]);

  useEffect(() => {
    let mounted = true;
    listBooks(db)
      .then((items) => {
        if (mounted) {
          setBooks(items);
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
  }, [db]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(timer);
  }, []);

  const trimmedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!trimmedQuery) {
      return books.slice(0, 8);
    }
    return books.filter((book) => normalizedSearchText(book).includes(trimmedQuery));
  }, [books, trimmedQuery]);

  const resultLabel = trimmedQuery ? `${results.length} 个结果` : books.length ? '全部书籍' : '等待导入';

  return (
    <Animated.View style={[styles.routeShell, routeStyle]}>
      <M3Screen
        key={`search-screen-${resolvedAppTheme}`}
        theme={theme}
        backgroundSource={appThemeAssets[resolvedAppTheme].background}
        overlayColor={isDeepTheme ? 'rgba(8, 9, 6, 0.36)' : 'rgba(247, 243, 234, 0.78)'}>
        <ScrollView
          keyboardShouldPersistTaps="always"
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[styles.content, width >= 700 && styles.contentWide]}>
          <View style={[styles.searchHeader, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
            <IconButton
              icon="chevron.left"
              label="返回"
              tone="quiet"
              tintColor={theme.text}
              size="icon"
              style={[styles.headerButton, { backgroundColor: theme.surfaceContainer, borderColor: theme.line }]}
              onPress={closeSearch}
            />
            <View style={[styles.searchField, { backgroundColor: theme.surfaceContainer, borderColor: theme.line }]}>
              <MaterialSymbol name="magnifyingglass" color={theme.accent} description="搜索" decorative size={18} />
              <TextInput
                ref={inputRef}
                value={query}
                onChangeText={setQuery}
                placeholder="搜索书名、作者或章节"
                placeholderTextColor={theme.muted}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="搜索书架"
                style={[styles.searchInput, { color: theme.text }]}
              />
              {query ? (
                <M3Pressable onPress={() => setQuery('')} feedback="subtle" accessibilityLabel="清除搜索" style={styles.clearButton}>
                  <MaterialSymbol name="close" color={theme.muted} description="清除搜索" decorative size={17} />
                </M3Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.searchTitleBlock}>
            <Text style={[styles.kicker, { color: theme.accent }]}>SEARCH LIBRARY</Text>
            <Text style={[styles.title, { color: theme.text }]}>搜索书架</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>{resultLabel}</Text>
          </View>

          {loading ? (
            <M3StatePanel theme={theme} title="正在读取书架" artwork={<ActivityIndicator color={theme.accent} />} />
          ) : results.length ? (
            <View style={styles.resultList}>
              {results.map((book, index) => (
                <LibraryBookRow key={book.id} book={book} index={index} theme={resolvedAppTheme} />
              ))}
            </View>
          ) : (
            <Animated.View entering={m3Motion.fadeDown()} style={[styles.noResultPanel, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
              <View style={[styles.noResultIcon, { backgroundColor: theme.primaryContainer }]}>
                <MaterialSymbol name="magnifyingglass" color={theme.onPrimaryContainer} description="没有结果" decorative size={24} />
              </View>
              <Text style={[styles.noResultTitle, { color: theme.text }]}>没有找到这本书</Text>
              <Text style={[styles.noResultBody, { color: theme.muted }]}>换个书名、作者或章节关键词试试。</Text>
              <M3Pressable onPress={() => setQuery('')} feedback="subtle" style={[styles.resetButton, { backgroundColor: theme.primaryContainer }]}>
                <Text style={[styles.resetButtonText, { color: theme.onPrimaryContainer }]}>清除搜索</Text>
              </M3Pressable>
            </Animated.View>
          )}
        </ScrollView>
      </M3Screen>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  routeShell: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 44,
    gap: 20,
  },
  contentWide: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  searchHeader: {
    minHeight: 66,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    boxShadow: brand.shadow.card,
  },
  headerButton: {
    width: 46,
    height: 46,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchField: {
    flex: 1,
    minHeight: 46,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingLeft: 12,
    paddingRight: 6,
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  clearButton: {
    width: 36,
    height: 36,
    borderRadius: brand.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchTitleBlock: {
    gap: 4,
    paddingHorizontal: 8,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  resultList: {
    gap: 12,
  },
  noResultPanel: {
    minHeight: 260,
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    boxShadow: brand.shadow.card,
  },
  noResultIcon: {
    width: 58,
    height: 58,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noResultTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  noResultBody: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
  resetButton: {
    minHeight: 44,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
