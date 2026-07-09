import { router, useFocusEffect, type Href } from 'expo-router';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import { deleteBooks, importBook, listBooks, type ImportBookProgress } from '@/lib/reader-service';
import type { LibraryBook, ResolvedAppTheme } from '@/types/reader';

type LibraryFilter = 'all' | 'reading' | 'unread';
type AppThemeToken = (typeof brand.appThemes)[ResolvedAppTheme];

const libraryFilters: { value: LibraryFilter; label: string; icon: MaterialSymbolName }[] = [
  { value: 'all', label: '全部', icon: 'bookmark' },
  { value: 'reading', label: '在读', icon: 'textformat.size' },
  { value: 'unread', label: '未开始', icon: 'tray.and.arrow.down' },
];

function BrandSeal() {
  return (
    <View style={styles.brandSeal}>
      <Image source={brandAssets.logoMark} contentFit="contain" transition={160} style={styles.brandSealImage} />
    </View>
  );
}

function BookSeparator() {
  return <View style={styles.bookSeparator} />;
}

function DrawerMenuItem({
  theme,
  icon,
  title,
  detail,
  onPress,
}: {
  theme: AppThemeToken;
  icon: MaterialSymbolName;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <M3Pressable
      onPress={onPress}
      feedback="subtle"
      accessibilityLabel={`${title}，${detail}`}
      stateLayerColor="rgba(47, 107, 79, 0.14)"
      style={[styles.drawerItem, { borderBottomColor: theme.line }]}>
      <View style={[styles.drawerItemIcon, { backgroundColor: theme.surfaceContainer }]}>
        <MaterialSymbol name={icon} color={theme.accent} description={title} decorative size={18} />
      </View>
      <View style={styles.drawerItemCopy}>
        <Text style={[styles.drawerItemTitle, { color: theme.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.drawerItemDetail, { color: theme.muted }]}>
          {detail}
        </Text>
      </View>
      <View style={styles.drawerItemArrow}>
        <MaterialSymbol name="chevron.right" color={theme.muted} description={`${title}菜单`} decorative size={17} />
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
      <View style={[styles.featuredBookMark, { backgroundColor: brand.colors.paper }]}>
        <Image source={brandAssets.logoMark} contentFit="contain" transition={160} style={styles.featuredBookMarkImage} />
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
  const [importProgress, setImportProgress] = useState<ImportBookProgress | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(() => new Set());
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
  const importProgressPercent = importProgress ? Math.round(importProgress.progress * 100) : 0;

  const startedCount = useMemo(() => {
    return books.filter(hasReadingProgress).length;
  }, [books]);
  const selectedCount = selectedBookIds.size;
  const allVisibleSelected = filteredBooks.length > 0 && filteredBooks.every((book) => selectedBookIds.has(book.id));
  const selectedBooks = useMemo(() => books.filter((book) => selectedBookIds.has(book.id)), [books, selectedBookIds]);

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
    setNotice(null);
    try {
      const imported = await importBook(db, setImportProgress);
      if (imported) {
        await refresh();
        setNotice(`已收进书架：${imported.title}`);
        setTimeout(() => setNotice(null), 3600);
      }
    } catch (error) {
      Alert.alert('导入失败', error instanceof Error ? error.message : '无法导入所选书籍。');
    } finally {
      setImportProgress(null);
      setImporting(false);
    }
  }, [db, refresh]);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedBookIds(new Set());
  }, []);

  const startSelection = useCallback((book?: LibraryBook) => {
    setSelectionMode(true);
    setSelectedBookIds((current) => {
      if (!book || current.has(book.id)) {
        return current;
      }
      const next = new Set(current);
      next.add(book.id);
      return next;
    });
  }, []);

  const toggleBookSelection = useCallback((book: LibraryBook) => {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      if (next.has(book.id)) {
        next.delete(book.id);
      } else {
        next.add(book.id);
      }
      return next;
    });
  }, []);

  const toggleVisibleSelection = useCallback(() => {
    setSelectedBookIds((current) => {
      const next = new Set(current);
      filteredBooks.forEach((book) => {
        if (allVisibleSelected) {
          next.delete(book.id);
        } else {
          next.add(book.id);
        }
      });
      return next;
    });
  }, [allVisibleSelected, filteredBooks]);

  const handleDeleteSelected = useCallback(() => {
    if (selectedBooks.length === 0) {
      return;
    }
    const count = selectedBooks.length;
    Alert.alert(`移除 ${count} 本书？`, '会删除墨屿应用内副本、笔记和阅读记录，不会删除原始文件。', [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBooks(db, selectedBooks.map((book) => book.id));
              clearSelection();
              await refresh();
              setNotice(`已移除 ${count} 本书`);
              setTimeout(() => setNotice(null), 3600);
            } catch (error) {
              Alert.alert('移除失败', error instanceof Error ? error.message : '无法移除所选书籍。');
            }
          },
        },
      ]);
    },
    [clearSelection, db, refresh, selectedBooks]
  );

  const navigateFromDrawer = useCallback((path: '/settings' | '/app-settings' | '/storage' | '/about') => {
    setMenuOpen(false);
    router.push(path as Href);
  }, []);
  const openSearch = useCallback(() => {
    router.push('/search' as Href);
  }, []);

  const listExtraData = useMemo(
    () => ({ activeTheme, selectedBookIds, selectionMode }),
    [activeTheme, selectedBookIds, selectionMode]
  );

  const renderBook = useCallback(
    ({ item: book }: { item: LibraryBook }) => (
      <LibraryBookRow
        book={book}
        theme={activeTheme}
        selectionMode={selectionMode}
        selected={selectedBookIds.has(book.id)}
        onSelect={toggleBookSelection}
        onStartSelection={startSelection}
      />
    ),
    [activeTheme, selectedBookIds, selectionMode, startSelection, toggleBookSelection]
  );

  const listHeader = (
    <View style={styles.libraryListHeader}>
      <View style={styles.topAppBar}>
        <View style={styles.brandRow}>
          <M3Pressable
            captureTouches
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
        <View style={styles.sectionActions}>
          <Text style={[styles.count, { color: ambientMutedColor }]}>{selectionMode ? `${selectedCount} 已选` : `${filteredBooks.length} 本书`}</Text>
        </View>
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
    </View>
  );

  const emptyList = loading && books.length === 0 ? (
    <M3StatePanel theme={theme} title="正在整理书架" artwork={<ActivityIndicator color={theme.accent} />} />
  ) : (
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
  );

  return (
    <M3Screen
      key={`library-screen-${activeTheme}`}
      theme={theme}
      backgroundSource={appThemeAssets[activeTheme].background}
      overlayColor={isDeepTheme ? 'rgba(5, 6, 8, 0.58)' : 'rgba(248, 245, 238, 0.76)'}>
      <FlashList
        style={styles.scroller}
        data={filteredBooks}
        renderItem={renderBook}
        keyExtractor={(book) => book.id}
        extraData={listExtraData}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={emptyList}
        ItemSeparatorComponent={BookSeparator}
        contentInsetAdjustmentBehavior="automatic"
        refreshing={loading && books.length > 0}
        onRefresh={refresh}
        contentContainerStyle={[styles.content, width >= 700 && styles.contentWide]}
      />
      {importProgress && !selectionMode && (
        <Animated.View
          entering={m3Motion.fadeDown()}
          exiting={m3Motion.fadeShortOut()}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: importProgressPercent }}
          style={[
            styles.importProgressPanel,
            {
              bottom: Math.max(88, insets.bottom + 86),
              backgroundColor: theme.surfaceSolid,
              borderColor: theme.line,
            },
          ]}>
          <View style={styles.importProgressHeader}>
            <ActivityIndicator color={theme.accent} />
            <View style={styles.importProgressCopy}>
              <Text numberOfLines={1} style={[styles.importProgressTitle, { color: theme.text }]}>
                {importProgress.title}
              </Text>
              <Text numberOfLines={1} style={[styles.importProgressDetail, { color: theme.muted }]}>
                {importProgress.detail}
              </Text>
            </View>
            <Text style={[styles.importProgressPercent, { color: theme.accent }]}>{importProgressPercent}%</Text>
          </View>
          <View style={[styles.importProgressTrack, { backgroundColor: theme.line }]}>
            <Animated.View
              layout={m3Motion.layoutMedium()}
              style={[
                styles.importProgressFill,
                { width: `${Math.max(6, importProgressPercent)}%`, backgroundColor: theme.accent },
              ]}
            />
          </View>
        </Animated.View>
      )}
      {!selectionMode && (
        <M3Pressable
          onPress={handleImport}
          disabled={importing}
          feedback="strong"
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityLabel={importing ? '导入中' : '导入书籍'}
          style={[styles.floatingImportButton, { bottom: Math.max(20, insets.bottom + 18) }]}>
          <View pointerEvents="none">
            {importing ? (
              <ActivityIndicator color={brand.chrome.accentText} />
            ) : (
              <MaterialSymbol name="tray.and.arrow.down" color={brand.chrome.accentText} description="导入书籍" decorative size={22} />
            )}
          </View>
        </M3Pressable>
      )}
      {selectionMode && (
        <Animated.View entering={m3Motion.bottomBarIn()} exiting={m3Motion.bottomBarOut()} style={[styles.selectionBar, { bottom: Math.max(16, insets.bottom + 14), backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
          <View style={styles.selectionBarCopy}>
            <Text style={[styles.selectionBarTitle, { color: theme.text }]}>{selectedCount} 本已选</Text>
            <Text style={[styles.selectionBarDetail, { color: theme.muted }]}>仅移除应用内副本</Text>
          </View>
          <View style={styles.selectionBarActions}>
            <M3Pressable captureTouches feedback="subtle" hitSlop={8} accessibilityLabel="取消选择模式" style={[styles.selectionActionButton, { backgroundColor: theme.surface, borderColor: theme.line }]} onPress={clearSelection}>
              <Text style={[styles.selectionActionText, { color: theme.text }]}>取消</Text>
            </M3Pressable>
            <M3Pressable captureTouches feedback="subtle" hitSlop={8} accessibilityLabel={allVisibleSelected ? '清空选择' : '全选当前列表'} style={[styles.selectionActionButton, { backgroundColor: theme.surface, borderColor: theme.line }]} onPress={toggleVisibleSelection}>
              <Text style={[styles.selectionActionText, { color: theme.text }]}>{allVisibleSelected ? '清空' : '全选'}</Text>
            </M3Pressable>
            <M3Pressable captureTouches feedback="strong" hitSlop={8} disabled={selectedCount === 0} accessibilityLabel="移除所选书籍" style={[styles.selectionDeleteButton, { backgroundColor: theme.error }]} onPress={handleDeleteSelected}>
              <Text style={styles.selectionDeleteText}>移除</Text>
            </M3Pressable>
          </View>
        </Animated.View>
      )}
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
                paddingBottom: Math.max(24, insets.bottom + 20),
                backgroundColor: theme.surfaceSolid,
                borderColor: theme.line,
              },
            ]}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerBrand}>
                <BrandSeal />
                <View style={styles.drawerBrandCopy}>
                  <Text style={[styles.drawerBrandTitle, { color: theme.text }]}>墨屿</Text>
                  <Text style={[styles.drawerSubtitle, { color: theme.muted }]}>私人书架</Text>
                </View>
              </View>
              <View pointerEvents="none" style={styles.drawerCloseButton}>
                <View style={[styles.drawerCloseLine, styles.drawerCloseLineA, { backgroundColor: theme.muted }]} />
                <View style={[styles.drawerCloseLine, styles.drawerCloseLineB, { backgroundColor: theme.muted }]} />
              </View>
              <Pressable
                onPress={() => setMenuOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="关闭菜单"
                style={styles.drawerCloseHitTarget}
              />
            </View>

            <View style={[styles.drawerSummary, { borderTopColor: theme.line, borderBottomColor: theme.line }]}>
              <View style={styles.drawerMetric}>
                <Text style={[styles.drawerMetricValue, { color: theme.text }]}>{books.length}</Text>
                <Text style={[styles.drawerMetricLabel, { color: theme.muted }]}>藏书</Text>
              </View>
              <View style={[styles.drawerMetricDivider, { backgroundColor: theme.line }]} />
              <View style={styles.drawerMetric}>
                <Text style={[styles.drawerMetricValue, { color: theme.text }]}>{startedCount}</Text>
                <Text style={[styles.drawerMetricLabel, { color: theme.muted }]}>在读</Text>
              </View>
            </View>

            <View style={styles.drawerMenu}>
              <Text style={[styles.drawerSectionLabel, { color: theme.accent }]}>导航</Text>
              <View style={[styles.drawerMenuList, { borderTopColor: theme.line, borderBottomColor: theme.line }]}>
                <DrawerMenuItem theme={theme} icon="textformat.size" title="阅读器设置" detail="外观、排版和阅读方式" onPress={() => navigateFromDrawer('/settings')} />
                <DrawerMenuItem theme={theme} icon="settings" title="应用设置" detail="界面主题和应用管理" onPress={() => navigateFromDrawer('/app-settings')} />
                <DrawerMenuItem theme={theme} icon="storage" title="存储空间" detail="占用、缓存和阅读数据" onPress={() => navigateFromDrawer('/storage')} />
                <DrawerMenuItem theme={theme} icon="info" title="关于墨屿" detail="版本、更新和协议" onPress={() => navigateFromDrawer('/about')} />
              </View>
            </View>

            <View style={[styles.drawerFooter, { borderTopColor: theme.line }]}>
              <MaterialSymbol name="bookmark" color={theme.accent} description="本地阅读" decorative size={16} />
              <Text style={[styles.drawerFooterText, { color: theme.muted }]}>本地阅读 · 私密保存</Text>
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
  },
  contentWide: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  libraryListHeader: {
    gap: 22,
    marginBottom: 22,
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
    width: '100%',
    height: '100%',
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
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: -12,
  },
  bookSeparator: {
    height: 12,
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
  importProgressPanel: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 58,
    elevation: 12,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 14,
    gap: 12,
    boxShadow: '0 18px 34px rgba(18, 20, 15, 0.18)',
  },
  importProgressHeader: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  importProgressCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  importProgressTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  importProgressDetail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  importProgressPercent: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
  importProgressTrack: {
    height: 8,
    borderRadius: brand.radius.round,
    overflow: 'hidden',
  },
  importProgressFill: {
    height: '100%',
    borderRadius: brand.radius.round,
  },
  floatingImportButton: {
    position: 'absolute',
    right: 20,
    zIndex: 60,
    elevation: 14,
    width: 56,
    height: 56,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.chrome.accent,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
    boxShadow: '0 16px 30px rgba(18, 20, 15, 0.20)',
  },
  selectionBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 70,
    elevation: 20,
    minHeight: 72,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    boxShadow: '0 16px 30px rgba(18, 20, 15, 0.20)',
  },
  selectionBarCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  selectionBarTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    letterSpacing: 0,
  },
  selectionBarDetail: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  selectionBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionActionButton: {
    minHeight: 44,
    minWidth: 58,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionActionText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  selectionDeleteButton: {
    minHeight: 44,
    minWidth: 62,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionDeleteText: {
    color: brand.colors.white,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  drawerLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    elevation: 30,
  },
  drawerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(7, 9, 7, 0.54)',
  },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    elevation: 31,
    width: '82%',
    maxWidth: 336,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    borderCurve: 'continuous',
    borderRightWidth: 1,
    paddingHorizontal: 20,
    gap: 22,
    boxShadow: '12px 0 24px rgba(7, 9, 7, 0.18)',
  },
  drawerHeader: {
    position: 'relative',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  drawerBrand: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerBrandCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  drawerBrandTitle: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: 0,
  },
  drawerSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  drawerCloseButton: {
    zIndex: 2,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerCloseLine: {
    position: 'absolute',
    width: 18,
    height: 2,
    borderRadius: 1,
  },
  drawerCloseLineA: {
    transform: [{ rotate: '45deg' }],
  },
  drawerCloseLineB: {
    transform: [{ rotate: '-45deg' }],
  },
  drawerCloseHitTarget: {
    position: 'absolute',
    top: -10,
    right: -10,
    zIndex: 10,
    width: 64,
    height: 64,
    borderRadius: 18,
  },
  drawerSummary: {
    minHeight: 72,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerMetric: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  drawerMetricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 36,
  },
  drawerMetricValue: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 0,
  },
  drawerMetricLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  drawerMenu: {
    gap: 8,
  },
  drawerSectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    paddingHorizontal: 0,
  },
  drawerMenuList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  drawerItem: {
    minHeight: 64,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  drawerItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerItemCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  drawerItemTitle: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  drawerItemDetail: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  drawerItemArrow: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerFooter: {
    marginTop: 'auto',
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drawerFooterText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
