import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';

import { IconButton } from '@/components/reader/icon-button';
import { M3InfoRow, M3ProgressRail, M3Screen, M3Section, M3SegmentedControl, M3StatePanel, M3StepRail, M3Stepper, M3TopAppBar } from '@/components/reader/m3';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { useRouteSlideTransition } from '@/components/reader/route-slide-transition';
import { brandAssets } from '@/constants/brand-assets';
import { brand } from '@/constants/brand';
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
import type { AppThemeMode, ReaderPreferences, ReaderTheme, ResolvedAppTheme } from '@/types/reader';

const readingModeCopy: Record<ReaderPreferences['readingMode'], { title: string; body: string }> = {
  scroll: { title: '滚动', body: '' },
  page: { title: '翻页', body: '' },
};

type UpdatePhase = 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error' | 'unsupported';
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
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];
  const headerTheme = {
    ...theme,
    surface: theme.surfaceSolid,
    surfaceSolid: theme.surfaceSolid,
    surfaceContainer: theme.surfaceContainer,
    surfaceContainerHigh: theme.surfaceContainerHigh,
    primaryContainer: theme.primaryContainer,
    onPrimaryContainer: theme.onPrimaryContainer,
  };
  const installedVersion = useMemo(() => getInstalledAppVersion(), []);
  const updateSource = useMemo(() => getUpdateSourceInfo(), []);
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>('idle');
  const [updateMessage, setUpdateMessage] = useState('检查内测更新');
  const [remoteUpdate, setRemoteUpdate] = useState<RemoteAppVersion | undefined>();
  const [downloadedApkUri, setDownloadedApkUri] = useState<string | undefined>();
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadBytes, setDownloadBytes] = useState({ written: 0, total: 0 });
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>();
  const autoCheckedRef = useRef(false);

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

  const checkUpdate = useCallback(async () => {
    setUpdatePhase('checking');
    setDownloadedApkUri(undefined);
    setDownloadProgress(0);
    setDownloadBytes({ written: 0, total: 0 });
    const result = await checkForGithubAppUpdate();
    setLastCheckedAt(new Date().toISOString());
    setUpdateMessage(result.message);

    if (result.status === 'available') {
      setRemoteUpdate(result.remote);
      setUpdatePhase('available');
      return;
    }

    setRemoteUpdate(result.status === 'current' ? result.remote : undefined);
    setUpdatePhase(result.status);
  }, []);

  useEffect(() => {
    if (autoCheckedRef.current) {
      return;
    }
    autoCheckedRef.current = true;
    checkUpdate();
  }, [checkUpdate]);

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
      setUpdateMessage('下载完成');
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
    setUpdateMessage('打开安装器');
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
        key={`settings-screen-${resolvedAppTheme}`}
        theme={theme}
        backgroundSource={appThemeAssets[resolvedAppTheme].background}
        overlayColor={resolvedAppTheme === 'deep' ? 'rgba(8, 9, 6, 0.36)' : 'rgba(247, 243, 234, 0.78)'}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, width >= 700 && styles.contentWide]}>
        <M3TopAppBar
          theme={headerTheme}
          title="设置"
          subtitle="阅读偏好"
          logoSource={brandAssets.logoMark}
          leading={
            <IconButton
              icon="chevron.left"
              label="返回"
              tone="quiet"
              tintColor={theme.text}
              size="icon"
              style={[styles.headerBackButton, { backgroundColor: theme.surfaceContainer, borderColor: theme.line }]}
              onPress={closeRoute}
            />
          }
          trailing={
            <View style={styles.saveBadge}>
              <Text style={styles.headerMeta}>{saving ? '保存中' : '已保存'}</Text>
            </View>
          }
        />

        {loading ? (
          <M3StatePanel theme={theme} title="正在读取偏好" artwork={<ActivityIndicator color={theme.accent} />} />
        ) : (
          <>
            <M3Section title="界面" kicker={appThemeModeCopy[preferences.appThemeMode].title} theme={theme} order={0} contentStyle={styles.settingsSectionSurface}>
              <View style={styles.choiceList}>
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
              </View>
            </M3Section>

            <M3Section title="纸张" kicker={readerThemeCopy[preferences.readerTheme].title} theme={theme} order={1} contentStyle={styles.settingsSectionSurface}>
              <View style={styles.choiceGrid}>
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
                      compact
                      swatch={readerThemeSwatches[readerTheme]}
                      icon={readerTheme === 'night' ? 'textformat.size' : readerTheme === 'eink' ? 'list.bullet' : 'bookmark'}
                      onPress={() => updatePreference({ ...preferences, readerTheme })}
                    />
                  );
                })}
              </View>
            </M3Section>

            <M3Section title="阅读" kicker={readingModeCopy[preferences.readingMode].title} theme={theme} order={2} contentStyle={styles.settingsSectionSurface}>
              <ReadingPreview preferences={preferences} />

              <M3SegmentedControl
                theme={theme}
                value={preferences.readingMode}
                options={(['scroll', 'page'] as const).map((mode) => ({
                  value: mode,
                  title: readingModeCopy[mode].title,
                }))}
                onChange={(readingMode) => updatePreference({ ...preferences, readingMode })}
              />

              <View style={styles.stepperStack}>
              <M3Stepper compact theme={theme} label="字号" value={String(preferences.fontSize)} onMinus={() => stepPreference('fontSize', -1)} onPlus={() => stepPreference('fontSize', 1)} />
              <M3Stepper
                compact
                theme={theme}
                label="行距"
                value={preferences.lineHeight.toFixed(1)}
                onMinus={() => stepPreference('lineHeight', -0.1)}
                onPlus={() => stepPreference('lineHeight', 0.1)}
              />
              <M3Stepper compact theme={theme} label="页边距" value={String(preferences.margin)} onMinus={() => stepPreference('margin', -2)} onPlus={() => stepPreference('margin', 2)} />
              </View>
            </M3Section>

            <M3Section title="更新" theme={theme} order={3} contentStyle={styles.settingsSectionSurface}>
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
          </>
        )}
      </ScrollView>
      </M3Screen>
    </Animated.View>
  );
}

function PreferenceChoice({
  theme,
  title,
  detail,
  selected,
  swatch,
  icon,
  compact = false,
  onPress,
}: {
  theme: SettingsTheme;
  title: string;
  detail: string;
  selected: boolean;
  swatch: ThemeChoiceSwatch;
  icon: MaterialSymbolName;
  compact?: boolean;
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
        compact && styles.choiceRowCompact,
        {
          backgroundColor: selected ? theme.primaryContainer : theme.surfaceContainer,
          borderColor: selected ? theme.accent : theme.line,
        },
      ]}>
      <View style={[styles.choiceIcon, { backgroundColor: selected ? theme.accent : theme.surfaceSolid }]}>
        <MaterialSymbol name={selected ? 'check' : icon} color={selected ? theme.accentText : theme.accent} description={title} decorative size={16} />
      </View>
      <View style={styles.choiceCopy}>
        <Text numberOfLines={1} style={[styles.choiceTitle, { color: selected ? theme.onPrimaryContainer : theme.text }]}>
          {title}
        </Text>
        <Text numberOfLines={1} style={[styles.choiceDetail, { color: selected ? theme.onPrimaryContainer : theme.muted }]}>
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
  theme: SettingsTheme;
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
  const primaryLabel = phase === 'checking' ? '检查中' : phase === 'downloading' ? '下载中' : phase === 'installing' ? '安装器' : canInstall ? '安装' : canDownload ? '下载' : '检查';
  const primaryAction = canInstall ? onInstall : canDownload ? onDownload : onCheck;
  const progressPercent = Math.round(progress * 100);

  return (
    <View style={styles.updatePanel}>
      <View style={[styles.updateHero, { backgroundColor: theme.surfaceContainer }]}>
        <View style={[styles.updateOrb, { backgroundColor: theme.accent }]}>
          <MaterialSymbol name={updatePhaseIcon(phase)} color={theme.accentText} description={updatePhaseTitle(phase)} decorative size={24} />
        </View>
        <View style={styles.updateHeroText}>
          <Text style={[styles.updateTitle, { color: theme.text }]}>{updatePhaseTitle(phase)}</Text>
          <Text style={[styles.updateCaption, { color: theme.muted }]}>{message}</Text>
        </View>
      </View>

      <M3StepRail theme={theme} steps={['检查', '下载', '安装']} activeIndex={updateStepIndex(phase)} />

      <View style={styles.infoBlock}>
        <M3InfoRow theme={theme} title="当前版本" value={`${installedVersion} (${installedBuild || '开发'}) · 内测`} />
        <M3InfoRow theme={theme} title="检查时间" value={lastCheckedAt ? formatCheckedAt(lastCheckedAt) : '未检查'} />
        <M3InfoRow theme={theme} title="来源" value={sourceLabel} />
        {remoteUpdate ? (
          <>
            <M3InfoRow theme={theme} title="内测版本" value={`${remoteUpdate.version} (${remoteUpdate.buildNumber})`} />
            <M3InfoRow theme={theme} title="大小" value={remoteUpdate.apkSize ? formatBytes(remoteUpdate.apkSize) : '待获取'} />
          </>
        ) : null}
      </View>

      {remoteUpdate ? (
        <View style={[styles.releaseNoteBox, { backgroundColor: theme.surfaceContainer }]}>
          <Text style={[styles.releaseNoteTitle, { color: theme.text }]}>{remoteUpdate.force ? '重要内测' : '内测说明'}</Text>
          <Text style={[styles.releaseNoteText, { color: theme.muted }]} numberOfLines={2}>
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
          style={[
            styles.secondaryButton,
            { backgroundColor: theme.surfaceContainerHigh, borderColor: theme.line },
          ]}>
          <MaterialSymbol name="info" color={theme.text} description="查看内测" decorative size={16} />
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>查看内测</Text>
        </M3Pressable>
      </View>

      <Text style={[styles.updateFinePrint, { color: theme.muted }]}>下载后由 Android 确认安装。</Text>
    </View>
  );
}

function updatePhaseTitle(phase: UpdatePhase) {
  switch (phase) {
    case 'checking':
      return '检查中';
    case 'current':
      return '暂无新内测';
    case 'available':
      return '发现内测';
    case 'downloading':
      return '下载中';
    case 'downloaded':
      return '准备安装';
    case 'installing':
      return '等待确认';
    case 'unsupported':
      return '当前平台不支持';
    case 'error':
      return '内测检查失败';
    default:
      return '内测更新';
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
    case 'available':
    case 'downloading':
      return 'download';
    default:
      return 'download';
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
    paddingBottom: 42,
    gap: 18,
  },
  contentWide: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
  },
  headerBackButton: {
    width: 48,
    minWidth: 48,
    paddingHorizontal: 0,
  },
  headerMeta: {
    color: brand.chrome.accentText,
    fontSize: 12,
    fontWeight: '900',
  },
  saveBadge: {
    minHeight: 34,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    backgroundColor: brand.chrome.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  settingsSectionSurface: {
    padding: 10,
    gap: 10,
  },
  choiceList: {
    gap: 8,
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceRow: {
    minHeight: 60,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  choiceRowCompact: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 64,
  },
  choiceIcon: {
    width: 36,
    height: 36,
    borderRadius: brand.radius.small,
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
    fontWeight: '900',
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
    width: 13,
    height: 22,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  readerPreview: {
    minHeight: 144,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 14,
    gap: 10,
    overflow: 'hidden',
  },
  readerPreviewMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  readerPreviewKicker: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  readerPreviewMode: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  readerPreviewText: {
    fontWeight: '500',
    letterSpacing: 0,
  },
  stepperStack: {
    gap: 8,
  },
  updatePanel: {
    gap: 14,
  },
  updateHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.surfaceContainer,
    borderWidth: 1,
    borderColor: 'rgba(80, 73, 62, 0.14)',
  },
  updateOrb: {
    width: 44,
    height: 44,
    borderRadius: brand.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
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
  infoBlock: {
    gap: 0,
  },
  releaseNoteBox: {
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.surfaceContainer,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: brand.chrome.surface,
  },
  updateButtonText: {
    color: brand.chrome.text,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(121, 116, 126, 0.20)',
    backgroundColor: brand.colors.surfaceContainerHigh,
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
});
