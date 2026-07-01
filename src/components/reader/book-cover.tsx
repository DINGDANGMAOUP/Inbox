import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { appThemeAssets } from '@/constants/theme-assets';
import { cleanChapterTitle } from '@/lib/text-utils';
import type { Book, ResolvedAppTheme } from '@/types/reader';

const coverThemes: ResolvedAppTheme[] = ['mist', 'deep'];

function themeFor(id: string) {
  const value = id.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return coverThemes[value % coverThemes.length];
}

function authorLabel(author: string) {
  return author === 'Local file' ? '本地文件' : author;
}

type BookCoverProps = {
  book: Pick<Book, 'id' | 'title' | 'author' | 'format'>;
  size?: 'hero' | 'grid' | 'small';
  theme?: ResolvedAppTheme;
};

export function BookCover({ book, size = 'grid', theme }: BookCoverProps) {
  const coverTheme = theme ?? themeFor(book.id);
  const themeToken = brand.appThemes[coverTheme];
  const compact = size === 'small';
  const displayTitle = cleanChapterTitle(book.title, book.title || '未命名书籍');
  const textColor = coverTheme === 'deep' ? brand.colors.white : '#151611';
  const quietTextColor = coverTheme === 'deep' ? 'rgba(255, 255, 255, 0.74)' : '#756D60';
  const titleStyle = size === 'hero' ? styles.heroTitle : size === 'small' ? styles.smallTitle : styles.gridTitle;
  const copyStyle = size === 'hero' ? styles.heroCopy : size === 'small' ? styles.smallCopy : styles.gridCopy;

  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.short)}
      style={[styles.cover, styles[size], { backgroundColor: themeToken.background, borderColor: themeToken.line }]}>
      <Image source={appThemeAssets[coverTheme].cover} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} />
      <View style={[styles.scrim, coverTheme === 'deep' && styles.deepScrim]} />
      <View style={[styles.formatChip, compact && styles.smallFormatChip]}>
        <Text style={[styles.format, compact && styles.smallFormat]}>{book.format.toUpperCase()}</Text>
      </View>
      <View style={[styles.islandMark, compact && styles.smallIslandMark, { backgroundColor: coverTheme === 'deep' ? '#F7F0E4' : themeToken.surfaceSolid }]}>
        <Image source={brandAssets.logoMark} contentFit="cover" transition={160} style={styles.islandMarkImage} />
      </View>
      {!compact && (
        <View style={[styles.copy, copyStyle]}>
          <Text style={[styles.brandText, { color: quietTextColor }]}>墨屿阅读</Text>
          <Text numberOfLines={3} style={[styles.title, titleStyle, { color: textColor }]}>
            {displayTitle}
          </Text>
          <Text numberOfLines={1} style={[styles.author, { color: quietTextColor }]}>
            {authorLabel(book.author)}
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    boxShadow: brand.shadow.card,
  },
  hero: {
    width: 124,
    aspectRatio: 0.66,
  },
  grid: {
    width: '100%',
    aspectRatio: 0.68,
  },
  small: {
    width: 72,
    height: 104,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(247, 240, 228, 0.58)',
  },
  deepScrim: {
    backgroundColor: 'rgba(10, 10, 14, 0.22)',
  },
  formatChip: {
    position: 'absolute',
    left: 14,
    top: 14,
    minHeight: 28,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7D9B7',
  },
  smallFormatChip: {
    left: 9,
    top: 10,
    minHeight: 24,
    paddingHorizontal: 8,
  },
  islandMark: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 40,
    height: 40,
    borderRadius: 14,
    overflow: 'hidden',
    padding: 3,
    boxShadow: '0 7px 18px rgba(29, 27, 32, 0.16)',
  },
  smallIslandMark: {
    right: 9,
    top: 39,
    width: 27,
    height: 27,
    borderRadius: 10,
    padding: 2,
  },
  islandMarkImage: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  brandText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0,
    opacity: 0.72,
  },
  format: {
    color: '#171811',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  smallFormat: {
    fontSize: 9,
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
  },
  heroCopy: {
    padding: 16,
    paddingTop: 68,
  },
  gridCopy: {
    padding: 14,
    paddingTop: 68,
  },
  smallCopy: {
    padding: 8,
    gap: 4,
  },
  title: {
    fontWeight: '800',
    letterSpacing: 0,
  },
  heroTitle: {
    fontSize: 19,
    lineHeight: 23,
  },
  gridTitle: {
    fontSize: 17,
    lineHeight: 21,
  },
  smallTitle: {
    fontSize: 10,
    lineHeight: 12,
  },
  author: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.72,
    letterSpacing: 0,
  },
});
