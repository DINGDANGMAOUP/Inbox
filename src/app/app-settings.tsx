import { type ReactNode, useCallback, useEffect } from 'react';
import { router, type Href } from 'expo-router';
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
import type { AppThemeMode, ResolvedAppTheme } from '@/types/reader';

type SettingsTheme = (typeof brand.appThemes)[ResolvedAppTheme];
type ThemeChoiceSwatch = readonly [string, string, string];

const appThemeModeCopy: Record<AppThemeMode, { title: string; body: string }> = {
  system: { title: '跟随系统', body: '自动' },
  mist: { title: '纸岛', body: '暖白' },
  deep: { title: '夜岛', body: '黑色' },
};

const appThemeSwatches: Record<AppThemeMode, ThemeChoiceSwatch> = {
  system: ['#F8F5EC', '#10130E', '#D7E9D7'],
  mist: ['#F8F5EC', '#EEE8DA', '#2F6B4F'],
  deep: ['#0B0E0B', '#1A2118', '#D7E9D7'],
};

export default function AppSettingsScreen() {
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

  const updateAppTheme = useCallback(
    async (appThemeMode: AppThemeMode) => {
      await updatePreferences({ ...preferences, appThemeMode });
    },
    [preferences, updatePreferences]
  );

  return (
    <Animated.View style={[styles.routeShell, routeStyle]}>
      <M3Screen
        key={`app-settings-screen-${resolvedAppTheme}`}
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
            应用设置
          </Text>
        </View>

        <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={[styles.content, { paddingTop: topBarHeight + 24 }, width >= 700 && styles.contentWide]}>
          {loading ? (
            <View style={[styles.loadingPanel, { borderColor: theme.line, backgroundColor: theme.surfaceSolid }]}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>正在读取设置</Text>
            </View>
          ) : (
            <>
              <View style={[styles.intro, { borderBottomColor: theme.line }]}>
                <Text style={[styles.screenMeta, { color: theme.muted }]}>{appThemeModeCopy[preferences.appThemeMode].title}</Text>
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
                      onPress={() => updateAppTheme(themeMode)}
                    />
                  );
                })}
              </SettingGroup>

              <SettingGroup theme={theme} title="数据与存储">
                <SettingsActionRow
                  theme={theme}
                  title="存储空间"
                  detail="查看占用，清理缓存和阅读数据"
                  icon="storage"
                  onPress={() => router.push('/storage' as Href)}
                />
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

function SettingsActionRow({
  theme,
  title,
  detail,
  icon,
  onPress,
}: {
  theme: SettingsTheme;
  title: string;
  detail: string;
  icon: MaterialSymbolName;
  onPress: () => void;
}) {
  return (
    <M3Pressable onPress={onPress} feedback="standard" accessibilityRole="button" style={[styles.actionRow, { borderBottomColor: theme.line }]}>
      <View style={[styles.choiceIcon, { backgroundColor: theme.primaryContainer }]}>
        <MaterialSymbol name={icon} color={theme.onPrimaryContainer} description={title} decorative size={16} />
      </View>
      <View style={styles.choiceCopy}>
        <Text numberOfLines={1} style={[styles.choiceTitle, { color: theme.text }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.choiceDetail, { color: theme.muted }]}>
          {detail}
        </Text>
      </View>
      <MaterialSymbol name="chevron.right" color={theme.muted} description={`${title}详情`} decorative size={18} />
    </M3Pressable>
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
      style={[styles.choiceRow, { borderBottomColor: theme.line }]}>
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
  actionRow: {
    minHeight: 64,
    borderRadius: 0,
    borderCurve: 'continuous',
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
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  choiceDetail: {
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
});
