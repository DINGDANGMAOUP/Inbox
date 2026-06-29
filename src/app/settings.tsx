import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconButton } from '@/components/reader/icon-button';
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
import { themeAssets } from '@/constants/theme-assets';
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
import type { ReaderPreferences } from '@/types/reader';

const readingModeCopy: Record<ReaderPreferences['readingMode'], { title: string; body: string }> = {
  scroll: { title: '连续滚动', body: '适合长文和快速扫读' },
  page: { title: '横向翻页', body: '正文左右区域翻页' },
};

type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error' | 'unsupported';

export default function SettingsScreen() {
  const { preferences, loading, saving, updatePreferences } = useReaderPreferences();
  const theme = brand.themes[preferences.theme];
  const installedVersion = useMemo(() => getInstalledAppVersion(), []);
  const updateSource = useMemo(() => getUpdateSourceInfo(), []);
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle');
  const [updateMessage, setUpdateMessage] = useState('从 GitHub Release 检查完整安装包，下载后由 Android 系统确认安装。');
  const [remoteUpdate, setRemoteUpdate] = useState<RemoteAppVersion | undefined>();
  const [downloadedApkUri, setDownloadedApkUri] = useState<string | undefined>();
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadBytes, setDownloadBytes] = useState({ written: 0, total: 0 });

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

  const checkUpdate = useCallback(async () => {
    setUpdatePhase('checking');
    setDownloadedApkUri(undefined);
    setDownloadProgress(0);
    setDownloadBytes({ written: 0, total: 0 });
    const result = await checkForGithubAppUpdate();
    setUpdateMessage(result.message);

    if (result.status === 'available') {
      setRemoteUpdate(result.remote);
      setUpdatePhase('available');
      return;
    }

    setRemoteUpdate(result.status === 'current' ? result.remote : undefined);
    setUpdatePhase(result.status);
  }, []);

  const downloadUpdate = useCallback(async () => {
    if (!remoteUpdate) {
      return;
    }

    setUpdatePhase('downloading');
    setUpdateMessage('正在下载完整安装包，请保持网络连接。');
    try {
      const file = await downloadGithubApk(remoteUpdate, (progress, written, total) => {
        setDownloadProgress(progress);
        setDownloadBytes({ written, total });
      });
      setDownloadedApkUri(file.uri);
      setDownloadProgress(1);
      setUpdatePhase('downloaded');
      setUpdateMessage('安装包已下载完成，下一步会交给 Android 系统安装器确认。');
    } catch (error) {
      setUpdatePhase('error');
      setUpdateMessage(error instanceof Error ? error.message : '下载更新失败。');
    }
  }, [remoteUpdate]);

  const installUpdate = useCallback(async () => {
    if (!downloadedApkUri) {
      return;
    }

    setUpdatePhase('installing');
    setUpdateMessage('正在打开 Android 安装器。若系统要求，请允许从此来源安装应用。');
    try {
      await installDownloadedApk(downloadedApkUri);
      setUpdatePhase('downloaded');
    } catch (error) {
      setUpdatePhase('error');
      setUpdateMessage(error instanceof Error ? error.message : '无法打开安装器。');
    }
  }, [downloadedApkUri]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Image
        key={`settings-background-${preferences.theme}`}
        source={themeAssets[preferences.theme].background}
        contentFit="cover"
        transition={180}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.scrim, { backgroundColor: preferences.theme === 'deep' ? 'rgba(48, 67, 82, 0.18)' : theme.overlay }]} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <IconButton icon="chevron.left" label="返回" tone="quiet" onPress={() => router.back()} />
          <View style={styles.brandCluster}>
            <Image source={brandAssets.logoMark} contentFit="cover" style={styles.logo} />
            <View style={styles.titleStack}>
              <Text style={[styles.eyebrow, { color: theme.muted }]}>MOYU SETTINGS</Text>
              <Text style={[styles.title, { color: theme.text }]}>设置</Text>
            </View>
          </View>
          <Text style={[styles.headerMeta, { color: theme.accent }]}>{saving ? '保存中' : '本机生效'}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={brand.colors.ink} />
            <Text style={styles.loadingText}>正在读取偏好</Text>
          </View>
        ) : (
          <>
            <Section title="阅读默认值" kicker="READER" theme={theme}>
              <Text style={styles.sectionLead}>这里设置新打开书籍时的默认阅读体验。阅读器内仍可临时调整。</Text>
              <View style={styles.themeGrid}>
                {brand.themeOrder.map((theme) => {
                  const token = brand.themes[theme];
                  const active = preferences.theme === theme;
                  return (
                    <Pressable
                      key={theme}
                      onPress={() => updatePreference({ ...preferences, theme })}
                      style={[styles.themeCard, active && styles.activeCard]}>
                      <Image source={themeAssets[theme].cover} contentFit="cover" style={styles.themeImage} />
                      <View style={styles.themeScrim} />
                      <Text style={[styles.themeTitle, active && styles.activeText]}>{token.label}</Text>
                      <Text style={[styles.themeBody, active && styles.activeSubtleText]}>{token.description}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modeRow}>
                {(['scroll', 'page'] as const).map((mode) => {
                  const active = preferences.readingMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => updatePreference({ ...preferences, readingMode: mode })}
                      style={[styles.modeCard, active && styles.activeModeCard]}>
                      <Text style={[styles.modeTitle, active && styles.activeText]}>{readingModeCopy[mode].title}</Text>
                      <Text style={[styles.modeBody, active && styles.activeSubtleText]}>{readingModeCopy[mode].body}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Stepper label="字号" value={String(preferences.fontSize)} minus={() => stepPreference('fontSize', -1)} plus={() => stepPreference('fontSize', 1)} />
              <Stepper
                label="行距"
                value={preferences.lineHeight.toFixed(1)}
                minus={() => stepPreference('lineHeight', -0.1)}
                plus={() => stepPreference('lineHeight', 0.1)}
              />
              <Stepper label="页边距" value={String(preferences.margin)} minus={() => stepPreference('margin', -2)} plus={() => stepPreference('margin', 2)} />
            </Section>

            <Section title="书架与导入" kicker="LIBRARY" theme={theme}>
              <InfoRow title="导入格式" value="EPUB / TXT" />
              <InfoRow title="存储位置" value="仅本机 Documents" />
              <InfoRow title="删除方式" value="书架长按书籍" />
            </Section>

            <Section title="应用更新" kicker="GITHUB RELEASE" theme={theme}>
              <UpdatePanel
                theme={theme}
                phase={updatePhase}
                message={updateMessage}
                sourceLabel={updateSource.label}
                repository={updateSource.repository}
                installedVersion={installedVersion.version}
                installedBuild={installedVersion.buildNumber}
                remoteUpdate={remoteUpdate}
                progress={downloadProgress}
                bytes={downloadBytes}
                onCheck={checkUpdate}
                onDownload={downloadUpdate}
                onInstall={installUpdate}
                onOpenRelease={() => openReleasePage(remoteUpdate)}
              />
            </Section>

            <Section title="数据与隐私" kicker="LOCAL FIRST" theme={theme}>
              <InfoRow title="账号" value="不需要" />
              <InfoRow title="云同步" value="不上传" />
              <InfoRow title="阅读数据" value="本地 SQLite" />
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  kicker,
  theme,
  children,
}: {
  title: string;
  kicker: string;
  theme: (typeof brand.themes)[ReaderPreferences['theme']];
  children: ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.line }]}>
      <Text style={[styles.sectionKicker, { color: theme.accent }]}>{kicker}</Text>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Stepper({ label, value, minus, plus }: { label: string; value: string; minus: () => void; plus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable onPress={minus} style={styles.roundControl}>
          <Text style={styles.roundControlText}>-</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable onPress={plus} style={styles.roundControl}>
          <Text style={styles.roundControlText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function InfoRow({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoTitle}>{title}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function UpdatePanel({
  theme,
  phase,
  message,
  sourceLabel,
  repository,
  installedVersion,
  installedBuild,
  remoteUpdate,
  progress,
  bytes,
  onCheck,
  onDownload,
  onInstall,
  onOpenRelease,
}: {
  theme: (typeof brand.themes)[ReaderPreferences['theme']];
  phase: UpdatePhase;
  message: string;
  sourceLabel: string;
  repository: string;
  installedVersion: string;
  installedBuild: number;
  remoteUpdate?: RemoteAppVersion;
  progress: number;
  bytes: { written: number; total: number };
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onOpenRelease: () => void;
}) {
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const canDownload = phase === 'available' && Boolean(remoteUpdate);
  const canInstall = phase === 'downloaded';
  const primaryLabel = phase === 'checking' ? '检查中' : phase === 'downloading' ? '下载中' : phase === 'installing' ? '打开安装器' : canInstall ? '安装更新' : canDownload ? '下载更新' : '检查更新';
  const primaryAction = canInstall ? onInstall : canDownload ? onDownload : onCheck;
  const progressPercent = Math.round(progress * 100);

  return (
    <View style={styles.updatePanel}>
      <View style={styles.updateHero}>
        <View style={[styles.updateOrb, { backgroundColor: theme.accent }]}>
          <Text style={styles.updateOrbText}>{phase === 'current' ? '✓' : phase === 'error' ? '!' : '↓'}</Text>
        </View>
        <View style={styles.updateHeroText}>
          <Text style={styles.updateTitle}>{updatePhaseTitle(phase)}</Text>
          <Text style={styles.updateCaption}>{message}</Text>
        </View>
      </View>

      <View style={styles.updateSteps}>
        {(['检查', '下载', '安装'] as const).map((step, index) => {
          const active = updateStepIndex(phase) >= index;
          return (
            <View key={step} style={styles.updateStep}>
              <View style={[styles.updateStepDot, active && { backgroundColor: theme.accent, borderColor: theme.accent }]} />
              <Text style={[styles.updateStepText, active && { color: theme.text }]}>{step}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.infoBlock}>
        <InfoRow title="当前版本" value={`${installedVersion} (${installedBuild || '开发'})`} />
        <InfoRow title="更新来源" value={sourceLabel} />
        <InfoRow title="仓库" value={repository} />
        {remoteUpdate ? (
          <>
            <InfoRow title="最新版本" value={`${remoteUpdate.version} (${remoteUpdate.buildNumber})`} />
            <InfoRow title="安装包" value={remoteUpdate.apkSize ? formatBytes(remoteUpdate.apkSize) : 'GitHub APK'} />
          </>
        ) : null}
      </View>

      {remoteUpdate ? (
        <View style={styles.releaseNoteBox}>
          <Text style={styles.releaseNoteTitle}>{remoteUpdate.force ? '重要更新' : '更新说明'}</Text>
          <Text style={styles.releaseNoteText} numberOfLines={5}>
            {remoteUpdate.releaseNotes}
          </Text>
        </View>
      ) : null}

      {phase === 'downloading' || phase === 'downloaded' ? (
        <View style={styles.downloadBox}>
          <View style={styles.downloadMeta}>
            <Text style={styles.downloadLabel}>{phase === 'downloaded' ? '下载完成' : `下载进度 ${progressPercent}%`}</Text>
            <Text style={styles.downloadBytes}>{formatDownloadProgress(bytes)}</Text>
          </View>
          <View style={styles.downloadTrack}>
            <View style={[styles.downloadFill, { width: `${Math.max(4, progressPercent)}%`, backgroundColor: theme.accent }]} />
          </View>
        </View>
      ) : null}

      <View style={styles.updateActions}>
        <Pressable
          disabled={busy}
          onPress={primaryAction}
          style={({ pressed }) => [styles.updateButton, { backgroundColor: theme.accent }, busy && styles.disabledButton, pressed && styles.pressed]}>
          <Text style={styles.updateButtonText}>{primaryLabel}</Text>
        </Pressable>
        <Pressable onPress={onOpenRelease} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
          <Text style={styles.secondaryButtonText}>查看 Release</Text>
        </Pressable>
      </View>

      <Text style={styles.updateFinePrint}>完整更新会跳转到 Android 系统安装器。首次安装 GitHub APK 时，系统可能要求允许此来源。</Text>
    </View>
  );
}

function updatePhaseTitle(phase: UpdatePhase) {
  switch (phase) {
    case 'checking':
      return '正在检查新版本';
    case 'current':
      return '已经是最新';
    case 'available':
      return '发现完整更新';
    case 'downloading':
      return '正在下载 APK';
    case 'downloaded':
      return '准备安装';
    case 'installing':
      return '等待系统确认';
    case 'unsupported':
      return '当前平台不支持';
    case 'error':
      return '更新遇到问题';
    default:
      return '完整包更新';
  }
}

function updateStepIndex(phase: UpdatePhase) {
  if (phase === 'downloading' || phase === 'downloaded' || phase === 'installing') {
    return phase === 'installing' ? 2 : 1;
  }
  if (phase === 'available' || phase === 'current') {
    return 0;
  }
  return -1;
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: brand.colors.paper,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(232, 235, 242, 0.34)',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 42,
    gap: 18,
  },
  header: {
    gap: 16,
  },
  brandCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 15,
  },
  titleStack: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: brand.colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  title: {
    color: brand.colors.ink,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '900',
  },
  headerMeta: {
    color: brand.colors.island,
    fontSize: 13,
    fontWeight: '900',
  },
  loadingCard: {
    minHeight: 180,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: brand.colors.paperElevated,
  },
  loadingText: {
    color: brand.colors.ink,
    fontWeight: '900',
  },
  section: {
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    backgroundColor: 'rgba(247, 248, 251, 0.84)',
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
  sectionLead: {
    color: brand.colors.muted,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  sectionBody: {
    gap: 12,
  },
  themeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  themeCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'flex-end',
    borderWidth: 1,
    borderColor: 'rgba(48, 67, 82, 0.12)',
  },
  activeCard: {
    borderColor: brand.colors.island,
  },
  themeImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  themeScrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(247, 248, 251, 0.34)',
  },
  themeTitle: {
    color: brand.colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  themeBody: {
    color: brand.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  activeText: {
    color: brand.colors.ink,
  },
  activeSubtleText: {
    color: brand.colors.islandDeep,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeCard: {
    flex: 1,
    minHeight: 72,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: brand.colors.line,
    backgroundColor: brand.colors.paperElevated,
    padding: 13,
    justifyContent: 'center',
    gap: 4,
  },
  activeModeCard: {
    borderColor: brand.colors.island,
    backgroundColor: brand.colors.islandSoft,
  },
  modeTitle: {
    color: brand.colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  modeBody: {
    color: brand.colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  stepper: {
    minHeight: 56,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(232, 235, 242, 0.62)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stepperLabel: {
    color: brand.colors.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roundControl: {
    width: 40,
    height: 40,
    borderRadius: brand.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.colors.ink,
  },
  roundControlText: {
    color: brand.colors.white,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
  },
  stepperValue: {
    minWidth: 36,
    textAlign: 'center',
    color: brand.colors.ink,
    fontSize: 16,
    fontWeight: '900',
  },
  infoRow: {
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(195, 203, 213, 0.58)',
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
  updatePanel: {
    gap: 14,
  },
  updateHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(232, 235, 242, 0.54)',
  },
  updateOrb: {
    width: 44,
    height: 44,
    borderRadius: brand.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateOrbText: {
    color: brand.colors.white,
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
  },
  updateHeroText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  updateTitle: {
    color: brand.colors.ink,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '900',
  },
  updateCaption: {
    color: brand.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  updateSteps: {
    minHeight: 42,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  updateStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  updateStepDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(109, 128, 143, 0.38)',
    backgroundColor: 'transparent',
  },
  updateStepText: {
    color: brand.colors.muted,
    fontSize: 12,
    fontWeight: '900',
  },
  infoBlock: {
    gap: 0,
  },
  releaseNoteBox: {
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    padding: 14,
    gap: 6,
  },
  releaseNoteTitle: {
    color: brand.colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  releaseNoteText: {
    color: brand.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  downloadBox: {
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(232, 235, 242, 0.58)',
    padding: 13,
    gap: 10,
  },
  downloadMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  downloadLabel: {
    color: brand.colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  downloadBytes: {
    color: brand.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  downloadTrack: {
    height: 8,
    borderRadius: brand.radius.round,
    overflow: 'hidden',
    backgroundColor: 'rgba(195, 203, 213, 0.72)',
  },
  downloadFill: {
    height: '100%',
    borderRadius: brand.radius.round,
  },
  updateActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  updateButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  updateButtonText: {
    color: brand.colors.white,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(48, 67, 82, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
  },
  secondaryButtonText: {
    color: brand.colors.ink,
    fontSize: 13,
    fontWeight: '900',
  },
  updateFinePrint: {
    color: brand.colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.62,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});
