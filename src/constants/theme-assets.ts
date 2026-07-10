import type { ImageSourcePropType } from 'react-native';

import type { ReaderTheme, ResolvedAppTheme } from '@/types/reader';

type ThemeAssetSet = {
  background: ImageSourcePropType;
  cover: ImageSourcePropType;
};

type AppThemeAssetSet = ThemeAssetSet & {
  themeBoard: ImageSourcePropType;
};

export const appThemeAssets: Record<ResolvedAppTheme, AppThemeAssetSet> = {
  mist: {
    background: require('../../assets/images/themes/mist-background.png'),
    cover: require('../../assets/images/themes/mist-cover.png'),
    themeBoard: require('../../assets/images/themes/moyu-theme-board.png'),
  },
  deep: {
    background: require('../../assets/images/themes/deep-background.png'),
    cover: require('../../assets/images/themes/deep-cover.png'),
    themeBoard: require('../../assets/images/themes/moyu-theme-board.png'),
  },
};

export const readerThemeAssets: Record<ReaderTheme, ThemeAssetSet> = {
  paper: {
    background: require('../../assets/images/themes/reading-background.png'),
    cover: require('../../assets/images/themes/reading-cover.png'),
  },
  sepia: {
    background: require('../../assets/images/themes/reading-background.png'),
    cover: require('../../assets/images/themes/reading-cover.png'),
  },
  night: {
    background: require('../../assets/images/themes/deep-background.png'),
    cover: require('../../assets/images/themes/deep-cover.png'),
  },
  eink: {
    background: require('../../assets/images/themes/mist-background.png'),
    cover: require('../../assets/images/themes/mist-cover.png'),
  },
};
