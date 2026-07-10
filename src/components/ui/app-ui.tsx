import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { appMotion } from '@/components/ui/motion-presets';
import { FeedbackPressable } from '@/components/ui/feedback-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/ui/material-symbol';

type AppUiTheme = {
  surface: string;
  surfaceSolid?: string;
  surfaceContainer: string;
  surfaceContainerHigh?: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  text: string;
  muted: string;
  accent: string;
  accentText: string;
  line: string;
};

export function AppScreen({
  theme,
  backgroundSource,
  overlayColor,
  children,
  style,
}: {
  theme: AppUiTheme & { background?: string; overlay?: string };
  backgroundSource: ImageSourcePropType;
  overlayColor?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={[styles.screen, { backgroundColor: theme.background ?? theme.surfaceSolid ?? theme.surface }, style]}>
      <Image source={backgroundSource} contentFit="cover" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor ?? theme.overlay ?? 'transparent' }]} />
      {children}
    </Animated.View>
  );
}

export function PageHeader({
  theme,
  title,
  subtitle,
  onBack,
}: {
  theme: AppUiTheme;
  title: string;
  subtitle: string;
  onBack: () => void;
}) {
  return (
    <Animated.View entering={appMotion.fadeDown()} style={styles.pageHeader}>
      <FeedbackPressable
        captureTouches
        feedback="subtle"
        hitSlop={8}
        accessibilityLabel="返回"
        onPress={onBack}
        style={[styles.pageBackButton, { backgroundColor: theme.surfaceSolid ?? theme.surface, borderColor: theme.line }]}>
        <MaterialSymbol name="chevron.left" color={theme.text} description="返回" decorative size={20} />
      </FeedbackPressable>
      <View style={styles.pageTitleCopy}>
        <Text numberOfLines={1} style={[styles.pageTitle, { color: theme.text }]}>{title}</Text>
        <Text accessibilityLiveRegion="polite" numberOfLines={1} style={[styles.pageSubtitle, { color: theme.muted }]}>{subtitle}</Text>
      </View>
    </Animated.View>
  );
}

export function StatePanel({
  theme,
  title,
  body,
  artwork,
  children,
  order = 0,
  style,
}: {
  theme: AppUiTheme;
  title: string;
  body?: string;
  artwork?: ReactNode;
  children?: ReactNode;
  order?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={appMotion.fadeDown(order * motion.stagger.section)}
      layout={appMotion.layoutMedium()}
      style={[styles.statePanel, { backgroundColor: theme.surfaceSolid ?? theme.surface, borderColor: theme.line }, style]}>
      {artwork}
      <View style={styles.stateCopy}>
        <Text style={[styles.stateTitle, { color: theme.text }]}>{title}</Text>
        {body ? <Text style={[styles.stateBody, { color: theme.muted }]}>{body}</Text> : null}
      </View>
      {children}
    </Animated.View>
  );
}

export function Stepper({
  theme,
  label,
  value,
  onMinus,
  onPlus,
  compact = false,
}: {
  theme: AppUiTheme;
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  compact?: boolean;
}) {
  const controlBackground = theme.accent;
  const controlColor = theme.accentText;

  return (
    <View style={[styles.stepper, compact && styles.stepperCompact, { backgroundColor: theme.surfaceContainer, borderColor: theme.line }]}>
      <View style={styles.stepperTitleStack}>
        <Text style={[styles.stepperLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.stepperValueInline, { color: theme.muted }]}>{value}</Text>
      </View>
      <View style={styles.stepperControls}>
        <FeedbackPressable
          accessibilityLabel={`减少${label}`}
          captureTouches
          hitSlop={8}
          onPress={onMinus}
          feedback="strong"
          style={[styles.roundControl, { backgroundColor: controlBackground }]}>
          <MaterialSymbol name="minus" color={controlColor} description={`减少${label}`} decorative size={22} />
        </FeedbackPressable>
        <View style={[styles.stepperValuePill, { backgroundColor: theme.surfaceSolid ?? theme.surface, borderColor: theme.line }]}>
          <Text style={[styles.stepperValue, { color: theme.text }]}>{value}</Text>
        </View>
        <FeedbackPressable
          accessibilityLabel={`增加${label}`}
          captureTouches
          hitSlop={8}
          onPress={onPlus}
          feedback="strong"
          style={[styles.roundControl, { backgroundColor: controlBackground }]}>
          <MaterialSymbol name="plus" color={controlColor} description={`增加${label}`} decorative size={22} />
        </FeedbackPressable>
      </View>
    </View>
  );
}

export function FilterChip({
  theme,
  label,
  selected,
  onPress,
  count,
  icon,
  compact = false,
}: {
  theme: AppUiTheme;
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
  icon?: MaterialSymbolName;
  compact?: boolean;
}) {
  const foreground = selected ? theme.onPrimaryContainer : theme.text;
  const background = selected ? theme.primaryContainer : theme.surface;

  return (
    <FeedbackPressable
      captureTouches
      onPress={onPress}
      feedback={selected ? 'subtle' : 'standard'}
      stateLayerColor={selected ? 'rgba(255, 255, 255, 0.18)' : 'rgba(205, 232, 208, 0.18)'}
      style={[
        styles.filterChip,
        compact && styles.filterChipCompact,
        { backgroundColor: background, borderColor: selected ? theme.accent : theme.line },
      ]}>
      {icon ? <MaterialSymbol name={icon} color={foreground} description={label} decorative size={16} /> : selected ? <MaterialSymbol name="check" color={foreground} description={`${label} 已选中`} decorative size={15} /> : null}
      <Text numberOfLines={1} style={[styles.filterChipText, { color: foreground }]}>
        {count === undefined ? label : `${label} ${count}`}
      </Text>
    </FeedbackPressable>
  );
}

export function SegmentedControl<Value extends string>({
  theme,
  value,
  options,
  onChange,
}: {
  theme: AppUiTheme;
  value: Value;
  options: { value: Value; title: string; body?: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <View style={[styles.segmentedShell, { backgroundColor: theme.surfaceContainer }]}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <FeedbackPressable
            key={option.value}
            captureTouches
            onPress={() => onChange(option.value)}
            feedback={active ? 'subtle' : 'standard'}
            stateLayerColor={active ? 'rgba(255, 255, 255, 0.18)' : 'rgba(205, 232, 208, 0.16)'}
            style={[
              styles.segmentedItem,
              { backgroundColor: active ? theme.primaryContainer : theme.surfaceContainer, borderColor: active ? theme.accent : theme.line },
            ]}>
            <View style={styles.segmentedTitleRow}>
              {active ? <MaterialSymbol name="check" color={theme.onPrimaryContainer} description={`${option.title} 已选中`} decorative size={14} /> : null}
              <Text style={[styles.segmentedTitle, { color: active ? theme.onPrimaryContainer : theme.text }]}>{option.title}</Text>
            </View>
            {option.body ? (
              <Text numberOfLines={1} style={[styles.segmentedBody, { color: active ? theme.onPrimaryContainer : theme.muted }]}>
                {option.body}
              </Text>
            ) : null}
          </FeedbackPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  pageHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pageBackButton: {
    width: 48,
    height: 48,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: brand.shadow.card,
  },
  pageTitleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  pageTitle: {
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: 0,
  },
  pageSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0,
  },
  statePanel: {
    minHeight: 240,
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
    gap: 14,
    boxShadow: brand.shadow.card,
  },
  stateCopy: {
    alignItems: 'center',
    gap: 7,
  },
  stateTitle: {
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  stateBody: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    letterSpacing: 0,
  },
  stepper: {
    minHeight: 64,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepperCompact: {
    minHeight: 56,
    paddingHorizontal: 12,
  },
  stepperTitleStack: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  stepperLabel: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  stepperValueInline: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  roundControl: {
    width: 44,
    height: 44,
    borderRadius: brand.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValuePill: {
    minWidth: 50,
    minHeight: 40,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  stepperValue: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  filterChip: {
    minHeight: 44,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
  },
  filterChipCompact: {
    minHeight: 44,
    paddingHorizontal: 12,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  segmentedShell: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
  },
  segmentedItem: {
    flex: 1,
    minHeight: 60,
    borderRadius: brand.radius.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 4,
  },
  segmentedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  segmentedTitle: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  segmentedBody: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
});
