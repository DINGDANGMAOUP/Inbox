import { router, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { themeAssets } from '@/constants/theme-assets';
import { deleteBook, importBook, listBooks } from '@/lib/reader-service';
import type { LibraryBook, ReaderTheme } from '@/types/reader';

function authorLabel(author: string) {
  return author === 'Local file' ? '本地文件' : author;
}

function chapterLabel(title?: string | null) {
  if (!title) {
    return '阅读中';
  }
  return title.replace(/^Part\s+(\d+)$/i, '第 $1 部分').replace(/^Chapter\s+(\d+)$/i, '第 $1 章');
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

function ThemeSwitch({
  activeTheme,
  onChange,
}: {
  activeTheme: ReaderTheme;
  onChange: (theme: ReaderTheme) => void;
}) {
  return (
    <View style={styles.themeSwitch}>
      {brand.themeOrder.map((theme) => {
        const themeToken = brand.themes[theme];
        const active = activeTheme === theme;

        return (
          <Pressable
            key={theme}
            onPress={() => onChange(theme)}
            style={[
              styles.themePill,
              { borderColor: active ? themeToken.accent : themeToken.line, backgroundColor: active ? themeToken.accent : themeToken.surface },
            ]}>
            <Image source={themeAssets[theme].cover} contentFit="cover" style={styles.themePillImage} />
            <View style={styles.themePillScrim} />
            <Text style={[styles.themePillText, { color: active ? themeToken.accentText : themeToken.text }]}>{themeToken.label}</Text>
          </Pressable>
        );
      })}
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
  theme: ReaderTheme;
  onDelete: (book: LibraryBook) => void;
}) {
  const fillPercent = bookProgressPercent(book) ?? 0;
  const themeToken = brand.themes[theme];

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 20).duration(180)}
      exiting={FadeOut.duration(120)}
      layout={LinearTransition.duration(160)}
      style={styles.tile}>
      <Pressable
        onPress={() => router.push({ pathname: '/reader/[id]', params: { id: book.id } })}
        onLongPress={() => onDelete(book)}
        style={({ pressed }) => [
          styles.tilePressable,
          { backgroundColor: themeToken.surfaceSolid, borderColor: themeToken.line },
          pressed && styles.pressed,
        ]}>
        <BookCover book={book} size="small" theme={theme} />
        <View style={styles.tileCopy}>
          <View style={styles.tileTopRow}>
            <Text numberOfLines={2} style={[styles.tileTitle, { color: themeToken.text }]}>
              {book.title}
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
            <Text style={[styles.tileStatus, { color: themeToken.accent }]}>{statusLabel(book)}</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: themeToken.line }]}>
            <View style={[styles.progressFill, { width: `${fillPercent}%`, backgroundColor: themeToken.accent }]} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<ReaderTheme>('mist');
  const theme = brand.themes[activeTheme];
  const ambientTextColor = activeTheme === 'deep' ? brand.colors.white : brand.colors.ink;
  const ambientMutedColor = activeTheme === 'deep' ? 'rgba(247, 248, 251, 0.72)' : brand.colors.muted;

  const filteredBooks = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return books;
    }
    return books.filter((book) => `${book.title} ${book.author}`.toLowerCase().includes(trimmed));
  }, [books, query]);

  const featuredBook = query.trim() ? null : books.find(hasReadingProgress) ?? books[0];
  const featuredStarted = featuredBook ? hasReadingProgress(featuredBook) : false;
  const featuredProgressPercent = featuredBook ? bookProgressPercent(featuredBook) : null;

  const startedCount = useMemo(() => {
    return books.filter(hasReadingProgress).length;
  }, [books]);

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
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Image source={themeAssets[activeTheme].background} contentFit="cover" transition={180} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.overlay }]} />
      <ScrollView
        style={styles.scroller}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={loading && books.length > 0} onRefresh={refresh} />}
        contentContainerStyle={styles.content}>
      <View style={styles.masthead}>
        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <BrandSeal />
            <View style={styles.heroText}>
              <Text style={[styles.eyebrow, { color: ambientMutedColor }]}>INBOX · 私人离线书库</Text>
              <Text style={[styles.title, { color: ambientTextColor }]}>墨屿</Text>
            </View>
          </View>
          <IconButton tone="filled" icon="plus" label={importing ? '导入中' : '导入'} disabled={importing} onPress={handleImport} />
        </View>
        <Text style={[styles.tagline, { color: ambientMutedColor }]}>把 EPUB 与 TXT 收进本机，一座只属于你的安静书岛。</Text>
        <ThemeSwitch activeTheme={activeTheme} onChange={setActiveTheme} />
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{books.length}</Text>
            <Text style={styles.metricLabel}>本机藏书</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{startedCount}</Text>
            <Text style={styles.metricLabel}>已开始</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>离线</Text>
            <Text style={styles.metricLabel}>阅读模式</Text>
          </View>
        </View>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="搜索书架"
        placeholderTextColor={brand.colors.muted}
        autoCapitalize="none"
        style={styles.search}
      />

      {notice && (
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOut.duration(120)} style={styles.notice}>
          <Text numberOfLines={2} style={styles.noticeText}>
            {notice}
          </Text>
        </Animated.View>
      )}

      {!!query.trim() && (
        <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)} style={styles.searchContext}>
          <Text style={styles.searchContextText}>正在筛选书架</Text>
          <Pressable onPress={() => setQuery('')} hitSlop={8} style={({ pressed }) => pressed && styles.pressed}>
            <Text style={styles.clearSearchText}>清除</Text>
          </Pressable>
        </Animated.View>
      )}

      {featuredBook && (
        <Animated.View entering={FadeInDown.duration(180)}>
          <Pressable
            onPress={() => router.push({ pathname: '/reader/[id]', params: { id: featuredBook.id } })}
            style={({ pressed }) => [
              styles.featured,
              { backgroundColor: theme.surfaceSolid, borderColor: theme.line },
              pressed && styles.pressed,
            ]}>
            <View style={styles.featuredCoverColumn}>
              <BookCover book={featuredBook} size="hero" theme={activeTheme} />
            </View>
            <View style={[styles.featuredDivider, { backgroundColor: theme.line }]} />
            <View style={styles.featuredCopy}>
              <Text style={[styles.sectionKicker, { color: theme.accent }]}>{featuredStarted ? '继续阅读' : '最近导入'}</Text>
              <Text numberOfLines={2} style={[styles.featuredTitle, { color: theme.text }]}>
                {featuredBook.title}
              </Text>
              <Text numberOfLines={1} style={[styles.featuredMeta, { color: theme.muted }]}>
                {progressLabel(featuredBook)}
              </Text>
              {featuredStarted && featuredProgressPercent !== null && featuredProgressPercent > 0 && (
                <View style={[styles.featuredProgressTrack, { backgroundColor: theme.line }]}>
                  <View style={[styles.featuredProgressFill, { width: `${featuredProgressPercent}%`, backgroundColor: theme.accent }]} />
                </View>
              )}
              <View style={[styles.readButton, { backgroundColor: theme.accent }]}>
                <Text style={styles.readButtonText}>打开阅读器</Text>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      )}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionKickerDark}>LIBRARY</Text>
          <Text style={[styles.sectionTitle, { color: ambientTextColor }]}>书架</Text>
        </View>
        <Text style={[styles.count, { color: ambientMutedColor }]}>{filteredBooks.length} 本书</Text>
      </View>

      {loading && books.length === 0 ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={brand.colors.ink} />
          <Text style={styles.emptyTitle}>正在整理书架</Text>
        </View>
      ) : filteredBooks.length === 0 ? (
        <Animated.View entering={FadeInDown.duration(260)} style={styles.emptyState}>
          <BrandSeal />
          <Text style={styles.emptyTitle}>{query ? '没有匹配的书' : '导入第一本书'}</Text>
          <Text style={styles.emptyBody}>
            EPUB 和 TXT 文件只保存在这台设备上。阅读进度、搜索索引、划线和笔记都会离线保存。
          </Text>
          <IconButton icon="tray.and.arrow.down" label={importing ? '导入中' : '选择文件'} disabled={importing} onPress={handleImport} />
        </Animated.View>
      ) : (
        <View style={styles.shelfList}>
          {filteredBooks.map((book, index) => (
            <BookTile key={book.id} book={book} index={index} theme={activeTheme} onDelete={handleDelete} />
          ))}
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brand.colors.paper,
  },
  scroller: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 48,
    gap: 18,
  },
  masthead: {
    gap: 18,
    paddingBottom: 4,
  },
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 14,
  },
  brandRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minWidth: 0,
  },
  brandSeal: {
    width: 58,
    height: 58,
    borderRadius: 15,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: brand.colors.paperElevated,
    boxShadow: '0 10px 24px rgba(48, 67, 82, 0.20)',
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
    color: brand.colors.island,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  title: {
    color: brand.colors.ink,
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '900',
    letterSpacing: 0,
  },
  tagline: {
    color: brand.colors.muted,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 330,
    fontWeight: '600',
  },
  themeSwitch: {
    flexDirection: 'row',
    gap: 8,
  },
  themePill: {
    flex: 1,
    minHeight: 46,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  themePillImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.44,
  },
  themePillScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(247, 248, 251, 0.24)',
  },
  themePillText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricRow: {
    flexDirection: 'row',
    minHeight: 74,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(247, 248, 251, 0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.62)',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  metric: {
    flex: 1,
    gap: 4,
  },
  metricValue: {
    color: brand.colors.ink,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricLabel: {
    color: brand.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  metricDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 18,
    backgroundColor: brand.colors.line,
  },
  search: {
    minHeight: 50,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    color: brand.colors.ink,
    backgroundColor: brand.colors.paperElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    fontSize: 16,
    fontWeight: '600',
  },
  notice: {
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.ink,
    borderWidth: 1,
    borderColor: brand.colors.islandDeep,
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
    minHeight: 42,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(221, 230, 237, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(82, 109, 123, 0.24)',
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  searchContextText: {
    color: brand.colors.islandDeep,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  clearSearchText: {
    color: brand.colors.ink,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    overflow: 'hidden',
    minHeight: 198,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 17,
    boxShadow: brand.shadow.shelf,
  },
  featuredCoverColumn: {
    width: 124,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredDivider: {
    width: 1,
    alignSelf: 'stretch',
    opacity: 0.8,
  },
  featuredCopy: {
    flex: 1,
    justifyContent: 'center',
    gap: 11,
    minWidth: 0,
  },
  sectionKicker: {
    color: brand.colors.islandDeep,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionKickerDark: {
    color: brand.colors.copper,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featuredTitle: {
    color: brand.colors.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featuredMeta: {
    color: brand.colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  featuredProgressTrack: {
    height: 5,
    borderRadius: brand.radius.round,
    backgroundColor: brand.colors.paperSoft,
    overflow: 'hidden',
  },
  featuredProgressFill: {
    height: '100%',
    borderRadius: brand.radius.round,
    backgroundColor: brand.colors.island,
  },
  readButton: {
    alignSelf: 'flex-start',
    backgroundColor: brand.colors.ink,
    borderRadius: brand.radius.round,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  readButtonText: {
    color: brand.colors.white,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: brand.colors.ink,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: 0,
  },
  count: {
    color: brand.colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
  shelfList: {
    gap: 12,
  },
  tile: {
    width: '100%',
  },
  tilePressable: {
    minHeight: 124,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    boxShadow: '0 10px 24px rgba(48, 67, 82, 0.10)',
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
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  tileMeta: {
    color: brand.colors.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  formatPill: {
    minWidth: 44,
    borderRadius: brand.radius.round,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
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
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  progressTrack: {
    height: 5,
    borderRadius: brand.radius.round,
    backgroundColor: 'rgba(213, 222, 231, 0.9)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: brand.radius.round,
    backgroundColor: brand.colors.island,
  },
  progressText: {
    color: brand.colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    minHeight: 260,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.paperElevated,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.70)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
    gap: 14,
  },
  emptyTitle: {
    color: brand.colors.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  emptyBody: {
    color: brand.colors.muted,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
  },
  pressed: {
    opacity: 0.76,
    transform: [{ scale: 0.99 }],
  },
});
