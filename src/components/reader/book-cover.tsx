import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { m3Motion } from '@/components/reader/motion-presets';
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
  const textColor = coverTheme === 'deep' ? brand.colors.white : brand.colors.ink;
  const quietTextColor = coverTheme === 'deep' ? 'rgba(255, 255, 255, 0.74)' : '#756D60';
  const titleStyle = size === 'hero' ? styles.heroTitle : size === 'small' ? styles.smallTitle : styles.gridTitle;
  const copyStyle = size === 'hero' ? styles.heroCopy : size === 'small' ? styles.smallCopy : styles.gridCopy;

  return (
    <Animated.View
      entering={m3Motion.fadeShortIn()}
      style={[
        styles.cover,
        styles[size],
        compact && styles.smallCover,
        { backgroundColor: compact ? themeToken.surfaceSolid : themeToken.background, borderColor: themeToken.line },
      ]}>
      {compact ? (
        <>
          <View style={[styles.smallTopBand, { backgroundColor: coverTheme === 'deep' ? 'rgba(205, 232, 208, 0.13)' : 'rgba(205, 232, 208, 0.34)' }]} />
          <View style={[styles.smallAccentBlock, { backgroundColor: coverTheme === 'deep' ? 'rgba(228, 222, 184, 0.18)' : 'rgba(228, 222, 184, 0.44)' }]} />
          <View style={styles.smallRuleGroup}>
            <View style={[styles.smallRule, { backgroundColor: quietTextColor }]} />
            <View style={[styles.smallRuleShort, { backgroundColor: quietTextColor }]} />
            <View style={[styles.smallRuleTiny, { backgroundColor: quietTextColor }]} />
          </View>
        </>
      ) : (
        <>
          <Image source={appThemeAssets[coverTheme].cover} contentFit="cover" transition={160} style={StyleSheet.absoluteFill} />
          <View style={[styles.scrim, coverTheme === 'deep' && styles.deepScrim]} />
        </>
      )}
      <View style={[styles.formatChip, compact && styles.smallFormatChip]}>
        <Text style={[styles.format, compact && styles.smallFormat]}>{book.format.toUpperCase()}</Text>
      </View>
      {!compact && (
        <View style={[styles.islandMark, { backgroundColor: coverTheme === 'deep' ? brand.chrome.text : themeToken.surfaceSolid }]}>
          <Image source={brandAssets.logoMark} contentFit="cover" transition={160} style={styles.islandMarkImage} />
        </View>
      )}
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
    width: 68,
    height: 96,
  },
  smallCover: {
    borderRadius: brand.radius.small,
    boxShadow: '0 6px 14px rgba(18, 20, 15, 0.08)',
  },
  smallTopBand: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 30,
  },
  smallAccentBlock: {
    position: 'absolute',
    left: 0,
    bottom: 18,
    width: 28,
    height: 26,
    borderTopRightRadius: brand.radius.small,
    borderBottomRightRadius: brand.radius.small,
    borderCurve: 'continuous',
  },
  smallRuleGroup: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 14,
    gap: 4,
    opacity: 0.22,
  },
  smallRule: {
    width: '82%',
    height: 3,
    borderRadius: brand.radius.round,
  },
  smallRuleShort: {
    width: '58%',
    height: 3,
    borderRadius: brand.radius.round,
  },
  smallRuleTiny: {
    width: '40%',
    height: 3,
    borderRadius: brand.radius.round,
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
    backgroundColor: brand.chrome.accent,
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
    borderRadius: brand.radius.small,
    overflow: 'hidden',
    padding: 3,
    boxShadow: '0 7px 16px rgba(18, 20, 15, 0.12)',
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
    color: brand.chrome.accentText,
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
