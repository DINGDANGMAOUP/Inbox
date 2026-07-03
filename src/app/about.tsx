import { Image } from "expo-image";
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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { M3Screen } from "@/components/reader/m3";
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
  getInstalledAppVersion,
  openReleasePage,
} from "@/lib/app-update-service";

type UpdatePhase =
  "idle" | "checking" | "current" | "available" | "unavailable" | "error";

type AboutTheme = (typeof brand.appThemes)[keyof typeof brand.appThemes];

export default function AboutScreen() {
  const { resolvedAppTheme } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];
  const installedVersion = useMemo(() => getInstalledAppVersion(), []);
  const [updatePhase, setUpdatePhase] = useState<UpdatePhase>("idle");
  const [updateMessage, setUpdateMessage] = useState("检查 GitHub Releases");
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>();
  const isDeepTheme = resolvedAppTheme === "deep";
  const topBarHeight = insets.top + 56;

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

  const checkUpdate = useCallback(async () => {
    if (updatePhase === "checking") {
      return;
    }

    setUpdatePhase("checking");
    setUpdateMessage("正在检查 GitHub Releases");
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
        setUpdateMessage("暂时无法访问 Releases");
        Alert.alert("检查失败", "暂时无法访问 GitHub Releases，可稍后再试。");
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
        setUpdatePhase("available");
        Alert.alert(
          "发现新版本",
          `最新版本 Version ${result.remote.version}\n\n${result.remote.releaseNotes}`,
          [
            { text: "稍后", style: "cancel" },
            {
              text: "查看 Releases",
              onPress: () => openReleasePage(result.remote),
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
        setUpdateMessage("暂时无法访问 Releases");
        Alert.alert("检查失败", "暂时无法访问 GitHub Releases，可稍后再试。");
        return;
      }
      setUpdatePhase("error");
      setUpdateMessage(message);
      Alert.alert("检查失败", message);
    }
  }, [updatePhase]);

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
        <View
          style={[
            styles.navBar,
            { height: topBarHeight, paddingTop: insets.top },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            hitSlop={16}
            pressRetentionOffset={18}
            android_ripple={{
              color: "rgba(47, 107, 79, 0.14)",
              borderless: true,
              radius: 28,
            }}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
            onPress={handleBack}
          >
            <View pointerEvents="none" style={styles.backButtonIcon}>
              <Text style={[styles.backButtonGlyph, { color: theme.text }]}>
                ‹
              </Text>
            </View>
          </Pressable>
          <Text
            pointerEvents="none"
            numberOfLines={1}
            style={[styles.navTitle, { color: theme.text }]}
          >
            关于墨屿
          </Text>
        </View>
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.content,
            { paddingTop: topBarHeight + 32 },
            width >= 700 && styles.contentWide,
          ]}
        >
          <View style={styles.identity}>
            <View
              style={[
                styles.logoPlate,
                {
                  backgroundColor: theme.surfaceSolid,
                  borderColor: theme.line,
                },
              ]}
            >
              <Image
                source={brandAssets.logoMark}
                contentFit="cover"
                style={styles.logo}
              />
            </View>
            <Text style={[styles.appName, { color: theme.text }]}>墨屿</Text>
            <Text style={[styles.versionText, { color: theme.muted }]}>
              Version {installedVersion.version}
            </Text>
          </View>

          <View style={[styles.menuGroup, { borderTopColor: theme.line }]}>
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
              )}
              icon={updatePhaseIcon(updatePhase)}
              disabled={updatePhase === "checking"}
              onPress={checkUpdate}
              trailing={
                updatePhase === "checking" ? (
                  <ActivityIndicator color={theme.accent} />
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
) {
  if (phase === "idle") {
    return message;
  }
  if (phase === "checking") {
    return "正在检查";
  }
  if (phase === "available") {
    return "发现新版本";
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

function updatePhaseIcon(phase: UpdatePhase): MaterialSymbolName {
  switch (phase) {
    case "checking":
      return "refresh";
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

const styles = StyleSheet.create({
  routeShell: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 96,
  },
  contentWide: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  navBar: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    justifyContent: "center",
  },
  backButton: {
    marginLeft: 4,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonPressed: {
    opacity: 0.68,
  },
  backButtonIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonGlyph: {
    marginLeft: -2,
    marginTop: -2,
    fontSize: 38,
    lineHeight: 38,
    fontWeight: "500",
    letterSpacing: 0,
  },
  navTitle: {
    position: "absolute",
    left: 80,
    right: 80,
    bottom: 16,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: 0,
  },
  identity: {
    alignItems: "center",
    paddingTop: 22,
    paddingBottom: 66,
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
    position: "absolute",
    left: -77,
    top: -76,
    width: 238,
    height: 238,
  },
  appName: {
    marginTop: 30,
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
    borderTopWidth: 1,
  },
  menuRow: {
    minHeight: 82,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
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
  footer: {
    marginTop: "auto",
    paddingTop: 92,
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
