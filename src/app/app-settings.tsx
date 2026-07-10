import { type ReactNode, useCallback, useEffect } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { PageHeader, AppScreen } from '@/components/ui/app-ui';
import { FeedbackPressable } from '@/components/ui/feedback-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/ui/material-symbol';
import { useRouteSlideTransition } from '@/components/ui/route-slide-transition';
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
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];

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
      <AppScreen
        key={`app-settings-screen-${resolvedAppTheme}`}
        theme={theme}
        backgroundSource={appThemeAssets[resolvedAppTheme].background}
        overlayColor={resolvedAppTheme === 'deep' ? 'rgba(8, 9, 6, 0.46)' : 'rgba(250, 248, 242, 0.93)'}>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, width >= 700 && styles.contentWide]}>
          <PageHeader
            theme={theme}
            title="应用设置"
            subtitle={saving ? '界面主题和数据管理 · 保存中' : '界面主题和数据管理'}
            onBack={closeRoute}
          />
          {loading ? (
            <View style={[styles.loadingPanel, { borderColor: theme.line, backgroundColor: theme.surfaceSolid }]}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>正在读取设置</Text>
            </View>
          ) : (
            <>
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
            </>
          )}
        </ScrollView>
      </AppScreen>
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
      <View style={[styles.settingSurface, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>{children}</View>
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
    <FeedbackPressable
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
    </FeedbackPressable>
  );
}

const styles = StyleSheet.create({
  routeShell: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 96,
    gap: 22,
  },
  contentWide: {
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
  },
  loadingPanel: {
    minHeight: 220,
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    boxShadow: brand.shadow.card,
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
  settingGroup: {
    gap: 10,
  },
  settingHeader: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  settingTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: 0,
  },
  settingValue: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  settingSurface: {
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
    boxShadow: brand.shadow.card,
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
    paddingHorizontal: 14,
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
