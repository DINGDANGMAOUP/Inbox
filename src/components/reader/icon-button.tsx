import { StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { brand } from '@/constants/brand';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';

type IconButtonProps = Omit<PressableProps, 'style'> & {
  icon: MaterialSymbolName;
  label: string;
  tintColor?: string;
  tone?: 'light' | 'dark' | 'filled' | 'quiet';
  size?: 'regular' | 'icon' | 'extended';
  style?: StyleProp<ViewStyle>;
};

export function IconButton({ icon, label, tintColor, tone = 'dark', size = 'regular', style, ...props }: IconButtonProps) {
  const resolvedTintColor =
    tintColor ??
    (tone === 'filled'
      ? brand.colors.onPrimary
      : tone === 'light'
        ? brand.colors.onPrimaryContainer
        : tone === 'quiet'
          ? brand.colors.ink
          : brand.colors.onPrimaryContainer);
  const disabled = props.disabled;
  return (
    <View
      style={[
        styles.button,
        size === 'icon' && styles.iconButton,
        size === 'extended' && styles.extendedButton,
        tone === 'light' && styles.lightButton,
        tone === 'filled' && styles.filledButton,
        tone === 'quiet' && styles.quietButton,
        disabled && styles.disabledButton,
        style,
      ]}>
      <MaterialSymbol name={icon} color={resolvedTintColor} description={label} size={18} style={styles.iconHost} />
      {size !== 'icon' && (
        <Text style={[styles.label, { color: resolvedTintColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      <M3Pressable
        accessibilityLabel={label}
        disabled={disabled}
        feedback={size === 'extended' ? 'standard' : 'subtle'}
        hitSlop={10}
        stateLayerColor={tone === 'filled' ? 'rgba(255, 255, 255, 0.18)' : 'rgba(231, 217, 183, 0.20)'}
        style={styles.touchOverlay}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'relative',
    minHeight: 46,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.primaryContainer,
    borderWidth: 1,
    borderColor: 'rgba(80, 73, 62, 0.12)',
  },
  iconButton: {
    width: 48,
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 0,
    gap: 0,
  },
  extendedButton: {
    minHeight: 56,
    paddingHorizontal: 22,
    gap: 10,
  },
  lightButton: {
    backgroundColor: brand.colors.primaryContainer,
    borderColor: 'rgba(80, 73, 62, 0.14)',
  },
  filledButton: {
    backgroundColor: brand.colors.primary,
    borderColor: brand.colors.primary,
  },
  quietButton: {
    backgroundColor: brand.colors.surfaceContainerHigh,
    borderColor: 'rgba(80, 73, 62, 0.14)',
  },
  disabledButton: {
    opacity: 0.36,
  },
  iconHost: {
    width: 18,
    height: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
  },
  touchOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
  },
});
