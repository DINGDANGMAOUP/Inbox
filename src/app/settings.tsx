import { type ReactNode, useCallback, useEffect } from 'react';
import { ActivityIndicator, BackHandler, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { M3Screen } from '@/components/reader/m3';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { useRouteSlideTransition } from '@/components/reader/route-slide-transition';
import { brand } from '@/constants/brand';
import { appThemeAssets } from '@/constants/theme-assets';
import { useReaderPreferences } from '@/hooks/use-reader-preferences';
import type { AppThemeMode, ReaderPreferences, ReaderTheme, ResolvedAppTheme } from '@/types/reader';

const readingModeCopy: Record<ReaderPreferences['readingMode'], { title: string; body: string }> = {
  scroll: { title: '滚动', body: '' },
  page: { title: '翻页', body: '' },
};

type SettingsTheme = (typeof brand.appThemes)[ResolvedAppTheme];
type ThemeChoiceSwatch = readonly [string, string, string];

const appThemeModeCopy: Record<AppThemeMode, { title: string; body: string }> = {
  system: { title: '跟随系统', body: '自动' },
  mist: { title: '纸岛', body: '暖白' },
  deep: { title: '夜岛', body: '黑色' },
};

const readerThemeCopy: Record<ReaderTheme, { title: string; body: string }> = {
  paper: { title: '纸页', body: '暖白' },
  sepia: { title: '暖笺', body: '柔和' },
  night: { title: '夜读', body: '暗色' },
  eink: { title: '墨白', body: '高对比' },
};

const appThemeSwatches: Record<AppThemeMode, ThemeChoiceSwatch> = {
  system: ['#F8F5EC', '#10130E', '#D7E9D7'],
  mist: ['#F8F5EC', '#EEE8DA', '#2F6B4F'],
  deep: ['#0B0E0B', '#1A2118', '#D7E9D7'],
};

const readerThemeSwatches: Record<ReaderTheme, ThemeChoiceSwatch> = {
  paper: ['#FFF8F0', '#F5EEE6', '#8C4A25'],
  sepia: ['#F5E5C8', '#E7D2A8', '#75532D'],
  night: ['#111318', '#242832', '#C8D5FF'],
  eink: ['#FBFCF7', '#ECEFE8', '#11140F'],
};

export default function SettingsScreen() {
  const { preferences, resolvedAppTheme, loading, saving, updatePreferences } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];
  const topBarHeight = insets.top + 56;

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRoute();
      return true;
    });
    return () => subscription.remove();
  }, [closeRoute]);

  const updatePreference = useCallback(
    async (next: ReaderPreferences) => {
      await updatePreferences(next);
    },
    [updatePreferences]
  );

  const stepPreference = useCallback(
    (key: 'fontSize' | 'lineHeight' | 'margin', delta: number) => {
      const next = { ...preferences };
      if (key === 'fontSize') {
        next.fontSize = Math.max(15, Math.min(30, preferences.fontSize + delta));
      }
      if (key === 'lineHeight') {
        next.lineHeight = Math.max(1.35, Math.min(2.4, Math.round((preferences.lineHeight + delta) * 10) / 10));
      }
      if (key === 'margin') {
        next.margin = Math.max(12, Math.min(40, preferences.margin + delta));
      }
      updatePreference(next);
    },
    [preferences, updatePreference]
  );

  return (
    <Animated.View style={[styles.routeShell, routeStyle]}>
      <M3Screen
        key={`settings-screen-${resolvedAppTheme}`}
        theme={theme}
        backgroundSource={appThemeAssets[resolvedAppTheme].background}
        overlayColor={resolvedAppTheme === 'deep' ? 'rgba(8, 9, 6, 0.46)' : 'rgba(250, 248, 242, 0.93)'}>
        <View
          style={[
            styles.navBar,
            {
              height: topBarHeight,
              paddingTop: insets.top,
              backgroundColor: resolvedAppTheme === 'deep' ? '#080906' : '#FAF8F2',
              borderBottomColor: theme.line,
            },
          ]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            hitSlop={16}
            pressRetentionOffset={18}
            android_ripple={{ color: 'rgba(47, 107, 79, 0.14)', borderless: true, radius: 28 }}
            style={({ pressed }) => [styles.backButton, pressed && styles.backButtonPressed]}
            onPress={closeRoute}>
            <View pointerEvents="none" style={styles.backButtonIcon}>
              <Text style={[styles.backButtonGlyph, { color: theme.text }]}>‹</Text>
            </View>
          </Pressable>
          <Text pointerEvents="none" numberOfLines={1} style={[styles.navTitle, { color: theme.text }]}>
            设置
          </Text>
        </View>

        <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingTop: topBarHeight + 24 }, width >= 700 && styles.contentWide]}>
          {loading ? (
            <View style={[styles.loadingPanel, { borderColor: theme.line, backgroundColor: theme.surfaceSolid }]}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>正在读取偏好</Text>
            </View>
          ) : (
            <>
              <View style={[styles.intro, { borderBottomColor: theme.line }]}>
                <Text style={[styles.screenMeta, { color: theme.muted }]}>
                  {appThemeModeCopy[preferences.appThemeMode].title} · {readerThemeCopy[preferences.readerTheme].title} · {readingModeCopy[preferences.readingMode].title}
                </Text>
                <Text accessibilityLiveRegion="polite" style={[styles.saveStatus, { color: saving ? theme.accent : theme.muted }]}>
                  {saving ? '保存中' : '已保存'}
                </Text>
              </View>

              <SettingGroup theme={theme} title="界面主题" value={appThemeModeCopy[preferences.appThemeMode].title}>
                {brand.appThemeModes.map((themeMode) => {
                  const active = preferences.appThemeMode === themeMode;
                  const copy = appThemeModeCopy[themeMode];
                  return (
                    <PreferenceChoice
                      key={themeMode}
                      theme={theme}
                      title={copy.title}
                      detail={copy.body}
                      selected={active}
                      swatch={appThemeSwatches[themeMode]}
                      icon={themeMode === 'system' ? 'settings' : themeMode === 'mist' ? 'bookmark' : 'textformat.size'}
                      onPress={() => updatePreference({ ...preferences, appThemeMode: themeMode })}
                    />
                  );
                })}
              </SettingGroup>

              <SettingGroup theme={theme} title="阅读纸张" value={readerThemeCopy[preferences.readerTheme].title}>
                {brand.readerThemeOrder.map((readerTheme) => {
                  const active = preferences.readerTheme === readerTheme;
                  const copy = readerThemeCopy[readerTheme];
                  return (
                    <PreferenceChoice
                      key={readerTheme}
                      theme={theme}
                      title={copy.title}
                      detail={copy.body}
                      selected={active}
                      swatch={readerThemeSwatches[readerTheme]}
                      icon={readerTheme === 'night' ? 'textformat.size' : readerTheme === 'eink' ? 'list.bullet' : 'bookmark'}
                      onPress={() => updatePreference({ ...preferences, readerTheme })}
                    />
                  );
                })}
              </SettingGroup>

              <SettingGroup theme={theme} title="阅读方式" value={readingModeCopy[preferences.readingMode].title}>
                <ModeSelector
                  theme={theme}
                  value={preferences.readingMode}
                  onChange={(readingMode) => updatePreference({ ...preferences, readingMode })}
                />
              </SettingGroup>

              <SettingGroup theme={theme} title="排版">
                <ReadingPreview preferences={preferences} />
                <View style={styles.stepperStack}>
                  <PreferenceStepper theme={theme} label="字号" value={String(preferences.fontSize)} onMinus={() => stepPreference('fontSize', -1)} onPlus={() => stepPreference('fontSize', 1)} />
                  <PreferenceStepper theme={theme} label="行距" value={preferences.lineHeight.toFixed(1)} onMinus={() => stepPreference('lineHeight', -0.1)} onPlus={() => stepPreference('lineHeight', 0.1)} />
                  <PreferenceStepper theme={theme} label="页边距" value={String(preferences.margin)} onMinus={() => stepPreference('margin', -2)} onPlus={() => stepPreference('margin', 2)} />
                </View>
              </SettingGroup>
            </>
          )}
        </ScrollView>
      </M3Screen>
    </Animated.View>
  );
}

function SettingGroup({
  theme,
  title,
  value,
  children,
}: {
  theme: SettingsTheme;
  title: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.settingGroup}>
      <View style={styles.settingHeader}>
        <Text style={[styles.settingTitle, { color: theme.text }]}>{title}</Text>
        {value ? <Text style={[styles.settingValue, { color: theme.accent }]}>{value}</Text> : null}
      </View>
      <View style={[styles.settingSurface, { borderTopColor: theme.line, borderBottomColor: theme.line }]}>{children}</View>
    </View>
  );
}

function PreferenceChoice({
  theme,
  title,
  detail,
  selected,
  swatch,
  icon,
  onPress,
}: {
  theme: SettingsTheme;
  title: string;
  detail: string;
  selected: boolean;
  swatch: ThemeChoiceSwatch;
  icon: MaterialSymbolName;
  onPress: () => void;
}) {
  return (
    <M3Pressable
      onPress={onPress}
      feedback={selected ? 'subtle' : 'standard'}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.choiceRow,
        {
          backgroundColor: 'transparent',
          borderBottomColor: theme.line,
        },
      ]}>
      <View style={[styles.choiceIcon, { backgroundColor: selected ? theme.accent : theme.surfaceContainer }]}>
        <MaterialSymbol name={selected ? 'check' : icon} color={selected ? theme.accentText : theme.muted} description={title} decorative size={16} />
      </View>
      <View style={styles.choiceCopy}>
        <Text numberOfLines={1} style={[styles.choiceTitle, { color: theme.text }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.choiceDetail, { color: theme.muted }]}>
          {detail}
        </Text>
      </View>
      <View style={styles.choiceSwatch} accessibilityElementsHidden>
        {swatch.map((color) => (
          <View key={color} style={[styles.choiceSwatchDot, { backgroundColor: color, borderColor: theme.line }]} />
        ))}
      </View>
    </M3Pressable>
  );
}

function ModeSelector({
  theme,
  value,
  onChange,
}: {
  theme: SettingsTheme;
  value: ReaderPreferences['readingMode'];
  onChange: (value: ReaderPreferences['readingMode']) => void;
}) {
  return (
    <View style={[styles.modeSelector, { backgroundColor: theme.surfaceContainer, borderColor: theme.line }]}>
      {(['scroll', 'page'] as const).map((mode) => {
        const selected = value === mode;
        return (
          <M3Pressable
            key={mode}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            feedback={selected ? 'subtle' : 'standard'}
            onPress={() => onChange(mode)}
            style={[styles.modeOption, selected && { backgroundColor: theme.surfaceSolid, borderColor: theme.accent }]}>
            <Text style={[styles.modeOptionText, { color: selected ? theme.text : theme.muted }]}>{readingModeCopy[mode].title}</Text>
          </M3Pressable>
        );
      })}
    </View>
  );
}

function PreferenceStepper({
  theme,
  label,
  value,
  onMinus,
  onPlus,
}: {
  theme: SettingsTheme;
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <View style={[styles.preferenceStepper, { borderBottomColor: theme.line }]}>
      <Text style={[styles.stepperLabel, { color: theme.text }]}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`减少${label}`}
          hitSlop={8}
          android_ripple={{ color: 'rgba(47, 107, 79, 0.16)', borderless: true, radius: 24 }}
          style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.surfaceContainer }, pressed && styles.stepperButtonPressed]}
          onPress={onMinus}>
          <Text style={[styles.stepperButtonText, { color: theme.accent }]}>-</Text>
        </Pressable>
        <Text style={[styles.stepperValue, { color: theme.text }]}>{value}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`增加${label}`}
          hitSlop={8}
          android_ripple={{ color: 'rgba(47, 107, 79, 0.16)', borderless: true, radius: 24 }}
          style={({ pressed }) => [styles.stepperButton, { backgroundColor: theme.surfaceContainer }, pressed && styles.stepperButtonPressed]}
          onPress={onPlus}>
          <Text style={[styles.stepperButtonText, { color: theme.accent }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ReadingPreview({ preferences }: { preferences: ReaderPreferences }) {
  const token = brand.readerThemes[preferences.readerTheme];
  const previewFontSize = Math.max(17, Math.min(22, preferences.fontSize));
  const previewLineHeight = Math.round(previewFontSize * preferences.lineHeight);

  return (
    <View style={[styles.readerPreview, { backgroundColor: token.surfaceSolid, borderColor: token.line }]}>
      <View style={styles.readerPreviewMeta}>
        <Text style={[styles.readerPreviewKicker, { color: token.accent }]}>预览</Text>
        <Text style={[styles.readerPreviewMode, { color: token.muted }]}>{readingModeCopy[preferences.readingMode].title}</Text>
      </View>
      <Text
        numberOfLines={4}
        style={[
          styles.readerPreviewText,
          {
            color: token.text,
            fontSize: previewFontSize,
            lineHeight: previewLineHeight,
            paddingHorizontal: Math.max(6, Math.min(18, preferences.margin / 2)),
          },
        ]}>
        夜读有灯，纸页有声。字距舒展一点，长读就慢下来。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  routeShell: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 96,
    gap: 24,
  },
  contentWide: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  navBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    borderBottomWidth: 1,
    justifyContent: 'center',
  },
  backButton: {
    marginLeft: 4,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    opacity: 0.68,
  },
  backButtonIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonGlyph: {
    marginLeft: -2,
    marginTop: -2,
    fontSize: 38,
    lineHeight: 38,
    fontWeight: '500',
    letterSpacing: 0,
  },
  navTitle: {
    position: 'absolute',
    left: 88,
    right: 88,
    bottom: 16,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '800',
    letterSpacing: 0,
  },
  saveStatus: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: 0,
  },
  loadingPanel: {
    minHeight: 220,
    borderRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
  intro: {
    minHeight: 42,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  screenMeta: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0,
  },
  settingGroup: {
    gap: 8,
  },
  settingHeader: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  settingTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
  settingValue: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  settingSurface: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  choiceRow: {
    minHeight: 62,
    borderRadius: 0,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  choiceIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  choiceTitle: {
    color: brand.colors.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  choiceDetail: {
    color: brand.colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  choiceSwatch: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  choiceSwatchDot: {
    width: 12,
    height: 22,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeSelector: {
    minHeight: 46,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    marginVertical: 10,
  },
  modeOption: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeOptionText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    letterSpacing: 0,
  },
  readerPreview: {
    minHeight: 96,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
    overflow: 'hidden',
  },
  readerPreviewMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  readerPreviewKicker: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  readerPreviewMode: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0,
  },
  readerPreviewText: {
    fontWeight: '500',
    letterSpacing: 0,
  },
  stepperStack: {
    paddingTop: 0,
  },
  preferenceStepper: {
    minHeight: 62,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  stepperLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepperButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonPressed: {
    opacity: 0.72,
  },
  stepperButtonText: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: 0,
  },
  stepperValue: {
    minWidth: 38,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
});
