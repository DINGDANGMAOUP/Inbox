import type { ImageSourcePropType } from 'react-native';

import type { ReaderTheme } from '@/types/reader';

type ThemeAssetSet = {
  background: ImageSourcePropType;
  cover: ImageSourcePropType;
  materialBoard: ImageSourcePropType;
};

export const themeAssets: Record<ReaderTheme, ThemeAssetSet> = {
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
  reading: {
    background: require('../../assets/images/themes/reading-background.png'),
    cover: require('../../assets/images/themes/reading-cover.png'),
    materialBoard: require('../../assets/images/themes/moyu-material-board.png'),
  },
};
