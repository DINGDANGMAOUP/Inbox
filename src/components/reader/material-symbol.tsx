import { Image } from 'expo-image';
import { Host, Icon as MaterialIcon } from '@expo/ui/jetpack-compose';
import { Platform, StyleSheet, Text, type ImageSourcePropType, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import AddIcon from '@expo/material-symbols/add.xml';
import ArrowBackIcon from '@expo/material-symbols/arrow_back.xml';
import ArrowForwardIcon from '@expo/material-symbols/arrow_forward.xml';
import BookmarkIcon from '@expo/material-symbols/bookmark.xml';
import CheckIcon from '@expo/material-symbols/check.xml';
import CheckCircleIcon from '@expo/material-symbols/check_circle.xml';
import ChevronRightIcon from '@expo/material-symbols/chevron_right.xml';
import CloseIcon from '@expo/material-symbols/close.xml';
import DownloadIcon from '@expo/material-symbols/download.xml';
import DrawIcon from '@expo/material-symbols/draw.xml';
import ErrorIcon from '@expo/material-symbols/error.xml';
import FileOpenIcon from '@expo/material-symbols/file_open.xml';
import InfoIcon from '@expo/material-symbols/info.xml';
import ListIcon from '@expo/material-symbols/format_list_bulleted.xml';
import RefreshIcon from '@expo/material-symbols/refresh.xml';
import RemoveIcon from '@expo/material-symbols/remove.xml';
import SearchIcon from '@expo/material-symbols/search.xml';
import SettingsIcon from '@expo/material-symbols/settings.xml';
import StickyNoteIcon from '@expo/material-symbols/sticky_note.xml';
import TextFieldsIcon from '@expo/material-symbols/text_fields.xml';

export const materialSymbolSources = {
  bookmark: BookmarkIcon,
  check: CheckIcon,
  'check.circle': CheckCircleIcon,
  chevron: ChevronRightIcon,
  'chevron.left': ArrowBackIcon,
  'chevron.right': ArrowForwardIcon,
  close: CloseIcon,
  download: DownloadIcon,
  error: ErrorIcon,
  highlighter: DrawIcon,
  info: InfoIcon,
  'list.bullet': ListIcon,
  magnifyingglass: SearchIcon,
  minus: RemoveIcon,
  plus: AddIcon,
  refresh: RefreshIcon,
  settings: SettingsIcon,
  note: StickyNoteIcon,
  'textformat.size': TextFieldsIcon,
  'tray.and.arrow.down': FileOpenIcon,
} satisfies Record<string, ImageSourcePropType>;

export type MaterialSymbolName = keyof typeof materialSymbolSources;

type MaterialSymbolProps = {
  name: MaterialSymbolName;
  color: string;
  size?: number;
  description?: string;
  decorative?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function MaterialSymbol({ name, color, size = 18, description, decorative = false, style, textStyle }: MaterialSymbolProps) {
  const source = materialSymbolSources[name] ?? AddIcon;
  const fallbackLabel = description ?? name;
  const accessibilityLabel = decorative ? undefined : description ?? name;

  if (Platform.OS === 'ios') {
    return (
      <Image
        source={`sf:${iosSymbolName(name)}`}
        style={[{ width: size, height: size }, style as StyleProp<ImageStyle>]}
        tintColor={color}
        contentFit="contain"
        pointerEvents="none"
        accessible={!decorative}
        accessibilityLabel={accessibilityLabel}
        accessibilityElementsHidden={decorative}
        importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      />
    );
  }

  if (Platform.OS === 'android') {
    return (
      <Host
        matchContents
        pointerEvents="none"
        style={[{ width: size, height: size }, style]}>
        <MaterialIcon source={source} size={size} tint={color} contentDescription={decorative ? undefined : description ?? name} />
      </Host>
    );
  }

  return (
    <Text
      pointerEvents="none"
      style={[styles.fallback, { color, width: size, fontSize: Math.max(11, size * 0.72) }, textStyle]}
      numberOfLines={1}
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}>
      {fallbackLabel.slice(0, 1).toUpperCase()}
    </Text>
  );
}

function iosSymbolName(name: MaterialSymbolName) {
  switch (name) {
    case 'check':
      return 'checkmark';
    case 'check.circle':
      return 'checkmark.circle';
    case 'close':
      return 'xmark';
    case 'download':
      return 'arrow.down';
    case 'error':
      return 'exclamationmark.triangle';
    case 'minus':
      return 'minus';
    case 'refresh':
      return 'arrow.clockwise';
    default:
      return name;
  }
}

const styles = StyleSheet.create({
  fallback: {
    textAlign: 'center',
    fontWeight: '900',
    letterSpacing: 0,
  },
});
