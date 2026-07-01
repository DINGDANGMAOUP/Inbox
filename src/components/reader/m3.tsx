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
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';

import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';

export type M3ThemeToken = {
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

export function M3Screen({
  theme,
  backgroundSource,
  overlayColor,
  children,
  style,
}: {
  theme: M3ThemeToken & { background?: string; overlay?: string };
  backgroundSource: ImageSourcePropType;
  overlayColor?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeIn.duration(motion.duration.screen)}
      exiting={FadeOut.duration(motion.duration.medium)}
      style={[styles.screen, { backgroundColor: theme.background ?? theme.surfaceSolid ?? theme.surface }, style]}>
      <Image source={backgroundSource} contentFit="cover" transition={180} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: overlayColor ?? theme.overlay ?? 'transparent' }]} />
      {children}
    </Animated.View>
  );
}

export function M3TopAppBar({
  theme,
  title,
  subtitle,
  leading,
  trailing,
  logoSource,
  style,
}: {
  theme: M3ThemeToken;
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  logoSource?: ImageSourcePropType;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.topAppBar, { backgroundColor: theme.surfaceSolid ?? theme.surface, borderColor: theme.line }, style]}>
      {leading}
      {logoSource ? <Image source={logoSource} contentFit="cover" style={styles.appBarLogo} /> : null}
      <View style={styles.appBarTitleStack}>
        <Text numberOfLines={1} style={[styles.appBarTitle, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.appBarSubtitle, { color: theme.muted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function M3MetricCard({
  theme,
  value,
  label,
  icon,
}: {
  theme: M3ThemeToken;
  value: string | number;
  label: string;
  icon?: MaterialSymbolName;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: theme.surfaceSolid ?? theme.surface, borderColor: theme.line }]}>
      <View style={styles.metricHeader}>
        {icon ? <MaterialSymbol name={icon} color={theme.accent} description={label} size={17} /> : null}
        <Text style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.metricValue, { color: theme.text }]}>
        {value}
      </Text>
    </View>
  );
}

export function M3StatePanel({
  theme,
  title,
  body,
  artwork,
  children,
  order = 0,
  style,
}: {
  theme: M3ThemeToken;
  title: string;
  body?: string;
  artwork?: ReactNode;
  children?: ReactNode;
  order?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(order * motion.stagger.section).duration(motion.duration.medium)}
      layout={LinearTransition.duration(motion.duration.medium)}
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

export function M3StepRail({
  theme,
  steps,
  activeIndex,
}: {
  theme: M3ThemeToken;
  steps: readonly string[];
  activeIndex: number;
}) {
  return (
    <View style={[styles.stepRail, { backgroundColor: theme.surfaceContainer, borderColor: theme.line }]}>
      {steps.map((step, index) => {
        const active = activeIndex >= index;
        return (
          <View key={step} style={styles.stepRailItem}>
            <Animated.View
              layout={LinearTransition.duration(motion.duration.short)}
              style={[styles.stepRailDot, { borderColor: theme.line }, active && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
              {active ? <MaterialSymbol name="check" color={theme.accentText} description={step} size={12} /> : null}
            </Animated.View>
            <Text numberOfLines={1} style={[styles.stepRailText, { color: active ? theme.text : theme.muted }]}>
              {step}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function M3ProgressRail({
  theme,
  label,
  value,
  detail,
}: {
  theme: M3ThemeToken;
  label: string;
  value: number;
  detail?: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value * 100)));

  return (
    <View style={[styles.progressRail, { backgroundColor: theme.surfaceContainer, borderColor: theme.line }]}>
      <View style={styles.progressMeta}>
        <Text style={[styles.progressLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.progressValue, { color: theme.muted }]}>{detail ?? `${percent}%`}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: theme.line }]}>
        <Animated.View layout={LinearTransition.duration(motion.duration.medium)} style={[styles.progressFill, { width: `${Math.max(4, percent)}%`, backgroundColor: theme.accent }]} />
      </View>
    </View>
  );
}

export function M3FeatureCard({
  theme,
  title,
  body,
  icon,
}: {
  theme: M3ThemeToken;
  title: string;
  body: string;
  icon?: MaterialSymbolName;
}) {
  return (
    <View style={[styles.featureCard, { backgroundColor: theme.surfaceSolid ?? theme.surface, borderColor: theme.line }]}>
      {icon ? (
        <View style={[styles.featureIcon, { backgroundColor: theme.accent }]}>
          <MaterialSymbol name={icon} color={theme.accentText} description={title} size={18} />
        </View>
      ) : null}
      <View style={styles.featureCopy}>
        <Text style={[styles.featureTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.featureBody, { color: theme.muted }]}>{body}</Text>
      </View>
    </View>
  );
}

export function M3Section({
  title,
  kicker,
  theme,
  order,
  children,
  style,
  contentStyle,
}: {
  title: string;
  kicker?: string;
  theme: M3ThemeToken;
  order: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(order * motion.stagger.section).duration(motion.duration.medium)}
      layout={LinearTransition.duration(motion.duration.medium)}
      style={[styles.sectionShell, style]}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        {kicker ? <Text style={[styles.sectionKicker, { color: theme.accent }]}>{kicker}</Text> : null}
      </View>
      <View style={[styles.sectionSurface, { backgroundColor: theme.surfaceSolid ?? theme.surface, borderColor: theme.line }, contentStyle]}>
        {children}
      </View>
    </Animated.View>
  );
}

export function M3InfoRow({
  theme,
  title,
  value,
  icon,
}: {
  theme: M3ThemeToken;
  title: string;
  value: string;
  icon?: MaterialSymbolName;
}) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.line }]}>
      <View style={styles.infoTitleCluster}>
        {icon ? <MaterialSymbol name={icon} color={theme.accent} description={title} size={18} /> : null}
        <Text style={[styles.infoTitle, { color: theme.text }]}>{title}</Text>
      </View>
      <Text numberOfLines={2} style={[styles.infoValue, { color: theme.muted }]}>
        {value}
      </Text>
    </View>
  );
}

export function M3Stepper({
  theme,
  label,
  value,
  onMinus,
  onPlus,
  compact = false,
}: {
  theme: M3ThemeToken;
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
        <M3Pressable
          accessibilityLabel={`减少${label}`}
          onPress={onMinus}
          feedback="strong"
          style={[styles.roundControl, { backgroundColor: controlBackground }]}>
          <MaterialSymbol name="minus" color={controlColor} description={`减少${label}`} size={22} />
        </M3Pressable>
        <View style={[styles.stepperValuePill, { backgroundColor: theme.surfaceSolid ?? theme.surface, borderColor: theme.line }]}>
          <Text style={[styles.stepperValue, { color: theme.text }]}>{value}</Text>
        </View>
        <M3Pressable
          accessibilityLabel={`增加${label}`}
          onPress={onPlus}
          feedback="strong"
          style={[styles.roundControl, { backgroundColor: controlBackground }]}>
          <MaterialSymbol name="plus" color={controlColor} description={`增加${label}`} size={22} />
        </M3Pressable>
      </View>
    </View>
  );
}

export function M3FilterChip({
  theme,
  label,
  selected,
  onPress,
  count,
  icon,
  compact = false,
}: {
  theme: M3ThemeToken;
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
    <M3Pressable
      onPress={onPress}
      feedback={selected ? 'subtle' : 'standard'}
          stateLayerColor={selected ? 'rgba(255, 255, 255, 0.18)' : 'rgba(231, 217, 183, 0.18)'}
      style={[
        styles.filterChip,
        compact && styles.filterChipCompact,
        { backgroundColor: background, borderColor: selected ? theme.accent : theme.line },
      ]}>
      {icon ? <MaterialSymbol name={icon} color={foreground} description={label} size={16} /> : selected ? <MaterialSymbol name="check" color={foreground} description={`${label} 已选中`} size={15} /> : null}
      <Text numberOfLines={1} style={[styles.filterChipText, { color: foreground }]}>
        {count === undefined ? label : `${label} ${count}`}
      </Text>
    </M3Pressable>
  );
}

export function M3SegmentedControl<Value extends string>({
  theme,
  value,
  options,
  onChange,
}: {
  theme: M3ThemeToken;
  value: Value;
  options: { value: Value; title: string; body?: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <View style={[styles.segmentedShell, { backgroundColor: theme.surfaceContainer }]}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <M3Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            feedback={active ? 'subtle' : 'standard'}
            stateLayerColor={active ? 'rgba(255, 255, 255, 0.18)' : 'rgba(231, 217, 183, 0.16)'}
            style={[
              styles.segmentedItem,
              { backgroundColor: active ? theme.primaryContainer : theme.surfaceContainer, borderColor: active ? theme.accent : theme.line },
            ]}>
            <View style={styles.segmentedTitleRow}>
              {active ? <MaterialSymbol name="check" color={theme.onPrimaryContainer} description={`${option.title} 已选中`} size={14} /> : null}
              <Text style={[styles.segmentedTitle, { color: active ? theme.onPrimaryContainer : theme.text }]}>{option.title}</Text>
            </View>
            {option.body ? (
              <Text numberOfLines={1} style={[styles.segmentedBody, { color: active ? theme.onPrimaryContainer : theme.muted }]}>
                {option.body}
              </Text>
            ) : null}
          </M3Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topAppBar: {
    minHeight: 70,
    borderRadius: 28,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    boxShadow: '0 18px 36px rgba(0, 0, 0, 0.12)',
  },
  appBarLogo: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  appBarTitleStack: {
    flex: 1,
    minWidth: 0,
  },
  appBarTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  appBarSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sectionShell: {
    gap: 8,
  },
  sectionHeader: {
    paddingHorizontal: 2,
    gap: 2,
  },
  sectionSurface: {
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 10,
    gap: 10,
    boxShadow: '0 14px 32px rgba(0, 0, 0, 0.10)',
  },
  sectionKicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: 0,
  },
  infoRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoTitleCluster: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  infoValue: {
    flexShrink: 1,
    maxWidth: '56%',
    textAlign: 'right',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    letterSpacing: 0,
  },
  metricCard: {
    flex: 1,
    minHeight: 74,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.07)',
  },
  metricHeader: {
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  statePanel: {
    minHeight: 240,
    borderRadius: 28,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
    gap: 14,
    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.10)',
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
  featureCard: {
    minHeight: 92,
    borderRadius: 22,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.07)',
  },
  featureIcon: {
    width: 42,
    height: 42,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  featureTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  featureBody: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
  stepRail: {
    minHeight: 46,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    gap: 8,
  },
  stepRailItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  stepRailDot: {
    width: 22,
    height: 22,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepRailText: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  progressRail: {
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 13,
    gap: 10,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  progressLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  progressValue: {
    maxWidth: '50%',
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  progressTrack: {
    height: 8,
    borderRadius: brand.radius.round,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: brand.radius.round,
  },
  stepper: {
    minHeight: 60,
    borderRadius: 20,
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
    width: 40,
    height: 40,
    borderRadius: brand.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValuePill: {
    minWidth: 50,
    minHeight: 36,
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
    minHeight: 38,
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
    minHeight: 34,
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
    borderRadius: 18,
    borderCurve: 'continuous',
  },
  segmentedItem: {
    flex: 1,
    minHeight: 58,
    borderRadius: brand.radius.medium,
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
