import { Platform } from 'react-native';

import type { ReaderFontFamily } from '@/types/reader';

export const readerFontFamilyOrder = ['system', 'serif', 'sans', 'kai'] as const;

export const readerFontFamilies: Record<ReaderFontFamily, { label: string; sample: string; cssStack: string }> = {
  system: {
    label: '系统',
    sample: '山月记',
    cssStack: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  },
  serif: {
    label: '明宋',
    sample: '山月记',
    cssStack: '"Songti SC", "STSong", "Noto Serif CJK SC", "Noto Serif", Georgia, serif',
  },
  sans: {
    label: '黑体',
    sample: '山月记',
    cssStack: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Roboto", sans-serif',
  },
  kai: {
    label: '楷体',
    sample: '山月记',
    cssStack: '"Kaiti SC", "STKaiti", "KaiTi", "BiauKai", serif',
  },
};

export function readerFontCssStack(fontFamily: ReaderFontFamily) {
  return readerFontFamilies[fontFamily]?.cssStack ?? readerFontFamilies.system.cssStack;
}

export function readerNativeFontFamily(fontFamily: ReaderFontFamily) {
  if (fontFamily === 'system') {
    return undefined;
  }
  if (fontFamily === 'serif') {
    return Platform.select({ ios: 'Songti SC', android: 'serif' });
  }
  if (fontFamily === 'sans') {
    return Platform.select({ ios: 'PingFang SC', android: 'sans-serif' });
  }
  return Platform.select({ ios: 'Kaiti SC', android: 'serif' });
}
