import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';

import { IconButton } from '@/components/reader/icon-button';
import { M3FeatureCard, M3InfoRow, M3Screen, M3Section, M3TopAppBar } from '@/components/reader/m3';
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { appThemeAssets } from '@/constants/theme-assets';
import { useReaderPreferences } from '@/hooks/use-reader-preferences';
import { getInstalledAppVersion, getUpdateSourceInfo } from '@/lib/app-update-service';

export default function AboutScreen() {
  const { resolvedAppTheme } = useReaderPreferences();
  const theme = brand.appThemes[resolvedAppTheme];
  const installedVersion = getInstalledAppVersion();
  const updateSource = getUpdateSourceInfo();
  const isDeepTheme = resolvedAppTheme === 'deep';
  const chromeTheme = {
    ...theme,
    surface: '#151611',
    surfaceSolid: '#151611',
    surfaceContainer: 'rgba(255, 255, 255, 0.08)',
    surfaceContainerHigh: 'rgba(255, 255, 255, 0.12)',
    text: '#F7F0E4',
    muted: 'rgba(247, 240, 228, 0.62)',
    accent: '#E7D9B7',
    accentText: '#171811',
    primaryContainer: '#E7D9B7',
    onPrimaryContainer: '#171811',
    line: 'rgba(255, 255, 255, 0.12)',
  };

  return (
    <M3Screen
      key={`about-screen-${resolvedAppTheme}`}
      theme={theme}
      backgroundSource={appThemeAssets[resolvedAppTheme].background}
      overlayColor={isDeepTheme ? 'rgba(8, 9, 6, 0.36)' : 'rgba(247, 243, 234, 0.78)'}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <M3TopAppBar
          theme={chromeTheme}
          title="关于墨屿"
          subtitle="Private Library"
          leading={
            <IconButton
              icon="chevron.left"
              label="返回"
              tone="quiet"
              tintColor="#F7F0E4"
              size="icon"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)', borderColor: 'rgba(255, 255, 255, 0.14)' }}
              onPress={() => router.back()}
            />
          }
          trailing={
            <View style={styles.versionPill}>
              <Text style={styles.versionPillText}>v{installedVersion.version}</Text>
            </View>
          }
        />

        <Animated.View
          entering={FadeInDown.delay(motion.stagger.section).duration(motion.duration.medium)}
          layout={LinearTransition.duration(motion.duration.medium)}
          style={styles.hero}>
          <Image source={brandAssets.logoBoard} contentFit="contain" style={styles.logoBoard} />
          <Text style={styles.eyebrow}>PRIVATE LIBRARY</Text>
          <Text style={styles.title}>墨屿</Text>
          <Text style={styles.subtitle}>安静、离线、适合长读的本地书库。</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(motion.stagger.section * 2).duration(motion.duration.medium)} style={styles.promiseGrid}>
          <M3FeatureCard theme={theme} icon="bookmark" title="本地书库" body="导入 EPUB 与 TXT。" />
          <M3FeatureCard theme={theme} icon="textformat.size" title="长读友好" body="滚动、翻页和阅读主题。" />
          <M3FeatureCard theme={theme} icon="check.circle" title="轻量" body="没有账号和书城。" />
        </Animated.View>

        <M3Section theme={theme} title="产品信息" order={3}>
          <M3InfoRow theme={theme} title="产品名" value="墨屿" icon="info" />
          <M3InfoRow theme={theme} title="英文名" value="Inbox" icon="info" />
          <M3InfoRow theme={theme} title="版本" value={`${installedVersion.version} (${installedVersion.buildNumber || '开发'})`} icon="check.circle" />
          <M3InfoRow theme={theme} title="运行环境" value={executionEnvironmentLabel(String(installedVersion.environment))} icon="settings" />
          <M3InfoRow theme={theme} title="支持格式" value="EPUB / TXT" icon="tray.and.arrow.down" />
          <M3InfoRow theme={theme} title="更新渠道" value={updateSource.label} icon="download" />
        </M3Section>

        <M3Section theme={theme} title="数据" order={4}>
          <M3InfoRow theme={theme} title="书籍" value="应用文档目录" icon="bookmark" />
          <M3InfoRow theme={theme} title="阅读记录" value="本机数据库" icon="check.circle" />
          <M3InfoRow theme={theme} title="账号" value="无" icon="info" />
        </M3Section>
      </ScrollView>
    </M3Screen>
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
  content: {
    paddingHorizontal: 20,
    paddingTop: 52,
    paddingBottom: 44,
    gap: 16,
  },
  versionPill: {
    minHeight: 34,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    backgroundColor: '#E7D9B7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  versionPillText: {
    color: '#171811',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  hero: {
    minHeight: 252,
    borderRadius: 30,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: '#151611',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
    boxShadow: '0 24px 54px rgba(0, 0, 0, 0.22)',
  },
  logoBoard: {
    width: '100%',
    maxWidth: 300,
    height: 160,
    borderRadius: brand.radius.large,
  },
  eyebrow: {
    color: '#D8C59A',
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: '#F7F0E4',
    fontSize: 46,
    lineHeight: 52,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(247, 240, 228, 0.72)',
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
  },
  promiseGrid: {
    gap: 10,
  },
  paragraph: {
    color: brand.colors.muted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
  },
});
