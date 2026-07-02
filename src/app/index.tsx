import { router, useFocusEffect, type Href } from 'expo-router';
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
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/reader/icon-button';
import { LibraryBookRow } from '@/components/reader/library-book-row';
import { M3FilterChip, M3Screen, M3StatePanel } from '@/components/reader/m3';
import { m3Motion } from '@/components/reader/motion-presets';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { appThemeAssets } from '@/constants/theme-assets';
import { useReaderPreferences } from '@/hooks/use-reader-preferences';
import { authorLabel, bookProgressPercent, bookTitleLabel, hasReadingProgress, progressLabel } from '@/lib/library-book-labels';
import { deleteBook, importBook, listBooks } from '@/lib/reader-service';
import type { LibraryBook, ResolvedAppTheme } from '@/types/reader';

type LibraryFilter = 'all' | 'reading' | 'unread';

const libraryFilters: { value: LibraryFilter; label: string; icon: MaterialSymbolName }[] = [
  { value: 'all', label: '全部', icon: 'bookmark' },
  { value: 'reading', label: '在读', icon: 'textformat.size' },
  { value: 'unread', label: '未开始', icon: 'tray.and.arrow.down' },
];

function BrandSeal() {
  return (
    <View style={styles.brandSeal}>
      <Image source={brandAssets.logoMark} contentFit="cover" transition={160} style={styles.brandSealImage} />
    </View>
  );
}

function DrawerMenuItem({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: MaterialSymbolName;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <M3Pressable onPress={onPress} feedback="subtle" style={styles.drawerItem}>
      <View style={styles.drawerItemIcon}>
        <MaterialSymbol name={icon} color={brand.colors.copper} description={title} decorative size={18} />
      </View>
      <View style={styles.drawerItemCopy}>
        <Text style={styles.drawerItemTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.drawerItemDetail}>
          {detail}
        </Text>
      </View>
      <View style={styles.drawerItemArrow}>
        <MaterialSymbol name="chevron.right" color={brand.colors.muted} description={`${title}菜单`} decorative size={17} />
      </View>
    </M3Pressable>
  );
}

function FeaturedBookCover({ book, theme }: { book: LibraryBook; theme: ResolvedAppTheme }) {
  const token = brand.appThemes[theme];
  const isDeep = theme === 'deep';
  const titleColor = isDeep ? brand.chrome.text : brand.colors.ink;
  const mutedColor = isDeep ? 'rgba(248, 243, 234, 0.68)' : brand.colors.muted;

  return (
    <View style={[styles.featuredBookCover, { backgroundColor: token.surfaceSolid }]}>
      <View style={[styles.featuredBookTopBand, { backgroundColor: isDeep ? 'rgba(205, 232, 208, 0.12)' : 'rgba(205, 232, 208, 0.36)' }]} />
      <View style={[styles.featuredBookAccentBlock, { backgroundColor: isDeep ? 'rgba(228, 222, 184, 0.18)' : 'rgba(228, 222, 184, 0.46)' }]} />
      <View style={styles.featuredBookFormat}>
        <Text style={styles.featuredBookFormatText}>{book.format.toUpperCase()}</Text>
      </View>
      <View style={[styles.featuredBookMark, { backgroundColor: isDeep ? brand.chrome.text : token.surfaceSolid }]}>
        <Image source={brandAssets.logoMark} contentFit="cover" transition={160} style={styles.featuredBookMarkImage} />
      </View>
      <View style={styles.featuredBookCoverCopy}>
        <Text numberOfLines={1} style={[styles.featuredBookBrand, { color: mutedColor }]}>
          墨屿阅读
        </Text>
        <View style={styles.featuredBookRules}>
          <View style={[styles.featuredBookRule, { backgroundColor: mutedColor }]} />
          <View style={[styles.featuredBookRuleShort, { backgroundColor: mutedColor }]} />
        </View>
        <Text numberOfLines={2} style={[styles.featuredBookTitle, { color: titleColor }]}>
          {bookTitleLabel(book)}
        </Text>
        <Text numberOfLines={1} style={[styles.featuredBookAuthor, { color: mutedColor }]}>
          {authorLabel(book.author)}
        </Text>
      </View>
    </View>
  );
}

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const { resolvedAppTheme } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const activeTheme = resolvedAppTheme;
  const theme = brand.appThemes[activeTheme];
  const isDeepTheme = activeTheme === 'deep';
  const ambientTextColor = isDeepTheme ? brand.colors.white : theme.text;
  const ambientMutedColor = isDeepTheme ? 'rgba(255, 255, 255, 0.76)' : theme.muted;

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const matchesFilter = filter === 'all' || (filter === 'reading' ? hasReadingProgress(book) : !hasReadingProgress(book));
      return matchesFilter;
    });
  }, [books, filter]);

  const featuredBook = books.find(hasReadingProgress);
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

  const navigateFromDrawer = useCallback((path: '/settings' | '/about') => {
    setMenuOpen(false);
    router.push(path);
  }, []);
  const openSearch = useCallback(() => {
    router.push('/search' as Href);
  }, []);

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
        contentContainerStyle={[styles.content, width >= 700 && styles.contentWide]}>
        <View style={styles.topAppBar}>
          <View style={styles.brandRow}>
            <M3Pressable
              onPress={() => setMenuOpen(true)}
              feedback="subtle"
              hitSlop={8}
              accessibilityLabel="打开菜单"
              style={[styles.brandMenuButton, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
              <BrandSeal />
            </M3Pressable>
            <View style={styles.heroText}>
              <Text numberOfLines={1} style={[styles.brandTitle, { color: ambientTextColor }]}>
                墨屿
              </Text>
              <Text numberOfLines={1} style={[styles.brandSubtitle, { color: ambientMutedColor }]}>
                INBOX
              </Text>
            </View>
          </View>
          <IconButton
            icon="magnifyingglass"
            label="搜索书架"
            tone="quiet"
            tintColor={theme.text}
            size="icon"
            style={[styles.searchIconButton, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}
            onPress={openSearch}
          />
        </View>

        <View style={styles.libraryHero}>
          <Image source={appThemeAssets[activeTheme].materialBoard} contentFit="cover" transition={220} style={styles.heroMaterialBoard} />
          <View style={styles.heroTint} />
          <View style={styles.libraryHeroTop}>
            <View style={styles.heroCopyBlock}>
              <Text style={styles.eyebrow}>PRIVATE LIBRARY</Text>
              <Text style={styles.heroTitle}>私人书架{'\n'}安静长读</Text>
            </View>
          </View>
        </View>

      {notice && (
        <Animated.View entering={m3Motion.fadeDown()} exiting={m3Motion.fadeShortOut()} style={styles.notice}>
          <Text numberOfLines={2} style={styles.noticeText}>
            {notice}
          </Text>
        </Animated.View>
      )}

      {featuredBook && (
        <Animated.View entering={m3Motion.fadeDown()}>
          <M3Pressable
            onPress={() => router.push({ pathname: '/reader/[id]', params: { id: featuredBook.id } })}
            feedback="subtle"
            style={[
              styles.featured,
              { backgroundColor: theme.surfaceSolid, borderColor: theme.line },
              ]}>
            <FeaturedBookCover book={featuredBook} theme={activeTheme} />
            <View style={styles.featuredCopy}>
              <View style={styles.featuredHeaderRow}>
                <Text style={styles.sectionKicker}>继续阅读</Text>
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
                  <MaterialSymbol name="chevron.right" color={brand.chrome.text} description="开始阅读" decorative size={17} />
                </View>
              </View>
            </View>
          </M3Pressable>
        </Animated.View>
      )}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionKickerDark}>LIBRARY</Text>
          <Text style={[styles.sectionTitle, { color: ambientTextColor }]}>书架</Text>
        </View>
        <Text style={[styles.count, { color: ambientMutedColor }]}>{filteredBooks.length} 本书</Text>
      </View>
      <View style={styles.filterRow}>
        {libraryFilters.map((item) => {
          const active = filter === item.value;
          return (
            <M3FilterChip
              key={item.value}
              theme={theme}
              selected={active}
              label={item.label}
              icon={item.icon}
              onPress={() => setFilter(item.value)}
            />
          );
        })}
      </View>

      {loading && books.length === 0 ? (
        <M3StatePanel theme={theme} title="正在整理书架" artwork={<ActivityIndicator color={theme.accent} />} />
      ) : filteredBooks.length === 0 ? (
        <M3StatePanel
          theme={theme}
          title={filter === 'all' ? '导入第一本书' : '这里还没有书'}
          body="支持 EPUB 与 TXT。"
          artwork={<BrandSeal />}
          order={1}>
          {filter === 'all' && (
            <View style={styles.emptyCapabilityRow}>
              <EmptyCapability theme={activeTheme} label="EPUB" />
              <EmptyCapability theme={activeTheme} label="TXT" />
            </View>
          )}
        </M3StatePanel>
      ) : (
        <View style={styles.shelfList}>
          {filteredBooks.map((book, index) => (
            <LibraryBookRow key={book.id} book={book} index={index} theme={activeTheme} onDelete={handleDelete} />
          ))}
        </View>
      )}
      </ScrollView>
      <M3Pressable
        onPress={handleImport}
        disabled={importing}
        feedback="strong"
        accessibilityLabel={importing ? '导入中' : '导入书籍'}
        style={[styles.floatingImportButton, { bottom: Math.max(10, insets.bottom + 6) }]}>
        <MaterialSymbol name="tray.and.arrow.down" color={brand.chrome.accentText} description={importing ? '导入中' : '导入书籍'} decorative size={19} />
      </M3Pressable>
      {menuOpen && (
        <Animated.View pointerEvents="box-none" style={styles.drawerLayer}>
          <Animated.View entering={FadeIn.duration(motion.duration.short)} exiting={FadeOut.duration(motion.duration.short)} style={styles.drawerBackdrop}>
            <Pressable accessibilityRole="button" accessibilityLabel="关闭菜单" onPress={() => setMenuOpen(false)} style={StyleSheet.absoluteFill} />
          </Animated.View>
          <Animated.View
            entering={SlideInLeft.duration(motion.duration.medium)}
            exiting={SlideOutLeft.duration(motion.duration.short)}
            style={[
              styles.drawerPanel,
              {
                paddingTop: Math.max(24, insets.top + 14),
                backgroundColor: brand.colors.paper,
                borderColor: theme.line,
              },
            ]}>
            <View style={styles.drawerHeroCard}>
              <View style={styles.drawerBrand}>
                <BrandSeal />
                <View style={styles.drawerBrandCopy}>
                  <Image source={brandAssets.wordmark} contentFit="contain" transition={160} style={styles.drawerWordmark} />
                  <Text style={styles.drawerSubtitle}>私人书架</Text>
                </View>
              </View>
              <View style={styles.drawerStats}>
                <View style={[styles.drawerStatPill, styles.drawerStatPillCool]}>
                  <Text style={styles.drawerStatValue}>{books.length}</Text>
                  <Text style={styles.drawerStatLabel}>藏书</Text>
                </View>
                <View style={[styles.drawerStatPill, styles.drawerStatPillWarm]}>
                  <Text style={styles.drawerStatValue}>{startedCount}</Text>
                  <Text style={styles.drawerStatLabel}>在读</Text>
                </View>
              </View>
            </View>
            <View style={styles.drawerMenu}>
              <Text style={styles.drawerSectionLabel}>菜单</Text>
              <DrawerMenuItem icon="settings" title="设置" detail="阅读样式与主题" onPress={() => navigateFromDrawer('/settings')} />
              <DrawerMenuItem icon="info" title="关于" detail="版本与应用信息" onPress={() => navigateFromDrawer('/about')} />
            </View>
            <View style={styles.drawerFooter}>
              <Text style={styles.drawerFooterText}>本地阅读 · 私密保存</Text>
            </View>
          </Animated.View>
        </Animated.View>
      )}
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
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 204,
    gap: 22,
  },
  contentWide: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
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
    gap: 11,
    minWidth: 0,
  },
  brandMenuButton: {
    width: 50,
    height: 50,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 18px rgba(18, 20, 15, 0.06)',
  },
  searchIconButton: {
    width: 48,
    height: 48,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 18px rgba(18, 20, 15, 0.08)',
  },
  brandSeal: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: brand.colors.paper,
  },
  brandSealImage: {
    position: 'absolute',
    left: -31,
    top: -30,
    width: 96,
    height: 96,
  },
  heroText: {
    flex: 1,
    gap: 0,
    minWidth: 0,
  },
  brandTitle: {
    fontSize: 22,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  brandSubtitle: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  eyebrow: {
    color: brand.chrome.accent,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  libraryHero: {
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: brand.chrome.border,
    backgroundColor: brand.chrome.surface,
    padding: 22,
    minHeight: 204,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    boxShadow: '0 22px 42px rgba(18, 20, 15, 0.18)',
  },
  heroMaterialBoard: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    opacity: 0.14,
  },
  heroTint: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(11, 14, 11, 0.88)',
  },
  libraryHeroTop: {
    gap: 16,
  },
  heroCopyBlock: {
    gap: 8,
  },
  heroTitle: {
    maxWidth: 292,
    color: brand.chrome.text,
    fontSize: 38,
    lineHeight: 42,
    fontWeight: '900',
    letterSpacing: 0,
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
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    overflow: 'visible',
    minHeight: 188,
    borderWidth: 1,
    padding: 14,
    boxShadow: brand.shadow.card,
  },
  featuredBookCover: {
    width: 112,
    height: 158,
    flexShrink: 0,
    alignSelf: 'center',
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    overflow: 'hidden',
    boxShadow: '0 10px 22px rgba(18, 20, 15, 0.10)',
  },
  featuredBookTopBand: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 48,
  },
  featuredBookAccentBlock: {
    position: 'absolute',
    left: 0,
    bottom: 28,
    width: 46,
    height: 42,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderCurve: 'continuous',
  },
  featuredBookFormat: {
    position: 'absolute',
    top: 12,
    left: 12,
    minHeight: 30,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    backgroundColor: brand.chrome.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  featuredBookFormatText: {
    color: brand.chrome.accentText,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featuredBookMark: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 13,
    borderCurve: 'continuous',
    padding: 3,
    overflow: 'hidden',
    boxShadow: '0 8px 18px rgba(21, 22, 17, 0.14)',
  },
  featuredBookMarkImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  featuredBookCoverCopy: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 13,
    gap: 5,
  },
  featuredBookBrand: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featuredBookTitle: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featuredBookRules: {
    gap: 4,
    opacity: 0.22,
    paddingVertical: 2,
  },
  featuredBookRule: {
    width: '82%',
    height: 4,
    borderRadius: brand.radius.round,
  },
  featuredBookRuleShort: {
    width: '58%',
    height: 4,
    borderRadius: brand.radius.round,
  },
  featuredBookAuthor: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0,
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
  sectionKicker: {
    color: brand.colors.copper,
    fontSize: 11,
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
    fontSize: 25,
    lineHeight: 30,
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
    backgroundColor: brand.colors.tertiaryContainer,
  },
  readButton: {
    backgroundColor: brand.chrome.surface,
    borderRadius: brand.radius.round,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
  },
  readButtonText: {
    color: brand.chrome.text,
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -12,
  },
  shelfList: {
    gap: 12,
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
  floatingImportButton: {
    position: 'absolute',
    right: 8,
    zIndex: 20,
    width: 46,
    height: 46,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.chrome.accent,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
    boxShadow: '0 16px 30px rgba(18, 20, 15, 0.20)',
  },
  drawerLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(7, 9, 7, 0.46)',
  },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '80%',
    maxWidth: 320,
    borderTopRightRadius: brand.radius.extraLarge,
    borderBottomRightRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderRightWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 16,
    boxShadow: '14px 0 28px rgba(7, 9, 7, 0.16)',
  },
  drawerHeroCard: {
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(18, 20, 15, 0.08)',
    backgroundColor: 'rgba(255, 252, 244, 0.72)',
    padding: 14,
    gap: 16,
    boxShadow: '0 8px 18px rgba(18, 20, 15, 0.06)',
  },
  drawerBrand: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerBrandCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  drawerWordmark: {
    width: 126,
    height: 42,
    marginLeft: -4,
  },
  drawerSubtitle: {
    color: brand.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  drawerStats: {
    flexDirection: 'row',
    gap: 8,
  },
  drawerStatPill: {
    flex: 1,
    minHeight: 62,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'center',
  },
  drawerStatPillCool: {
    backgroundColor: '#DCEEDF',
  },
  drawerStatPillWarm: {
    backgroundColor: '#EEE9BD',
  },
  drawerStatValue: {
    color: brand.colors.ink,
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  drawerStatLabel: {
    color: brand.colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  drawerMenu: {
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(18, 20, 15, 0.08)',
    backgroundColor: 'rgba(255, 252, 244, 0.78)',
    padding: 8,
    gap: 6,
    boxShadow: '0 8px 18px rgba(18, 20, 15, 0.05)',
  },
  drawerSectionLabel: {
    color: brand.colors.copper,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 4,
  },
  drawerItem: {
    minHeight: 58,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(248, 245, 236, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(18, 20, 15, 0.07)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
  },
  drawerItemIcon: {
    width: 36,
    height: 36,
    borderRadius: brand.radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DCEEDF',
  },
  drawerItemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  drawerItemTitle: {
    color: brand.colors.ink,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  drawerItemDetail: {
    color: brand.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  drawerItemArrow: {
    width: 28,
    height: 28,
    borderRadius: brand.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 20, 15, 0.04)',
  },
  drawerFooter: {
    marginTop: 'auto',
    minHeight: 40,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(18, 20, 15, 0.04)',
  },
  drawerFooterText: {
    color: brand.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
