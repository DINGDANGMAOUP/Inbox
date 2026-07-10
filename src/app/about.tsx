import { Image } from "expo-image";
import { CircularProgressIndicator } from "@expo/ui/jetpack-compose";
import { size as composeSize } from "@expo/ui/jetpack-compose/modifiers";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";

import { M3PageHeader, M3Screen } from "@/components/reader/m3";
import { M3Pressable } from "@/components/reader/m3-pressable";
import {
  MaterialSymbol,
  type MaterialSymbolName,
} from "@/components/reader/material-symbol";
import { useRouteSlideTransition } from "@/components/reader/route-slide-transition";
import { brandAssets } from "@/constants/brand-assets";
import { brand } from "@/constants/brand";
import { appThemeAssets } from "@/constants/theme-assets";
import { useReaderPreferences } from "@/hooks/use-reader-preferences";
import {
  checkForGithubAppUpdate,
  downloadAndOpenUpdateInstaller,
  getInstalledAppVersion,
  openUpdateDownloadLink,
  type RemoteAppVersion,
  type UpdateDownloadProgress,
} from "@/lib/app-update-service";

type UpdatePhase =
  | "idle"
  | "checking"
  | "downloading"
  | "current"
  | "available"
  | "unavailable"
  | "error";

type AboutTheme = (typeof brand.appThemes)[keyof typeof brand.appThemes];

export default function AboutScreen() {
  const { resolvedAppTheme } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];
  const installedVersion = useMemo(() => getInstalledAppVersion(), []);
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>("idle");
  const [updateMessage, setUpdateMessage] = useState("检查更新");
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>();
  const [downloadProgress, setDownloadProgress] =
    useState<UpdateDownloadProgress>();
  const isDeepTheme = resolvedAppTheme === "deep";

  const handleBack = useCallback(() => {
    closeRoute();
  }, [closeRoute]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        handleBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [handleBack]);

  const handleDownloadUpdate = useCallback(async (remote: RemoteAppVersion) => {
    setUpdatePhase("downloading");
    setUpdateMessage(`正在下载 Version ${remote.version}`);
    setDownloadProgress({
      bytesWritten: 0,
      totalBytes: remote.apkSize,
      progress: remote.apkSize ? 0 : undefined,
    });

    try {
      await downloadAndOpenUpdateInstaller(remote, (progress) => {
        setDownloadProgress(progress);
      });
      setUpdatePhase("available");
      setUpdateMessage("已打开安装程序");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "安装包下载失败。";
      setUpdatePhase("available");
      setUpdateMessage("下载失败，可重试");
      Alert.alert("下载失败", message, [
        { text: "稍后", style: "cancel" },
        {
          text: "浏览器下载",
          onPress: () => openUpdateDownloadLink(remote),
        },
      ]);
    }
  }, []);

  const checkUpdate = useCallback(async () => {
    if (updatePhase === "checking" || updatePhase === "downloading") {
      return;
    }

    setUpdatePhase("checking");
    setUpdateMessage("正在检查更新");
    setDownloadProgress(undefined);
    try {
      const result = await checkForGithubAppUpdate();
      setLastCheckedAt(new Date().toISOString());
      setUpdateMessage(result.message);

      if (
        result.status === "error" &&
        result.message.startsWith("暂未发布正式版本")
      ) {
        setUpdatePhase("current");
        setUpdateMessage("暂无正式版本");
        Alert.alert("暂无正式版本", "当前仓库还没有发布正式 Release。");
        return;
      }

      if (
        result.status === "error" &&
        isUpdateSourceUnavailable(result.message)
      ) {
        setUpdatePhase("unavailable");
        setUpdateMessage("暂时无法访问发布通道");
        Alert.alert("检查失败", "暂时无法访问发布通道，可稍后再试。");
        return;
      }

      if (result.status === "error") {
        setUpdatePhase("error");
        Alert.alert("检查失败", result.message);
        return;
      }

      if (result.status === "current") {
        setUpdatePhase("current");
        Alert.alert(
          "已是最新版本",
          `当前版本 Version ${result.current.version}`,
        );
        return;
      }

      if (result.status === "available") {
        if (!result.remote.apkUrl) {
          setUpdatePhase("unavailable");
          setUpdateMessage("安装包准备中");
          Alert.alert(
            "新版本准备中",
            "已经检测到新版本，但安装包还没有上传完成。等流水线构建结束后再检查一次即可。",
          );
          return;
        }

        setUpdatePhase("available");
        setUpdateMessage(result.message);
        Alert.alert(
          "发现新版本",
          `最新版本 Version ${result.remote.version}${formatUpdateSize(
            result.remote.apkSize,
          )}\n\n${result.remote.releaseNotes}`,
          [
            { text: "稍后", style: "cancel" },
            {
              text: "下载更新",
              onPress: () => {
                void handleDownloadUpdate(result.remote);
              },
            },
          ],
        );
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "检查 Releases 失败。";
      if (isUpdateSourceUnavailable(message)) {
        setUpdatePhase("unavailable");
        setUpdateMessage("暂时无法访问发布通道");
        Alert.alert("检查失败", "暂时无法访问发布通道，可稍后再试。");
        return;
      }
      setUpdatePhase("error");
      setUpdateMessage(message);
      Alert.alert("检查失败", message);
    }
  }, [handleDownloadUpdate, updatePhase]);

  return (
    <Animated.View style={[styles.routeShell, routeStyle]}>
      <M3Screen
        key={`about-screen-${resolvedAppTheme}`}
        theme={theme}
        backgroundSource={appThemeAssets[resolvedAppTheme].background}
        overlayColor={
          isDeepTheme ? "rgba(8, 9, 6, 0.46)" : "rgba(250, 248, 242, 0.93)"
        }
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.content,
            width >= 700 && styles.contentWide,
          ]}
        >
          <M3PageHeader
            theme={theme}
            title="关于墨屿"
            subtitle="本地优先的安静阅读器"
            onBack={handleBack}
          />

          <View style={[styles.identity, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
            <View
              style={[
                styles.logoPlate,
                {
                  backgroundColor: brand.colors.paper,
                  borderColor: theme.line,
                },
              ]}
            >
              <Image
                source={brandAssets.logoMark}
                contentFit="contain"
                style={styles.logo}
              />
            </View>
            <Text style={[styles.appName, { color: theme.text }]}>墨屿</Text>
            <Text style={[styles.versionText, { color: theme.muted }]}>
              Version {installedVersion.version}
            </Text>
          </View>

          <View style={[styles.menuGroup, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
            <AboutMenuRow
              theme={theme}
              title="功能介绍"
              detail="本地书架、EPUB / TXT、长读设置"
              icon="info"
              onPress={() =>
                Alert.alert(
                  "功能介绍",
                  "墨屿是一个本地优先的阅读器，支持 EPUB 与 TXT，并保留主题、字号、行距和阅读记录。",
                )
              }
            />
            <AboutMenuRow
              theme={theme}
              title="问题反馈"
              detail="反馈使用问题或改进建议"
              icon="note"
              onPress={() =>
                Alert.alert(
                  "问题反馈",
                  "可以在 GitHub Releases 或项目反馈渠道提交问题与建议。",
                )
              }
            />
            <AboutMenuRow
              theme={theme}
              title="检查更新"
              detail={updateRowDetail(
                updatePhase,
                updateMessage,
                lastCheckedAt,
                downloadProgress,
              )}
              icon={updatePhaseIcon(updatePhase)}
              disabled={
                updatePhase === "checking" || updatePhase === "downloading"
              }
              onPress={checkUpdate}
              trailing={
                updatePhase === "checking" || updatePhase === "downloading" ? (
                  updatePhase === "downloading" ? (
                    <DownloadProgressRing
                      progress={downloadProgress}
                      theme={theme}
                    />
                  ) : (
                    <ActivityIndicator color={theme.accent} />
                  )
                ) : undefined
              }
            />
          </View>

          <View style={styles.footer}>
            <Text style={[styles.footerLink, { color: theme.accent }]}>
              本地优先 · 私密保存 · 长读友好
            </Text>
            <Text style={[styles.footerText, { color: theme.muted }]}>
              支持 EPUB / TXT
            </Text>
            <Text style={[styles.footerText, { color: theme.muted }]}>
              运行环境：
              {executionEnvironmentLabel(String(installedVersion.environment))}
            </Text>
            <Text style={[styles.footerText, { color: theme.muted }]}>
              Copyright © 2026 墨屿 Inbox
            </Text>
          </View>
        </ScrollView>
      </M3Screen>
    </Animated.View>
  );
}

function AboutMenuRow({
  theme,
  title,
  detail,
  icon,
  disabled,
  trailing,
  onPress,
}: {
  theme: AboutTheme;
  title: string;
  detail?: string;
  icon: MaterialSymbolName;
  disabled?: boolean;
  trailing?: ReactNode;
  onPress: () => void;
}) {
  return (
    <M3Pressable
      disabled={disabled}
      onPress={onPress}
      feedback="subtle"
      hitSlop={{ left: 4, right: 4 }}
      style={[
        styles.menuRow,
        disabled && styles.disabledRow,
        { borderBottomColor: theme.line },
      ]}
    >
      <View
        style={[styles.menuIcon, { backgroundColor: theme.primaryContainer }]}
      >
        <MaterialSymbol
          name={icon}
          color={theme.onPrimaryContainer}
          description={title}
          decorative
          size={17}
        />
      </View>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuTitle, { color: theme.text }]}>{title}</Text>
        {detail ? (
          <Text
            numberOfLines={1}
            style={[styles.menuDetail, { color: theme.muted }]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing ?? (
        <MaterialSymbol
          name="chevron.right"
          color={theme.muted}
          description={`${title}详情`}
          decorative
          size={18}
        />
      )}
    </M3Pressable>
  );
}

function executionEnvironmentLabel(environment: string) {
  if (environment.includes("storeClient")) {
    return "Expo Go 预览";
  }
  if (environment.includes("standalone")) {
    return "已安装应用";
  }
  if (environment.includes("bare")) {
    return "原生构建";
  }
  return "开发预览";
}

function updateRowDetail(
  phase: UpdatePhase,
  message: string,
  lastCheckedAt?: string,
  downloadProgress?: UpdateDownloadProgress,
) {
  if (phase === "idle") {
    return message;
  }
  if (phase === "checking") {
    return "正在检查";
  }
  if (phase === "downloading") {
    return formatDownloadProgress(downloadProgress);
  }
  if (phase === "available") {
    return message || "发现新版本，可下载";
  }
  if (phase === "current") {
    if (message === "暂无正式版本") {
      return message;
    }
    return lastCheckedAt
      ? `${formatCheckedAt(lastCheckedAt)} 已检查`
      : "已是最新版本";
  }
  if (phase === "unavailable") {
    return "稍后再试";
  }
  return message || "检查失败";
}

function DownloadProgressRing({
  theme,
  progress,
}: {
  theme: AboutTheme;
  progress?: UpdateDownloadProgress;
}) {
  const value =
    typeof progress?.progress === "number"
      ? Math.max(0, Math.min(1, progress.progress))
      : undefined;
  const percent =
    typeof value === "number" ? Math.round(value * 100) : undefined;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={
        percent === undefined
          ? { text: "正在下载" }
          : { min: 0, max: 100, now: percent }
      }
      style={styles.downloadProgressRing}
    >
      {Platform.OS === "android" ? (
        <CircularProgressIndicator
          color={theme.accent}
          gapSize={2}
          modifiers={[composeSize(42, 42)]}
          progress={value ?? null}
          strokeCap="round"
          strokeWidth={4}
          trackColor={theme.line}
        />
      ) : (
        <View
          style={[
            styles.downloadProgressFallbackRing,
            { borderColor: theme.line },
          ]}
        />
      )}
      <Text
        numberOfLines={1}
        style={[styles.downloadProgressText, { color: theme.text }]}
      >
        {percent === undefined ? "..." : `${percent}%`}
      </Text>
    </View>
  );
}

function updatePhaseIcon(phase: UpdatePhase): MaterialSymbolName {
  switch (phase) {
    case "checking":
      return "refresh";
    case "downloading":
      return "download";
    case "current":
      return "check.circle";
    case "error":
      return "error";
    case "unavailable":
      return "info";
    case "available":
      return "download";
    default:
      return "download";
  }
}

function isUpdateSourceUnavailable(message: string) {
  return (
    /HTTP\s+(403|429|500|502|503|504)/i.test(message) ||
    message.includes("Network request failed")
  );
}

function formatCheckedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "刚刚";
  }
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUpdateSize(bytes?: number) {
  if (!bytes || bytes <= 0) {
    return "";
  }
  return `\n安装包 ${formatBytes(bytes)}`;
}

function formatDownloadProgress(progress?: UpdateDownloadProgress) {
  if (!progress) {
    return "准备下载";
  }
  if (progress.totalBytes && progress.totalBytes > 0) {
    return `正在下载 · ${formatBytes(progress.bytesWritten)} / ${formatBytes(
      progress.totalBytes,
    )}`;
  }
  if (progress.bytesWritten > 0) {
    return `正在下载 · 已下载 ${formatBytes(progress.bytesWritten)}`;
  }
  return "准备下载";
}

function formatBytes(bytes: number) {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1) {
    return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
  }
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
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
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  identity: {
    alignItems: "center",
    borderRadius: brand.radius.extraLarge,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 24,
    boxShadow: brand.shadow.card,
  },
  logoPlate: {
    width: 84,
    height: 84,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
    boxShadow: "0 12px 26px rgba(18, 20, 15, 0.10)",
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  appName: {
    marginTop: 18,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: 0,
  },
  versionText: {
    marginTop: 7,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "500",
    letterSpacing: 0,
  },
  menuGroup: {
    borderRadius: brand.radius.large,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
    boxShadow: brand.shadow.card,
  },
  menuRow: {
    minHeight: 82,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  menuCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  menuTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: 0,
  },
  menuDetail: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    letterSpacing: 0,
  },
  disabledRow: {
    opacity: 0.68,
  },
  downloadProgressRing: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadProgressFallbackRing: {
    position: "absolute",
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 4,
  },
  downloadProgressText: {
    position: "absolute",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0,
  },
  footer: {
    marginTop: "auto",
    paddingTop: 34,
    alignItems: "center",
    gap: 8,
  },
  footerLink: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
  },
  footerText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    letterSpacing: 0,
    textAlign: "center",
  },
});
