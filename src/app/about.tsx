import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/reader/icon-button';
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { themeAssets } from '@/constants/theme-assets';
import { useReaderPreferences } from '@/hooks/use-reader-preferences';
import type { ReaderTheme } from '@/types/reader';

const version = Constants.expoConfig?.version ?? '1.0.0';
type ThemeToken = (typeof brand.themes)[ReaderTheme];

export default function AboutScreen() {
  const { preferences } = useReaderPreferences();
  const theme = brand.themes[preferences.theme];
  const isDeepTheme = preferences.theme === 'deep';
  const heroTextColor = isDeepTheme ? brand.colors.white : theme.text;
  const heroMutedColor = isDeepTheme ? 'rgba(255, 255, 255, 0.78)' : theme.muted;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Image
        key={`about-background-${preferences.theme}`}
        source={themeAssets[preferences.theme].background}
        contentFit="cover"
        transition={180}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.scrim, { backgroundColor: theme.overlay }]} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <IconButton icon="chevron.left" label="返回" tone="quiet" onPress={() => router.back()} />

        <View style={[styles.hero, isDeepTheme ? styles.heroDeep : { backgroundColor: theme.surface, borderColor: theme.line }]}>
          <Image source={brandAssets.logoMark} contentFit="cover" style={styles.logo} />
          <Text style={[styles.eyebrow, { color: isDeepTheme ? 'rgba(255, 255, 255, 0.72)' : theme.accent }]}>INBOX · OFFLINE READER</Text>
          <Text style={[styles.title, { color: heroTextColor }]}>墨屿</Text>
          <Text style={[styles.subtitle, { color: heroMutedColor }]}>一座只属于你的安静书岛。把 EPUB 与 TXT 收进本机，在没有账号、书城和云同步的地方，认真读书。</Text>
        </View>

        <View style={styles.promiseGrid}>
          <PromiseCard theme={theme} title="离线优先" body="导入、解析、进度、搜索和标注都优先保存在本机。" />
          <PromiseCard theme={theme} title="不做书城" body="墨屿不承载远程下载和推荐流，首页只服务你的藏书。" />
          <PromiseCard theme={theme} title="长读友好" body="滚动与翻页分离，章节边界清晰，界面可随时收起。" />
        </View>

        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.line }]}>
          <Text style={[styles.sectionKicker, { color: theme.accent }]}>PRODUCT</Text>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>产品信息</Text>
          <InfoRow theme={theme} title="产品名" value="墨屿" />
          <InfoRow theme={theme} title="英文名" value="Inbox" />
          <InfoRow theme={theme} title="版本" value={version} />
          <InfoRow theme={theme} title="支持格式" value="EPUB / TXT" />
        </View>

        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.line }]}>
          <Text style={[styles.sectionKicker, { color: theme.accent }]}>LOCAL DATA</Text>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>本地数据说明</Text>
          <Text style={[styles.paragraph, { color: theme.muted }]}>书籍文件会复制到应用文档目录。阅读进度、目录、搜索文本、书签、划线、笔记和阅读偏好保存在本机 SQLite 数据库。</Text>
          <Text style={[styles.paragraph, { color: theme.muted }]}>首版不提供账号、云同步、远程书城和 PDF 支持。后续如果加入备份，也应先保持用户可见、可控、可退出。</Text>
        </View>

        <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.line }]}>
          <Text style={[styles.sectionKicker, { color: theme.accent }]}>CREDITS</Text>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>构建基础</Text>
          <InfoRow theme={theme} title="应用框架" value="Expo 56" />
          <InfoRow theme={theme} title="本地数据库" value="Expo SQLite" />
          <InfoRow theme={theme} title="EPUB 渲染" value="WebView" />
          <InfoRow theme={theme} title="动效" value="Reanimated" />
        </View>
      </ScrollView>
    </View>
  );
}

function PromiseCard({ theme, title, body }: { theme: ThemeToken; title: string; body: string }) {
  return (
    <View style={[styles.promiseCard, { backgroundColor: theme.surface, borderColor: theme.line }]}>
      <Text style={[styles.promiseTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.promiseBody, { color: theme.muted }]}>{body}</Text>
    </View>
  );
}

function InfoRow({ theme, title, value }: { theme: ThemeToken; title: string; value: string }) {
  return (
    <View style={[styles.infoRow, { borderBottomColor: theme.line }]}>
      <Text style={[styles.infoTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.infoValue, { color: theme.muted }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brand.colors.readingPaper,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(243, 239, 230, 0.34)',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 44,
    gap: 18,
  },
  hero: {
    minHeight: 292,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.70)',
    backgroundColor: 'rgba(252, 248, 239, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
    boxShadow: brand.shadow.card,
  },
  heroDeep: {
    backgroundColor: 'rgba(32, 50, 64, 0.66)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
  },
  logo: {
    width: 94,
    height: 94,
    borderRadius: 24,
  },
  eyebrow: {
    color: brand.colors.copper,
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: brand.colors.ink,
    fontSize: 46,
    lineHeight: 52,
    fontWeight: '900',
  },
  subtitle: {
    color: brand.colors.muted,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '700',
  },
  promiseGrid: {
    gap: 10,
  },
  promiseCard: {
    minHeight: 86,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(247, 248, 251, 0.80)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    padding: 16,
    gap: 6,
  },
  promiseTitle: {
    color: brand.colors.ink,
    fontSize: 17,
    fontWeight: '900',
  },
  promiseBody: {
    color: brand.colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  section: {
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    backgroundColor: 'rgba(252, 248, 239, 0.86)',
    padding: 18,
    gap: 8,
    boxShadow: brand.shadow.card,
  },
  sectionKicker: {
    color: brand.colors.copper,
    fontSize: 11,
    fontWeight: '900',
  },
  sectionTitle: {
    color: brand.colors.ink,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  paragraph: {
    color: brand.colors.muted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
  },
  infoRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(140, 118, 102, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoTitle: {
    color: brand.colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  infoValue: {
    color: brand.colors.muted,
    fontSize: 13,
    fontWeight: '800',
  },
});
