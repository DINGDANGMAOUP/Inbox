import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { BookCover } from '@/components/reader/book-cover';
import { IconButton } from '@/components/reader/icon-button';
import { M3FilterChip, M3Screen, M3StatePanel } from '@/components/reader/m3';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { appThemeAssets } from '@/constants/theme-assets';
import { useReaderPreferences } from '@/hooks/use-reader-preferences';
import { cleanChapterTitle } from '@/lib/text-utils';
import { deleteBook, importBook, listBooks } from '@/lib/reader-service';
import type { LibraryBook, ResolvedAppTheme } from '@/types/reader';

type LibraryFilter = 'all' | 'reading' | 'unread';

const libraryFilters: { value: LibraryFilter; label: string; icon: MaterialSymbolName }[] = [
  { value: 'all', label: '全部', icon: 'bookmark' },
  { value: 'reading', label: '在读', icon: 'textformat.size' },
  { value: 'unread', label: '未开始', icon: 'tray.and.arrow.down' },
];

function authorLabel(author: string) {
  return author === 'Local file' ? '本地文件' : author;
}

function bookTitleLabel(book: Pick<LibraryBook, 'title'>) {
  return cleanChapterTitle(book.title, book.title || '未命名书籍');
}

function chapterLabel(title?: string | null) {
  return cleanChapterTitle(title, '阅读中')
    .replace(/^Part\s+(\d+)$/i, '第 $1 部分')
    .replace(/^Chapter\s+(\d+)$/i, '第 $1 章');
}

function hasReadingProgress(book: LibraryBook) {
  return Boolean(book.progressChapterId);
}

function bookProgressPercent(book: LibraryBook) {
  if (!hasReadingProgress(book)) {
    return null;
  }

  const chapterOrder = Math.max(0, book.currentChapterOrder ?? 0);
  const chapterRatio = Math.max(0, Math.min(1, book.progressRatio ?? 0));
  const totalChapters = Math.max(1, book.totalChapters);
  return Math.max(0, Math.min(100, Math.round(((chapterOrder + chapterRatio) / totalChapters) * 100)));
}

function progressLabel(book: LibraryBook) {
  if (!hasReadingProgress(book)) {
    return '未开始';
  }
  const percent = bookProgressPercent(book) ?? 0;
  if (percent === 0) {
    return `已打开 · ${chapterLabel(book.currentChapterTitle)}`;
  }
  return `${percent}% · ${chapterLabel(book.currentChapterTitle)}`;
}

function statusLabel(book: LibraryBook) {
  return hasReadingProgress(book) ? '继续' : '打开';
}

function BrandSeal() {
  return (
    <View style={styles.brandSeal}>
      <Image source={brandAssets.logoMark} contentFit="cover" transition={160} style={styles.brandSealImage} />
    </View>
  );
}

function MetricPill({ value, label, tone }: { value: string | number; label: string; tone: 'warm' | 'cool' | 'quiet' }) {
  const toneStyle =
    tone === 'warm' ? styles.warmMetricPill : tone === 'cool' ? styles.coolMetricPill : styles.quietMetricPill;
  return (
    <View style={[styles.metricPill, toneStyle]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function BookTile({
  book,
  index,
  theme,
  onDelete,
}: {
  book: LibraryBook;
  index: number;
  theme: ResolvedAppTheme;
  onDelete: (book: LibraryBook) => void;
}) {
  const fillPercent = bookProgressPercent(book) ?? 0;
  const themeToken = brand.appThemes[theme];

  return (
    <Animated.View
      entering={FadeInDown.delay(index * motion.stagger.listItem).duration(motion.duration.medium)}
      exiting={FadeOut.duration(motion.duration.short)}
      layout={LinearTransition.duration(motion.duration.medium)}
      style={styles.tile}>
      <M3Pressable
        onPress={() => router.push({ pathname: '/reader/[id]', params: { id: book.id } })}
        onLongPress={() => onDelete(book)}
        feedback="subtle"
        style={[
          styles.tilePressable,
          { backgroundColor: themeToken.surfaceSolid, borderColor: themeToken.line },
        ]}>
        <BookCover book={book} size="small" theme={theme} />
        <View style={styles.tileCopy}>
          <View style={styles.tileTopRow}>
            <Text numberOfLines={2} style={[styles.tileTitle, { color: themeToken.text }]}>
              {bookTitleLabel(book)}
            </Text>
            <View style={[styles.formatPill, { backgroundColor: themeToken.surface, borderColor: themeToken.line }]}>
              <Text style={[styles.formatPillText, { color: themeToken.accent }]}>{book.format.toUpperCase()}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={[styles.tileMeta, { color: themeToken.muted }]}>
            {authorLabel(book.author)}
          </Text>
          <View style={styles.tileProgressRow}>
            <Text numberOfLines={1} style={[styles.progressText, { color: themeToken.muted }]}>
              {progressLabel(book)}
            </Text>
            <View style={[styles.tileAction, { backgroundColor: themeToken.text }]}>
              <Text style={[styles.tileStatus, { color: themeToken.surfaceSolid }]}>{statusLabel(book)}</Text>
            </View>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: themeToken.line }]}>
            <View style={[styles.progressFill, { width: `${fillPercent}%`, backgroundColor: themeToken.accent }]} />
          </View>
        </View>
      </M3Pressable>
    </Animated.View>
  );
}

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const { resolvedAppTheme } = useReaderPreferences();
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activeTheme = resolvedAppTheme;
  const theme = brand.appThemes[activeTheme];
  const isDeepTheme = activeTheme === 'deep';
  const ambientTextColor = isDeepTheme ? brand.colors.white : theme.text;
  const ambientMutedColor = isDeepTheme ? 'rgba(255, 255, 255, 0.76)' : theme.muted;

  const filteredBooks = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return books.filter((book) => {
      const matchesQuery = !trimmed || `${bookTitleLabel(book)} ${book.author}`.toLowerCase().includes(trimmed);
      const matchesFilter = filter === 'all' || (filter === 'reading' ? hasReadingProgress(book) : !hasReadingProgress(book));
      return matchesQuery && matchesFilter;
    });
  }, [books, filter, query]);

  const featuredBook = query.trim() ? null : books.find(hasReadingProgress) ?? books[0];
  const featuredStarted = featuredBook ? hasReadingProgress(featuredBook) : false;
  const featuredProgressPercent = featuredBook ? bookProgressPercent(featuredBook) : null;
  const shelfPreview = query.trim() ? filteredBooks.slice(0, 6) : books.slice(0, 6);

  const startedCount = useMemo(() => {
    return books.filter(hasReadingProgress).length;
  }, [books]);
  const unreadCount = Math.max(0, books.length - startedCount);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBooks(await listBooks(db));
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleImport = useCallback(async () => {
    setImporting(true);
    try {
      const imported = await importBook(db);
      await refresh();
      if (imported) {
        setQuery('');
        setNotice(`已收进书架：${imported.title}`);
        setTimeout(() => setNotice(null), 3600);
      }
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '无法导入所选书籍。');
    } finally {
      setImporting(false);
    }
  }, [db, refresh]);

  const handleDelete = useCallback(
    (book: LibraryBook) => {
      Alert.alert('移除这本书？', `“${book.title}”及其本地笔记会从这台设备删除。`, [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          style: 'destructive',
          onPress: async () => {
            await deleteBook(db, book.id);
            await refresh();
          },
        },
      ]);
    },
    [db, refresh]
  );

  return (
    <M3Screen
      key={`library-screen-${activeTheme}`}
      theme={theme}
      backgroundSource={appThemeAssets[activeTheme].background}
      overlayColor={isDeepTheme ? 'rgba(5, 6, 8, 0.58)' : 'rgba(248, 245, 238, 0.76)'}>
      <ScrollView
        style={styles.scroller}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={loading && books.length > 0} onRefresh={refresh} />}
        contentContainerStyle={styles.content}>
        <View style={styles.topAppBar}>
          <View style={styles.brandRow}>
            <BrandSeal />
            <View style={styles.heroText}>
              <Image source={isDeepTheme ? brandAssets.wordmarkLight : brandAssets.wordmark} contentFit="contain" transition={160} style={styles.wordmark} />
            </View>
          </View>
          <View style={styles.utilityRow}>
            <IconButton
              tone="quiet"
              icon="settings"
              label="设置"
              tintColor="#F7F0E4"
              size="icon"
              style={styles.appBarIconButton}
              onPress={() => router.push('/settings')}
            />
            <IconButton
              tone="quiet"
              icon="info"
              label="关于"
              tintColor="#F7F0E4"
              size="icon"
              style={styles.appBarIconButton}
              onPress={() => router.push('/about')}
            />
          </View>
        </View>

        <View style={styles.libraryHero}>
          <View style={styles.libraryHeroTop}>
            <View style={styles.heroCopyBlock}>
              <Text style={styles.eyebrow}>PRIVATE LIBRARY</Text>
              <Text style={styles.heroTitle}>安静地读{'\n'}利落地收</Text>
            </View>
            <View style={styles.metricGrid}>
              <MetricPill value={books.length} label="藏书" tone="warm" />
              <MetricPill value={startedCount} label="在读" tone="cool" />
              <MetricPill value={unreadCount} label="未开" tone="quiet" />
            </View>
          </View>
          <View style={styles.commandRow}>
            <View style={styles.searchBar}>
              <MaterialSymbol name="magnifyingglass" color="rgba(245, 239, 228, 0.62)" description="搜索书架" size={18} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="搜索书名或作者"
                placeholderTextColor="rgba(245, 239, 228, 0.48)"
                autoCapitalize="none"
                style={styles.searchInput}
              />
            </View>
            <IconButton
              tone="filled"
              icon="plus"
              label={importing ? '导入中' : '导入'}
              size="icon"
              disabled={importing}
              tintColor="#161711"
              onPress={handleImport}
              style={styles.heroImportButton}
            />
          </View>
          <View style={styles.metricGrid}>
            {libraryFilters.map((item) => {
              const active = filter === item.value;
              const count = item.value === 'all' ? books.length : item.value === 'reading' ? startedCount : unreadCount;
              return (
                <M3FilterChip
                  key={item.value}
                  theme={{
                    ...theme,
                    surface: 'rgba(255, 255, 255, 0.10)',
                    surfaceContainer: 'rgba(255, 255, 255, 0.10)',
                    primaryContainer: '#E7D9B7',
                    onPrimaryContainer: '#1B1710',
                    text: '#F8F1E6',
                    muted: 'rgba(248, 241, 230, 0.62)',
                    accent: '#E7D9B7',
                    line: 'rgba(255, 255, 255, 0.14)',
                  }}
                  selected={active}
                  label={item.label}
                  count={count}
                  icon={item.icon}
                  onPress={() => setFilter(item.value)}
                />
              );
            })}
          </View>
        </View>

      {notice && (
        <Animated.View entering={FadeInDown.duration(motion.duration.medium)} exiting={FadeOut.duration(motion.duration.short)} style={styles.notice}>
          <Text numberOfLines={2} style={styles.noticeText}>
            {notice}
          </Text>
        </Animated.View>
      )}

      {!!query.trim() && (
        <Animated.View
          entering={FadeInDown.duration(motion.duration.short)}
          exiting={FadeOut.duration(motion.duration.short)}
          style={[styles.searchContext, { backgroundColor: theme.surface, borderColor: theme.line }]}>
          <Text style={styles.searchContextText}>正在筛选书架</Text>
          <M3Pressable onPress={() => setQuery('')} hitSlop={8} feedback="subtle">
            <Text style={styles.clearSearchText}>清除</Text>
          </M3Pressable>
        </Animated.View>
      )}

      {featuredBook && (
        <Animated.View entering={FadeInDown.duration(motion.duration.medium)}>
          <M3Pressable
            onPress={() => router.push({ pathname: '/reader/[id]', params: { id: featuredBook.id } })}
            feedback="subtle"
            style={[
              styles.featured,
              { backgroundColor: theme.surfaceSolid, borderColor: theme.line },
            ]}>
            <View style={styles.featuredCoverColumn}>
              <BookCover book={featuredBook} size="hero" theme={activeTheme} />
            </View>
            <View style={styles.featuredCopy}>
              <View style={styles.featuredHeaderRow}>
                <Text style={styles.sectionKicker}>{featuredStarted ? '继续阅读' : '最近导入'}</Text>
                <View style={[styles.featuredStatusChip, { backgroundColor: theme.text }]}>
                  <Text style={[styles.featuredStatusText, { color: theme.surfaceSolid }]}>{statusLabel(featuredBook)}</Text>
                </View>
              </View>
              <Text numberOfLines={2} style={[styles.featuredTitle, { color: theme.text }]}>
                {bookTitleLabel(featuredBook)}
              </Text>
              <Text numberOfLines={1} style={[styles.featuredMeta, { color: theme.muted }]}>
                {progressLabel(featuredBook)}
              </Text>
              <View style={styles.featuredFooter}>
                <View style={styles.featuredProgressGroup}>
                  <View style={[styles.featuredProgressTrack, { backgroundColor: theme.surfaceVariant }]}>
                    <View style={[styles.featuredProgressFill, { width: `${featuredProgressPercent ?? 0}%` }]} />
                  </View>
                  <Text style={[styles.featuredProgressLabel, { color: theme.muted }]}>
                    {featuredProgressPercent === null ? '尚未开始' : `${featuredProgressPercent}% 已读`}
                  </Text>
                </View>
                <View style={styles.readButton}>
                  <Text style={styles.readButtonText}>阅读</Text>
                  <MaterialSymbol name="chevron.right" color="#F7F0E4" description="开始阅读" size={17} />
                </View>
              </View>
            </View>
          </M3Pressable>
        </Animated.View>
      )}

      {shelfPreview.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.coverRail}>
          {shelfPreview.map((book, index) => (
            <Animated.View key={`cover-${book.id}`} entering={FadeInDown.delay(index * 36).duration(motion.duration.medium)}>
              <M3Pressable
                onPress={() => router.push({ pathname: '/reader/[id]', params: { id: book.id } })}
                onLongPress={() => handleDelete(book)}
                feedback="subtle"
                style={styles.coverRailItem}>
                <BookCover book={book} size="small" theme={activeTheme} />
              </M3Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionKickerDark}>书架</Text>
          <Text style={[styles.sectionTitle, { color: ambientTextColor }]}>{filter === 'reading' ? '继续阅读' : filter === 'unread' ? '未开始' : '全部书籍'}</Text>
        </View>
        <Text style={[styles.count, { color: ambientMutedColor }]}>{filteredBooks.length} 本书</Text>
      </View>

      {loading && books.length === 0 ? (
        <M3StatePanel theme={theme} title="正在整理书架" artwork={<ActivityIndicator color={theme.accent} />} />
      ) : filteredBooks.length === 0 ? (
        <M3StatePanel
          theme={theme}
          title={query ? '没有匹配的书' : '导入第一本书'}
          body="支持 EPUB 与 TXT。"
          artwork={<BrandSeal />}
          order={1}>
          {!query.trim() && (
            <View style={styles.emptyCapabilityRow}>
              <EmptyCapability theme={activeTheme} label="EPUB" />
              <EmptyCapability theme={activeTheme} label="TXT" />
            </View>
          )}
          <IconButton
            icon="tray.and.arrow.down"
            label={importing ? '导入中' : '选择文件'}
            tintColor={theme.onPrimaryContainer}
            style={{ backgroundColor: theme.primaryContainer, borderColor: theme.line }}
            disabled={importing}
            onPress={handleImport}
          />
        </M3StatePanel>
      ) : (
        <View style={styles.shelfList}>
          {filteredBooks.map((book, index) => (
            <BookTile key={book.id} book={book} index={index} theme={activeTheme} onDelete={handleDelete} />
          ))}
        </View>
      )}
      </ScrollView>
    </M3Screen>
  );
}

function EmptyCapability({ theme, label }: { theme: ResolvedAppTheme; label: string }) {
  const token = brand.appThemes[theme];
  return (
    <View style={[styles.emptyCapability, { backgroundColor: token.surface, borderColor: token.line }]}>
      <Text style={[styles.emptyCapabilityText, { color: token.accent }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroller: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 42,
    paddingBottom: 118,
    gap: 18,
  },
  topAppBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    minHeight: 54,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
  },
  brandSeal: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: '#F3E9D2',
    boxShadow: '0 12px 28px rgba(0, 0, 0, 0.20)',
  },
  brandSealImage: {
    width: '100%',
    height: '100%',
  },
  heroText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  eyebrow: {
    color: '#D8C59A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  wordmark: {
    width: 132,
    height: 46,
    marginLeft: -4,
  },
  utilityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  appBarIconButton: {
    width: 44,
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 0,
    backgroundColor: '#151611',
    borderColor: 'rgba(255, 255, 255, 0.10)',
    boxShadow: '0 12px 26px rgba(0, 0, 0, 0.16)',
  },
  libraryHero: {
    borderRadius: 30,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: '#151611',
    padding: 18,
    gap: 18,
    overflow: 'hidden',
    boxShadow: '0 24px 54px rgba(0, 0, 0, 0.28)',
  },
  libraryHeroTop: {
    gap: 16,
  },
  heroCopyBlock: {
    gap: 8,
  },
  heroTitle: {
    maxWidth: 260,
    color: '#F7F0E4',
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricPill: {
    minWidth: 74,
    minHeight: 58,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'center',
    gap: 1,
  },
  warmMetricPill: {
    backgroundColor: '#E7D9B7',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  coolMetricPill: {
    backgroundColor: '#BFD6C3',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  quietMetricPill: {
    backgroundColor: '#F0ECE2',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  metricValue: {
    color: '#14130F',
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: 'rgba(20, 19, 15, 0.68)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  commandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchBar: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.075)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    color: '#F7F0E4',
    fontSize: 15,
    fontWeight: '800',
  },
  heroImportButton: {
    width: 52,
    minWidth: 52,
    minHeight: 52,
    paddingHorizontal: 0,
    backgroundColor: '#E7D9B7',
    borderColor: '#E7D9B7',
  },
  notice: {
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.inverseSurface,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeText: {
    color: brand.colors.white,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchContext: {
    minHeight: 44,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#151611',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  searchContextText: {
    color: '#F7F0E4',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  clearSearchText: {
    color: '#E7D9B7',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 26,
    borderCurve: 'continuous',
    overflow: 'hidden',
    minHeight: 198,
    borderWidth: 1,
    padding: 12,
    boxShadow: '0 18px 40px rgba(0, 0, 0, 0.16)',
  },
  featuredCoverColumn: {
    width: 126,
    alignSelf: 'stretch',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(10, 11, 9, 0.08)',
    padding: 9,
    overflow: 'hidden',
  },
  featuredCopy: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
    minWidth: 0,
    paddingVertical: 4,
  },
  featuredHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  featuredStatusChip: {
    minHeight: 28,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  featuredStatusText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionKicker: {
    color: '#7A6B48',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionKickerDark: {
    color: '#7A6B48',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featuredTitle: {
    color: brand.colors.ink,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featuredMeta: {
    color: brand.colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  featuredFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  featuredProgressGroup: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  featuredProgressTrack: {
    height: 8,
    borderRadius: brand.radius.round,
    backgroundColor: brand.colors.paperSoft,
    overflow: 'hidden',
  },
  featuredProgressFill: {
    height: '100%',
    borderRadius: brand.radius.round,
    backgroundColor: '#BFD6C3',
  },
  readButton: {
    backgroundColor: '#151611',
    borderRadius: brand.radius.round,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
  },
  readButtonText: {
    color: '#F7F0E4',
    fontWeight: '900',
    letterSpacing: 0,
  },
  featuredProgressLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 2,
  },
  sectionTitle: {
    color: brand.colors.ink,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: 0,
  },
  count: {
    color: brand.colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  shelfList: {
    gap: 10,
  },
  tile: {
    width: '100%',
  },
  tilePressable: {
    minHeight: 118,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    boxShadow: '0 9px 20px rgba(0, 0, 0, 0.07)',
  },
  tileCopy: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tileTitle: {
    color: brand.colors.ink,
    flex: 1,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    letterSpacing: 0,
  },
  tileMeta: {
    color: brand.colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  formatPill: {
    minWidth: 42,
    borderRadius: brand.radius.round,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  formatPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  tileProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tileStatus: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  tileAction: {
    minHeight: 28,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    height: 5,
    borderRadius: brand.radius.round,
    backgroundColor: 'rgba(21, 22, 17, 0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: brand.radius.round,
    backgroundColor: '#BFD6C3',
  },
  progressText: {
    color: brand.colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  coverRail: {
    gap: 12,
    paddingRight: 18,
  },
  coverRailItem: {
    width: 72,
  },
  emptyCapabilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  emptyCapability: {
    minHeight: 32,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCapabilityText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
