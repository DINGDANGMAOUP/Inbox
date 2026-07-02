import { Image } from 'expo-image';
import { useCallback, useEffect } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { IconButton } from '@/components/reader/icon-button';
import { M3InfoRow, M3Screen, M3Section, M3TopAppBar } from '@/components/reader/m3';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { m3Motion } from '@/components/reader/motion-presets';
import { useRouteSlideTransition } from '@/components/reader/route-slide-transition';
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { appThemeAssets } from '@/constants/theme-assets';
import { useReaderPreferences } from '@/hooks/use-reader-preferences';
import { getInstalledAppVersion, getUpdateSourceInfo } from '@/lib/app-update-service';

export default function AboutScreen() {
  const { resolvedAppTheme } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];
  const installedVersion = getInstalledAppVersion();
  const updateSource = getUpdateSourceInfo();
  const isDeepTheme = resolvedAppTheme === 'deep';
  const headerTheme = {
    ...theme,
    surface: theme.surfaceSolid,
    surfaceSolid: theme.surfaceSolid,
    surfaceContainer: theme.surfaceContainer,
    surfaceContainerHigh: theme.surfaceContainerHigh,
    primaryContainer: theme.primaryContainer,
    onPrimaryContainer: theme.onPrimaryContainer,
  };
  const handleBack = useCallback(() => {
    closeRoute();
  }, [closeRoute]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack]);

  return (
    <Animated.View style={[styles.routeShell, routeStyle]}>
      <M3Screen
        key={`about-screen-${resolvedAppTheme}`}
        theme={theme}
        backgroundSource={appThemeAssets[resolvedAppTheme].background}
        overlayColor={isDeepTheme ? 'rgba(8, 9, 6, 0.36)' : 'rgba(247, 243, 234, 0.78)'}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, width >= 700 && styles.contentWide]}>
        <M3TopAppBar
          theme={headerTheme}
          title="关于"
          subtitle="墨屿 Inbox"
          leading={
            <IconButton
              icon="chevron.left"
              label="返回"
              tone="quiet"
              tintColor={theme.text}
              size="icon"
              style={{ backgroundColor: theme.surfaceContainer, borderColor: theme.line }}
              onPress={handleBack}
            />
          }
          trailing={
            <View style={styles.versionPill}>
              <Text style={styles.versionPillText}>v{installedVersion.version} 内测</Text>
            </View>
          }
        />

        <Animated.View
          entering={m3Motion.fadeDown(motion.stagger.section)}
          layout={m3Motion.layoutMedium()}
          style={styles.hero}>
          <View style={styles.heroBrandRow}>
            <View style={styles.heroLogoSeal}>
              <Image source={brandAssets.logoMark} contentFit="cover" style={styles.heroLogo} />
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>PRIVATE LIBRARY</Text>
              <Text style={styles.title}>墨屿</Text>
              <Text style={styles.subtitle}>安静、离线、适合长读的本地书库。</Text>
            </View>
          </View>
          <View style={styles.heroDivider} />
          <View style={styles.heroPills}>
            <AboutPill icon="bookmark" label="本地书库" />
            <AboutPill icon="textformat.size" label="长读友好" />
            <AboutPill icon="tray.and.arrow.down" label="EPUB / TXT" />
          </View>
        </Animated.View>

        <Animated.View entering={m3Motion.fadeDown(motion.stagger.section * 2)} style={styles.promiseGrid}>
          <AboutPrinciple theme={theme} icon="bookmark" title="本地优先" body="书籍与阅读记录保存在这台设备。" />
          <AboutPrinciple theme={theme} icon="textformat.size" title="长读友好" body="保留主题、字号、行距和翻页偏好。" />
          <AboutPrinciple theme={theme} icon="check.circle" title="轻量安静" body="不做账号系统，也不把书城放进阅读动线。" />
        </Animated.View>

        <M3Section theme={theme} title="产品信息" order={3} contentStyle={styles.infoSectionSurface}>
          <M3InfoRow theme={theme} title="产品名" value="墨屿" icon="info" />
          <M3InfoRow theme={theme} title="英文名" value="Inbox" icon="info" />
          <M3InfoRow theme={theme} title="阶段" value="开发内测" icon="check.circle" />
          <M3InfoRow theme={theme} title="版本" value={`${installedVersion.version} (${installedVersion.buildNumber || '开发'})`} icon="check.circle" />
          <M3InfoRow theme={theme} title="运行环境" value={executionEnvironmentLabel(String(installedVersion.environment))} icon="settings" />
          <M3InfoRow theme={theme} title="支持格式" value="EPUB / TXT" icon="tray.and.arrow.down" />
          <M3InfoRow theme={theme} title="更新渠道" value={updateSource.label} icon="download" />
        </M3Section>

        <M3Section theme={theme} title="数据" order={4} contentStyle={styles.infoSectionSurface}>
          <M3InfoRow theme={theme} title="书籍" value="应用文档目录" icon="bookmark" />
          <M3InfoRow theme={theme} title="阅读记录" value="本机数据库" icon="check.circle" />
          <M3InfoRow theme={theme} title="账号" value="无" icon="info" />
        </M3Section>
      </ScrollView>
      </M3Screen>
    </Animated.View>
  );
}

function AboutPill({ icon, label }: { icon: MaterialSymbolName; label: string }) {
  return (
    <View style={styles.aboutPill}>
      <MaterialSymbol name={icon} color={brand.colors.copper} description={label} decorative size={15} />
      <Text style={styles.aboutPillText}>{label}</Text>
    </View>
  );
}

function AboutPrinciple({
  theme,
  icon,
  title,
  body,
}: {
  theme: typeof brand.appThemes[keyof typeof brand.appThemes];
  icon: MaterialSymbolName;
  title: string;
  body: string;
}) {
  return (
    <View style={[styles.principleCard, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
      <View style={[styles.principleIcon, { backgroundColor: theme.primaryContainer }]}>
        <MaterialSymbol name={icon} color={theme.onPrimaryContainer} description={title} decorative size={17} />
      </View>
      <View style={styles.principleCopy}>
        <Text style={[styles.principleTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.principleBody, { color: theme.muted }]}>{body}</Text>
      </View>
    </View>
  );
}

function executionEnvironmentLabel(environment: string) {
  if (environment.includes('storeClient')) {
    return 'Expo Go 预览';
  }
  if (environment.includes('standalone')) {
    return '已安装应用';
  }
  if (environment.includes('bare')) {
    return '原生构建';
  }
  return '开发预览';
}

const styles = StyleSheet.create({
  routeShell: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 44,
    paddingBottom: 44,
    gap: 18,
  },
  contentWide: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  versionPill: {
    minHeight: 34,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  versionPillText: {
    color: brand.colors.onPrimaryContainer,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  hero: {
    minHeight: 206,
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(18, 20, 15, 0.08)',
    backgroundColor: brand.colors.paperElevated,
    padding: 18,
    gap: 16,
    boxShadow: brand.shadow.card,
    overflow: 'hidden',
  },
  heroBrandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  heroLogoSeal: {
    width: 76,
    height: 76,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    backgroundColor: '#F3E9D2',
    overflow: 'hidden',
    boxShadow: '0 12px 24px rgba(18, 20, 15, 0.12)',
  },
  heroLogo: {
    width: '100%',
    height: '100%',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  eyebrow: {
    color: brand.colors.copper,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    color: brand.colors.ink,
    fontSize: 42,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: brand.colors.muted,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
    letterSpacing: 0,
  },
  heroDivider: {
    height: 1,
    backgroundColor: 'rgba(18, 20, 15, 0.08)',
  },
  heroPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aboutPill: {
    minHeight: 36,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    backgroundColor: brand.colors.copperSoft,
    borderWidth: 1,
    borderColor: 'rgba(47, 107, 79, 0.16)',
  },
  aboutPillText: {
    color: brand.colors.onPrimaryContainer,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  promiseGrid: {
    gap: 8,
  },
  principleCard: {
    minHeight: 78,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    boxShadow: '0 6px 16px rgba(18, 20, 15, 0.05)',
  },
  principleIcon: {
    width: 40,
    height: 40,
    borderRadius: brand.radius.small,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  principleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  principleTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    letterSpacing: 0,
  },
  principleBody: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  infoSectionSurface: {
    padding: 10,
    gap: 0,
  },
  paragraph: {
    color: brand.colors.muted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
  },
});
