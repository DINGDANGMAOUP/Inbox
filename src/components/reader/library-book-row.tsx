import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BookCover } from '@/components/reader/book-cover';
import { m3Motion } from '@/components/reader/motion-presets';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import {
  authorLabel,
  bookProgressPercent,
  bookTitleLabel,
  progressLabel,
  statusLabel,
} from '@/lib/library-book-labels';
import type { LibraryBook, ResolvedAppTheme } from '@/types/reader';

export function LibraryBookRow({
  book,
  index,
  theme,
  onDelete,
}: {
  book: LibraryBook;
  index: number;
  theme: ResolvedAppTheme;
  onDelete?: (book: LibraryBook) => void;
}) {
  const fillPercent = bookProgressPercent(book) ?? 0;
  const themeToken = brand.appThemes[theme];

  return (
    <Animated.View
      entering={m3Motion.fadeDown(index * motion.stagger.listItem)}
      exiting={m3Motion.fadeShortOut()}
      layout={m3Motion.layoutMedium()}
      style={styles.tile}>
      <M3Pressable
        onPress={() => router.push({ pathname: '/reader/[id]', params: { id: book.id } })}
        onLongPress={onDelete ? () => onDelete(book) : undefined}
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

const styles = StyleSheet.create({
  tile: {
    width: '100%',
  },
  tilePressable: {
    minHeight: 118,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    boxShadow: '0 6px 16px rgba(18, 20, 15, 0.06)',
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
});
