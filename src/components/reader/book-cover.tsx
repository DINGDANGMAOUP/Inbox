import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { themeAssets } from '@/constants/theme-assets';
import type { Book, ReaderTheme } from '@/types/reader';

const coverThemes: ReaderTheme[] = ['mist', 'deep', 'reading'];

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
  theme?: ReaderTheme;
};

export function BookCover({ book, size = 'grid', theme }: BookCoverProps) {
  const coverTheme = theme ?? themeFor(book.id);
  const themeToken = brand.themes[coverTheme];
  const compact = size === 'small';
  const textColor = coverTheme === 'deep' ? brand.colors.white : themeToken.text;
  const quietTextColor = coverTheme === 'deep' ? 'rgba(255, 255, 255, 0.74)' : themeToken.muted;
  const titleStyle = size === 'hero' ? styles.heroTitle : size === 'small' ? styles.smallTitle : styles.gridTitle;
  const copyStyle = size === 'hero' ? styles.heroCopy : size === 'small' ? styles.smallCopy : styles.gridCopy;

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      style={[styles.cover, styles[size], { backgroundColor: themeToken.background, borderColor: themeToken.line }]}>
      <Image source={themeAssets[coverTheme].cover} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} />
      <View style={[styles.scrim, coverTheme === 'deep' && styles.deepScrim]} />
      <View style={[styles.spine, { backgroundColor: themeToken.accent }]} />
      <View style={[styles.islandMark, compact && styles.smallIslandMark]}>
        <Image source={brandAssets.logoMark} contentFit="cover" transition={160} style={styles.islandMarkImage} />
      </View>
      {!compact && <Text style={[styles.brandText, { color: quietTextColor }]}>INBOX</Text>}
      <Text style={[styles.format, compact && styles.smallFormat, { color: quietTextColor }]}>{book.format.toUpperCase()}</Text>
      {!compact && (
        <View style={[styles.copy, copyStyle]}>
          <Text numberOfLines={3} style={[styles.title, titleStyle, { color: textColor }]}>
            {book.title}
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
    borderRadius: brand.radius.medium,
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
  spine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '13%',
    opacity: 0.95,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  deepScrim: {
    backgroundColor: 'rgba(10, 18, 24, 0.18)',
  },
  islandMark: {
    position: 'absolute',
    right: 16,
    top: 18,
    width: 38,
    height: 38,
    borderRadius: 10,
    overflow: 'hidden',
    boxShadow: '0 6px 14px rgba(31, 49, 61, 0.18)',
  },
  smallIslandMark: {
    right: 9,
    top: 13,
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  islandMarkImage: {
    width: '100%',
    height: '100%',
  },
  brandText: {
    position: 'absolute',
    right: 16,
    top: 68,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0,
    opacity: 0.72,
  },
  format: {
    position: 'absolute',
    left: 20,
    top: 22,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    opacity: 0.82,
  },
  smallFormat: {
    left: 15,
    top: 18,
    fontSize: 9,
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
  },
  heroCopy: {
    padding: 16,
    paddingLeft: 28,
  },
  gridCopy: {
    padding: 14,
    paddingLeft: 26,
  },
  smallCopy: {
    padding: 8,
    paddingLeft: 14,
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
