import { Platform } from 'react-native';

import type { ReaderFontFamily } from '@/types/reader';

export const readerFontFamilyOrder = ['system', 'serif', 'sans', 'kai'] as const;

export const readerFontFamilies: Record<ReaderFontFamily, { label: string; sample: string }> = {
  system: {
    label: '系统',
    sample: '山月记',
  },
  serif: {
    label: '明宋',
    sample: '山月记',
  },
  sans: {
    label: '黑体',
    sample: '山月记',
  },
  kai: {
    label: '楷体',
    sample: '山月记',
  },
};

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
