import type { ImageSourcePropType } from 'react-native';

import type { ReaderTheme, ResolvedAppTheme } from '@/types/reader';

type ThemeAssetSet = {
  background: ImageSourcePropType;
  cover: ImageSourcePropType;
  materialBoard: ImageSourcePropType;
};

export const appThemeAssets: Record<ResolvedAppTheme, ThemeAssetSet> = {
  mist: {
    background: require('../../assets/images/themes/mist-background.png'),
    cover: require('../../assets/images/themes/mist-cover.png'),
    materialBoard: require('../../assets/images/themes/moyu-material-board.png'),
  },
  deep: {
    background: require('../../assets/images/themes/deep-background.png'),
    cover: require('../../assets/images/themes/deep-cover.png'),
    materialBoard: require('../../assets/images/themes/moyu-material-board.png'),
  },
};

export const readerThemeAssets: Record<ReaderTheme, ThemeAssetSet> = {
  paper: {
    background: require('../../assets/images/themes/reading-background.png'),
    cover: require('../../assets/images/themes/reading-cover.png'),
    materialBoard: require('../../assets/images/themes/moyu-material-board.png'),
  },
  sepia: {
    background: require('../../assets/images/themes/reading-background.png'),
    cover: require('../../assets/images/themes/reading-cover.png'),
    materialBoard: require('../../assets/images/themes/moyu-material-board.png'),
  },
  night: {
    background: require('../../assets/images/themes/deep-background.png'),
    cover: require('../../assets/images/themes/deep-cover.png'),
    materialBoard: require('../../assets/images/themes/moyu-material-board.png'),
  },
  eink: {
    background: require('../../assets/images/themes/mist-background.png'),
    cover: require('../../assets/images/themes/mist-cover.png'),
    materialBoard: require('../../assets/images/themes/moyu-material-board.png'),
  },
};
