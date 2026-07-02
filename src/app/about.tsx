import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { IconButton } from '@/components/reader/icon-button';
import { M3InfoRow, M3ProgressRail, M3Screen, M3Section, M3TopAppBar } from '@/components/reader/m3';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { m3Motion } from '@/components/reader/motion-presets';
import { useRouteSlideTransition } from '@/components/reader/route-slide-transition';
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { appThemeAssets } from '@/constants/theme-assets';
import { useReaderPreferences } from '@/hooks/use-reader-preferences';
import {
  checkForGithubAppUpdate,
  downloadGithubApk,
  getInstalledAppVersion,
  getUpdateSourceInfo,
  installDownloadedApk,
  openReleasePage,
  type RemoteAppVersion,
} from '@/lib/app-update-service';

type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'current'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'unavailable'
  | 'error'
  | 'unsupported';
type AboutTheme = (typeof brand.appThemes)[keyof typeof brand.appThemes];

export default function AboutScreen() {
  const { resolvedAppTheme } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];
  const installedVersion = useMemo(() => getInstalledAppVersion(), []);
  const updateSource = useMemo(() => getUpdateSourceInfo(), []);
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle');
  const [updateMessage, setUpdateMessage] = useState('查看当前版本，按需检查内测更新。');
  const [remoteUpdate, setRemoteUpdate] = useState<RemoteAppVersion | undefined>();
  const [downloadedApkUri, setDownloadedApkUri] = useState<string | undefined>();
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadBytes, setDownloadBytes] = useState({ written: 0, total: 0 });
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>();
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

  const checkUpdate = useCallback(async () => {
    setUpdatePhase('checking');
    setDownloadedApkUri(undefined);
    setDownloadProgress(0);
    setDownloadBytes({ written: 0, total: 0 });
    try {
      const result = await checkForGithubAppUpdate();
      setLastCheckedAt(new Date().toISOString());
      setUpdateMessage(result.message);

      if (result.status === 'error' && result.message.startsWith('暂未')) {
        setRemoteUpdate(undefined);
        setUpdatePhase('current');
        return;
      }

      if (result.status === 'error' && isUpdateSourceUnavailable(result.message)) {
        setRemoteUpdate(undefined);
        setUpdatePhase('unavailable');
        setUpdateMessage('更新源暂时无法访问，可稍后重试或查看内测页面。');
        return;
      }

      if (result.status === 'available') {
        setRemoteUpdate(result.remote);
        setUpdatePhase('available');
        return;
      }

      setRemoteUpdate(result.status === 'current' ? result.remote : undefined);
      setUpdatePhase(result.status);
    } catch (error) {
      const message = error instanceof Error ? error.message : '检查内测更新失败。';
      if (message.startsWith('暂未')) {
        setRemoteUpdate(undefined);
        setUpdatePhase('current');
        setUpdateMessage(message);
        return;
      }
      if (isUpdateSourceUnavailable(message)) {
        setRemoteUpdate(undefined);
        setUpdatePhase('unavailable');
        setUpdateMessage('更新源暂时无法访问，可稍后重试或查看内测页面。');
        return;
      }
      setUpdatePhase('error');
      setUpdateMessage(message);
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    if (!remoteUpdate) {
      return;
    }

    setUpdatePhase('downloading');
    setUpdateMessage('正在下载');
    try {
      const file = await downloadGithubApk(remoteUpdate, (progress, written, total) => {
        setDownloadProgress(progress);
        setDownloadBytes({ written, total });
      });
      setDownloadedApkUri(file.uri);
      setDownloadProgress(1);
      setUpdatePhase('downloaded');
      setUpdateMessage('下载完成，可以打开 Android 安装器。');
    } catch (error) {
      setUpdatePhase('error');
      setUpdateMessage(error instanceof Error ? error.message : '下载内测失败。');
    }
  }, [remoteUpdate]);

  const installUpdate = useCallback(async () => {
    if (!downloadedApkUri) {
      return;
    }

    setUpdatePhase('installing');
    setUpdateMessage('正在打开安装器');
    try {
      await installDownloadedApk(downloadedApkUri);
      setUpdatePhase('downloaded');
    } catch (error) {
      setUpdatePhase('error');
      setUpdateMessage(error instanceof Error ? error.message : '无法打开安装器。');
    }
  }, [downloadedApkUri]);

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

        <M3Section theme={theme} title="版本更新" kicker={updateSectionKicker(updatePhase)} order={3} contentStyle={styles.updateSectionSurface}>
          <UpdatePanel
            theme={theme}
            phase={updatePhase}
            message={updateMessage}
            sourceLabel={updateSource.label}
            installedVersion={installedVersion.version}
            installedBuild={installedVersion.buildNumber}
            remoteUpdate={remoteUpdate}
            progress={downloadProgress}
            bytes={downloadBytes}
            lastCheckedAt={lastCheckedAt}
            onCheck={checkUpdate}
            onDownload={downloadUpdate}
            onInstall={installUpdate}
            onOpenRelease={() => openReleasePage(remoteUpdate)}
          />
        </M3Section>

        <M3Section theme={theme} title="产品信息" order={4} contentStyle={styles.infoSectionSurface}>
          <M3InfoRow theme={theme} title="产品名" value="墨屿" icon="info" />
          <M3InfoRow theme={theme} title="英文名" value="Inbox" icon="info" />
          <M3InfoRow theme={theme} title="阶段" value="开发内测" icon="check.circle" />
          <M3InfoRow theme={theme} title="版本" value={`${installedVersion.version} (${installedVersion.buildNumber || '开发'})`} icon="check.circle" />
          <M3InfoRow theme={theme} title="运行环境" value={executionEnvironmentLabel(String(installedVersion.environment))} icon="settings" />
          <M3InfoRow theme={theme} title="支持格式" value="EPUB / TXT" icon="tray.and.arrow.down" />
          <M3InfoRow theme={theme} title="更新渠道" value={updateSource.label} icon="download" />
        </M3Section>

        <M3Section theme={theme} title="数据" order={5} contentStyle={styles.infoSectionSurface}>
          <M3InfoRow theme={theme} title="书籍" value="应用文档目录" icon="bookmark" />
          <M3InfoRow theme={theme} title="阅读记录" value="本机数据库" icon="check.circle" />
          <M3InfoRow theme={theme} title="账号" value="无" icon="info" />
        </M3Section>
      </ScrollView>
      </M3Screen>
    </Animated.View>
  );
}

function UpdatePanel({
  theme,
  phase,
  message,
  sourceLabel,
  installedVersion,
  installedBuild,
  remoteUpdate,
  progress,
  bytes,
  lastCheckedAt,
  onCheck,
  onDownload,
  onInstall,
  onOpenRelease,
}: {
  theme: AboutTheme;
  phase: UpdatePhase;
  message: string;
  sourceLabel: string;
  installedVersion: string;
  installedBuild: number;
  remoteUpdate?: RemoteAppVersion;
  progress: number;
  bytes: { written: number; total: number };
  lastCheckedAt?: string;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onOpenRelease: () => void;
}) {
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const canDownload = phase === 'available' && Boolean(remoteUpdate);
  const canInstall = phase === 'downloaded';
  const primaryLabel = phase === 'checking' ? '检查中' : phase === 'downloading' ? '下载中' : phase === 'installing' ? '安装器' : canInstall ? '安装' : canDownload ? '下载更新' : '检查更新';
  const primaryAction = canInstall ? onInstall : canDownload ? onDownload : onCheck;
  const progressPercent = Math.round(progress * 100);

  return (
    <View style={styles.updatePanel}>
      <View style={[styles.updateStatusCard, { backgroundColor: theme.surfaceContainer, borderColor: theme.line }]}>
        <View style={[styles.updateIconWell, { backgroundColor: updateIconBackground(theme, phase) }]}>
          {busy ? (
            <ActivityIndicator color={phase === 'checking' ? theme.accent : theme.accentText} />
          ) : (
            <MaterialSymbol name={updatePhaseIcon(phase)} color={updateIconColor(theme, phase)} description={updatePhaseTitle(phase)} decorative size={24} />
          )}
        </View>
        <View style={styles.updateStatusCopy}>
          <Text style={[styles.updateTitle, { color: theme.text }]}>{updatePhaseTitle(phase)}</Text>
          <Text style={[styles.updateCaption, { color: theme.muted }]}>{message}</Text>
        </View>
      </View>

      <View style={styles.versionGrid}>
        <VersionMetric theme={theme} title="当前版本" value={`v${installedVersion}`} detail={installedBuild ? `Build ${installedBuild}` : '开发构建'} />
        <VersionMetric theme={theme} title="更新渠道" value={sourceLabel} detail={lastCheckedAt ? `${formatCheckedAt(lastCheckedAt)} 检查` : '未检查'} />
      </View>

      {remoteUpdate ? (
        <View style={[styles.releaseNoteBox, { backgroundColor: theme.surfaceContainerHigh, borderColor: theme.line }]}>
          <View style={styles.releaseNoteHeader}>
            <Text style={[styles.releaseNoteTitle, { color: theme.text }]}>{remoteUpdate.force ? '重要内测' : `内测 v${remoteUpdate.version}`}</Text>
            <Text style={[styles.releaseNoteMeta, { color: theme.muted }]}>{remoteUpdate.apkSize ? formatBytes(remoteUpdate.apkSize) : '待获取大小'}</Text>
          </View>
          <Text style={[styles.releaseNoteText, { color: theme.muted }]} numberOfLines={3}>
            {remoteUpdate.releaseNotes}
          </Text>
        </View>
      ) : null}

      {phase === 'downloading' || phase === 'downloaded' ? (
        <M3ProgressRail
          theme={theme}
          label={phase === 'downloaded' ? '下载完成' : `下载进度 ${progressPercent}%`}
          value={phase === 'downloaded' ? 1 : progress}
          detail={formatDownloadProgress(bytes)}
        />
      ) : null}

      <View style={styles.updateActions}>
        <M3Pressable
          disabled={busy}
          onPress={primaryAction}
          feedback="standard"
          stateLayerColor="rgba(255, 255, 255, 0.18)"
          style={[styles.updateButton, { backgroundColor: theme.accent }, busy && styles.disabledButton]}>
          <MaterialSymbol name={updatePhaseIcon(phase)} color={theme.accentText} description={primaryLabel} decorative size={17} />
          <Text style={[styles.updateButtonText, { color: theme.accentText }]}>{primaryLabel}</Text>
        </M3Pressable>
        <M3Pressable
          onPress={onOpenRelease}
          feedback="subtle"
          style={[styles.secondaryButton, { backgroundColor: theme.surfaceContainerHigh, borderColor: theme.line }]}>
          <MaterialSymbol name="info" color={theme.text} description="查看内测" decorative size={16} />
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>查看内测</Text>
        </M3Pressable>
      </View>

      <Text style={[styles.updateFinePrint, { color: theme.muted }]}>下载后由 Android 系统确认安装。</Text>
    </View>
  );
}

function VersionMetric({ theme, title, value, detail }: { theme: AboutTheme; title: string; value: string; detail: string }) {
  return (
    <View style={[styles.versionMetric, { backgroundColor: theme.surfaceContainerHigh, borderColor: theme.line }]}>
      <Text style={[styles.versionMetricTitle, { color: theme.muted }]}>{title}</Text>
      <Text numberOfLines={1} style={[styles.versionMetricValue, { color: theme.text }]}>
        {value}
      </Text>
      <Text numberOfLines={1} style={[styles.versionMetricDetail, { color: theme.muted }]}>
        {detail}
      </Text>
    </View>
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

function updateSectionKicker(phase: UpdatePhase) {
  if (phase === 'available') {
    return '可更新';
  }
  if (phase === 'current') {
    return '已最新';
  }
  if (phase === 'downloading' || phase === 'downloaded' || phase === 'installing') {
    return '安装中';
  }
  if (phase === 'unavailable') {
    return '稍后再试';
  }
  if (phase === 'error' || phase === 'unsupported') {
    return '需处理';
  }
  return '手动检查';
}

function updatePhaseTitle(phase: UpdatePhase) {
  switch (phase) {
    case 'checking':
      return '正在检查';
    case 'current':
      return '已是最新版本';
    case 'available':
      return '发现新内测';
    case 'downloading':
      return '正在下载';
    case 'downloaded':
      return '准备安装';
    case 'installing':
      return '等待系统确认';
    case 'unavailable':
      return '更新源暂不可用';
    case 'unsupported':
      return '当前平台不支持';
    case 'error':
      return '更新检查失败';
    default:
      return '版本更新';
  }
}

function updatePhaseIcon(phase: UpdatePhase): MaterialSymbolName {
  switch (phase) {
    case 'checking':
      return 'refresh';
    case 'current':
    case 'downloaded':
      return 'check.circle';
    case 'error':
    case 'unsupported':
      return 'error';
    case 'unavailable':
      return 'info';
    case 'available':
    case 'downloading':
      return 'download';
    default:
      return 'download';
  }
}

function updateIconBackground(theme: AboutTheme, phase: UpdatePhase) {
  if (phase === 'idle' || phase === 'checking') {
    return theme.surfaceSolid;
  }
  if (phase === 'unavailable') {
    return theme.surfaceSolid;
  }
  if (phase === 'error' || phase === 'unsupported') {
    return '#F7DAD6';
  }
  return theme.accent;
}

function updateIconColor(theme: AboutTheme, phase: UpdatePhase) {
  if (phase === 'idle' || phase === 'checking' || phase === 'unavailable') {
    return theme.accent;
  }
  if (phase === 'error' || phase === 'unsupported') {
    return '#8F1D12';
  }
  return theme.accentText;
}

function isUpdateSourceUnavailable(message: string) {
  return /HTTP\s+(403|429|500|502|503|504)/i.test(message) || message.includes('Network request failed');
}

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return '未知大小';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDownloadProgress(bytes: { written: number; total: number }) {
  if (bytes.total <= 0) {
    return bytes.written > 0 ? `${formatBytes(bytes.written)} 已下载` : '等待服务器返回大小';
  }
  return `${formatBytes(bytes.written)} / ${formatBytes(bytes.total)}`;
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '刚刚';
  }
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
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
  updateSectionSurface: {
    padding: 10,
    gap: 12,
  },
  updatePanel: {
    gap: 12,
  },
  updateStatusCard: {
    minHeight: 96,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  updateIconWell: {
    width: 52,
    height: 52,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateStatusCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  updateTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: 0,
  },
  updateCaption: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  versionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  versionMetric: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 86,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  versionMetricTitle: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  versionMetricValue: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    letterSpacing: 0,
  },
  versionMetricDetail: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: 0,
  },
  releaseNoteBox: {
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 14,
    gap: 7,
  },
  releaseNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  releaseNoteTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  releaseNoteMeta: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  releaseNoteText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0,
  },
  updateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  updateButton: {
    minHeight: 46,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  updateButtonText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  updateFinePrint: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0,
  },
  disabledButton: {
    opacity: 0.62,
  },
  paragraph: {
    color: brand.colors.muted,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
  },
});
