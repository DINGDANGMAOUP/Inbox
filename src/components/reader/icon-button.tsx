import { Image } from 'expo-image';
import { Host, Icon as MaterialIcon } from '@expo/ui/jetpack-compose';
import { Platform, Pressable, StyleSheet, Text, type ImageSourcePropType, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import AddIcon from '@expo/material-symbols/add.xml';
import ArrowBackIcon from '@expo/material-symbols/arrow_back.xml';
import ArrowForwardIcon from '@expo/material-symbols/arrow_forward.xml';
import BookmarkIcon from '@expo/material-symbols/bookmark.xml';
import DrawIcon from '@expo/material-symbols/draw.xml';
import FileOpenIcon from '@expo/material-symbols/file_open.xml';
import ListIcon from '@expo/material-symbols/format_list_bulleted.xml';
import SearchIcon from '@expo/material-symbols/search.xml';
import TextFieldsIcon from '@expo/material-symbols/text_fields.xml';

import { brand } from '@/constants/brand';

const androidIcons: Record<string, ImageSourcePropType> = {
  bookmark: BookmarkIcon,
  'chevron.left': ArrowBackIcon,
  'chevron.right': ArrowForwardIcon,
  highlighter: DrawIcon,
  'list.bullet': ListIcon,
  magnifyingglass: SearchIcon,
  plus: AddIcon,
  'textformat.size': TextFieldsIcon,
  'tray.and.arrow.down': FileOpenIcon,
};

type IconButtonProps = Omit<PressableProps, 'style'> & {
  icon: string;
  label: string;
  tintColor?: string;
  tone?: 'light' | 'dark' | 'filled' | 'quiet';
  style?: StyleProp<ViewStyle>;
};

export function IconButton({ icon, label, tintColor, tone = 'dark', style, ...props }: IconButtonProps) {
  const resolvedTintColor = tintColor ?? (tone === 'light' || tone === 'filled' ? brand.colors.white : brand.colors.ink);
  const androidIcon = androidIcons[icon] ?? AddIcon;
  const disabled = props.disabled;
  return (
    <Pressable
      accessibilityLabel={label}
      hitSlop={10}
      style={({ pressed }) => [
        styles.button,
        tone === 'light' && styles.lightButton,
        tone === 'filled' && styles.filledButton,
        tone === 'quiet' && styles.quietButton,
        style,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
      {...props}>
      {Platform.OS === 'ios' ? (
        <Image source={`sf:${icon}`} style={styles.icon} tintColor={resolvedTintColor} contentFit="contain" />
      ) : Platform.OS === 'android' ? (
        <Host matchContents style={styles.iconHost}>
          <MaterialIcon source={androidIcon} size={18} tint={resolvedTintColor} contentDescription={label} />
        </Host>
      ) : (
        <Text style={[styles.iconFallback, { color: resolvedTintColor }]}>{label.slice(0, 1).toUpperCase()}</Text>
      )}
      <Text style={[styles.label, { color: resolvedTintColor }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 42,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.paperElevated,
    borderWidth: 1,
    borderColor: brand.colors.line,
  },
  lightButton: {
    backgroundColor: 'rgba(48, 67, 82, 0.88)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  filledButton: {
    backgroundColor: brand.colors.ink,
    borderColor: brand.colors.ink,
  },
  quietButton: {
    backgroundColor: 'rgba(247, 248, 251, 0.72)',
    borderColor: 'rgba(195, 203, 213, 0.70)',
  },
  pressed: {
    opacity: 0.68,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.36,
  },
  icon: {
    width: 17,
    height: 17,
  },
  iconHost: {
    width: 18,
    height: 18,
  },
  iconFallback: {
    minWidth: 17,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
