import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { type PropsWithChildren } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { brand } from '@/constants/brand';

type AdaptiveSurfaceProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  tint?: 'systemMaterial' | 'systemThinMaterial' | 'systemChromeMaterial' | 'light' | 'dark';
}>;

export function AdaptiveSurface({
  children,
  style,
  interactive = false,
}: AdaptiveSurfaceProps) {
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView isInteractive={interactive} style={[styles.surface, style]}>
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'android') {
    return <View style={[styles.surface, styles.androidSurface, style]}>{children}</View>;
  }

  return (
    <BlurView tint="systemMaterial" intensity={64} style={[styles.surface, style]}>
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  surface: {
    overflow: 'hidden',
    backgroundColor: brand.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: 'rgba(121, 116, 126, 0.18)',
  },
  androidSurface: {
    backgroundColor: brand.colors.surfaceContainerHigh,
  },
});
