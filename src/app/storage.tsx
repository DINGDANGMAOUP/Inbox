import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
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
import { brand } from "@/constants/brand";
import { appThemeAssets } from "@/constants/theme-assets";
import { useReaderPreferences } from "@/hooks/use-reader-preferences";
import {
  clearAppCache,
  clearReadingData,
  getStorageOverview,
  type StorageOverview,
} from "@/lib/storage-service";

type StorageTheme = (typeof brand.appThemes)[keyof typeof brand.appThemes];
type BusyAction = "cache" | "reading" | null;
// 
export default function StorageScreen() {
  const db = useSQLiteContext();
  const { resolvedAppTheme } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];
  const topBarHeight = insets.top + 56;
  const [overview, setOverview] = useState<StorageOverview | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStorage = useCallback(async () => {
    const nextOverview = await getStorageOverview(db);
    setError(null);
    setOverview(nextOverview);
  }, [db]);

  useEffect(() => {
    let active = true;
    const timeout = setTimeout(() => {
      getStorageOverview(db)
        .then((nextOverview) => {
          if (active) {
            setError(null);
            setOverview(nextOverview);
          }
        })
        .catch((nextError: unknown) => {
          if (active) {
            setError(errorMessage(nextError));
          }
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [db]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      closeRoute();
      return true;
    });
    return () => subscription.remove();
  }, [closeRoute]);

  const runCleanup = useCallback(
    async (
      action: Exclude<BusyAction, null>,
      task: () => Promise<{ bytesCleared: number }>,
    ) => {
      setBusyAction(action);
      try {
        const result = await task();
        await refreshStorage();
        Alert.alert("已清理", `释放 ${formatBytes(result.bytesCleared)}`);
      } catch (nextError) {
        Alert.alert("清理失败", errorMessage(nextError));
      } finally {
        setBusyAction(null);
      }
    },
    [refreshStorage],
  );

  const confirmClearCache = useCallback(() => {
    Alert.alert("清理缓存", "删除临时文件，不会删除书籍。", [
      { text: "取消", style: "cancel" },
      {
        text: "清理",
        style: "destructive",
        onPress: () => runCleanup("cache", clearAppCache),
      },
    ]);
  }, [runCleanup]);

  const confirmClearReadingData = useCallback(() => {
    Alert.alert("清阅读数据", "会删除阅读进度和标注，书籍文件保留。", [
      { text: "取消", style: "cancel" },
      {
        text: "清理",
        style: "destructive",
        onPress: () => runCleanup("reading", () => clearReadingData(db)),
      },
    ]);
  }, [db, runCleanup]);

  return (
    <Animated.View style={[styles.routeShell, routeStyle]}>
      <M3Screen
        key={`storage-screen-${resolvedAppTheme}`}
        theme={theme}
        backgroundSource={appThemeAssets[resolvedAppTheme].background}
        overlayColor={
          resolvedAppTheme === "deep" ? "rgba(8, 9, 6, 0.46)" : "rgba(250, 248, 242, 0.93)"
        }
      >
        <View
          style={[
            styles.navBar,
            {
              height: topBarHeight,
              paddingTop: insets.top,
              backgroundColor: resolvedAppTheme === "deep" ? "#080906" : "#FAF8F2",
              borderBottomColor: theme.line,
            },
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
            onPress={closeRoute}
          >
            <View pointerEvents="none" style={styles.backButtonIcon}>
              <Text style={[styles.backButtonGlyph, { color: theme.text }]}>‹</Text>
            </View>
          </Pressable>
          <Text pointerEvents="none" numberOfLines={1} style={[styles.navTitle, { color: theme.text }]}>
            存储空间
          </Text>
        </View>

        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[
            styles.content,
            { paddingTop: topBarHeight + 24 },
            width >= 700 && styles.contentWide,
          ]}
        >
          {!overview && !error ? (
            <View style={[styles.loadingPanel, { borderColor: theme.line, backgroundColor: theme.surfaceSolid }]}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.loadingText, { color: theme.muted }]}>正在读取存储</Text>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.loadingPanel, { borderColor: theme.line, backgroundColor: theme.surfaceSolid }]}>
              <MaterialSymbol name="error" color={theme.error} decorative size={26} />
              <Text selectable style={[styles.errorText, { color: theme.text }]}>{error}</Text>
              <M3Pressable
                onPress={() => refreshStorage().catch((nextError: unknown) => setError(errorMessage(nextError)))}
                style={[styles.retryButton, { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.retryText, { color: theme.accentText }]}>重试</Text>
              </M3Pressable>
            </View>
          ) : null}

          {overview ? (
            <>
              <StorageOverviewHero theme={theme} overview={overview} />

              <View style={styles.cardStack}>
                <StorageCard
                  theme={theme}
                  icon="folder"
                  title="书籍与正文"
                  value={formatBytes(overview.libraryBytes)}
                  detail={`${overview.bookCount} 本书 · ${overview.chapterCount} 章 · ${overview.epubCount} EPUB / ${overview.txtCount} TXT`}
                  tone="library"
                />
                <StorageCard
                  theme={theme}
                  icon="database"
                  title="阅读数据库"
                  value={formatBytes(overview.databaseBytes)}
                  detail={`${overview.searchIndexCount} 条索引 · ${overview.progressCount} 条进度 · ${overview.annotationCount} 条标注`}
                  tone="database"
                />
                <StorageCard
                  theme={theme}
                  icon="cached"
                  title="缓存数据"
                  value={formatBytes(overview.cacheBytes)}
                  detail="临时导入文件和系统缓存"
                  disabled={busyAction !== null || overview.cacheBytes <= 0}
                  busy={busyAction === "cache"}
                  actionLabel="清理"
                  onPress={confirmClearCache}
                />
                <StorageCard
                  theme={theme}
                  icon="delete"
                  title="阅读痕迹"
                  value={`${overview.progressCount + overview.annotationCount} 项`}
                  detail="清除阅读进度和标注，书籍保留"
                  disabled={busyAction !== null || (overview.progressCount === 0 && overview.annotationCount === 0)}
                  busy={busyAction === "reading"}
                  destructive
                  actionLabel="清理"
                  onPress={confirmClearReadingData}
                />
              </View>
            </>
          ) : null}
        </ScrollView>
      </M3Screen>
    </Animated.View>
  );
}

function StorageOverviewHero({
  theme,
  overview,
}: {
  theme: StorageTheme;
  overview: StorageOverview;
}) {
  const diskUsedBytes = Math.max(0, overview.totalDiskBytes - overview.availableDiskBytes);
  const appPercent = percentLabel(overview.totalBytes, overview.totalDiskBytes);
  const diskPercent = percentLabel(diskUsedBytes, overview.totalDiskBytes);

  return (
    <View style={[styles.hero, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
      <View style={styles.ringWrap} accessibilityLabel={`应用内存储 ${formatBytes(overview.totalBytes)}`}>
        <View style={[styles.ringTrack, { borderColor: theme.surfaceContainer }]} />
        <View
          style={[
            styles.ringArc,
            styles.ringArcPhone,
            {
              borderLeftColor: theme.surfaceContainerHigh,
              borderBottomColor: theme.surfaceContainerHigh,
            },
          ]}
        />
        <View
          style={[
            styles.ringArc,
            styles.ringArcApp,
            {
              borderTopColor: theme.accent,
              borderRightColor: theme.accent,
            },
          ]}
        />
        <View style={[styles.ringCore, { backgroundColor: theme.surfaceSolid }]}>
          <Text style={[styles.heroLabel, { color: theme.muted }]}>应用内存储</Text>
          <Text selectable style={[styles.heroValue, { color: theme.text }]}>
            {formatBytes(overview.totalBytes)}
          </Text>
          <Text style={[styles.heroPercent, { color: theme.muted }]}>占手机存储 {appPercent}</Text>
        </View>
      </View>

      <View style={styles.legendGrid}>
        <LegendItem theme={theme} color={theme.accent} label="墨屿占用" value={appPercent} />
        <LegendItem theme={theme} color={theme.surfaceContainerHigh} label="手机已用" value={diskPercent} />
        <LegendItem theme={theme} color={theme.surfaceContainer} label="手机可用" value={formatBytes(overview.availableDiskBytes)} />
      </View>
    </View>
  );
}

function LegendItem({
  theme,
  color,
  label,
  value,
}: {
  theme: StorageTheme;
  color: string;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color, borderColor: theme.line }]} />
      <View style={styles.legendCopy}>
        <Text numberOfLines={1} style={[styles.legendLabel, { color: theme.muted }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.legendValue, { color: theme.text }]}>{value}</Text>
      </View>
    </View>
  );
}

function StorageCard({
  theme,
  icon,
  title,
  value,
  detail,
  tone,
  destructive,
  disabled,
  busy,
  actionLabel,
  onPress,
}: {
  theme: StorageTheme;
  icon: MaterialSymbolName;
  title: string;
  value: string;
  detail: string;
  tone?: "library" | "database";
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
  actionLabel?: string;
  onPress?: () => void;
}) {
  const color = destructive ? theme.error : tone === "database" ? theme.tertiary : theme.accent;
  const actionDisabled = disabled || !onPress;
  return (
    <View style={[styles.dataCard, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconBox, { backgroundColor: theme.primaryContainer }]}>
          <MaterialSymbol name={icon} color={theme.onPrimaryContainer} decorative size={17} />
        </View>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        {actionLabel ? (
          <M3Pressable
            disabled={actionDisabled}
            onPress={onPress}
            feedback="subtle"
            accessibilityRole="button"
            accessibilityState={{ disabled: actionDisabled }}
            style={[
              styles.cardButton,
              {
                backgroundColor: destructive ? "transparent" : theme.accent,
                borderColor: destructive ? color : "transparent",
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={destructive ? color : theme.accentText} />
            ) : (
              <Text style={[styles.cardButtonText, { color: destructive ? color : theme.accentText }]}>
                {actionLabel}
              </Text>
            )}
          </M3Pressable>
        ) : null}
      </View>
      <Text selectable numberOfLines={1} adjustsFontSizeToFit style={[styles.cardValue, { color }]}>
        {value}
      </Text>
      <Text numberOfLines={2} style={[styles.cardDetail, { color: theme.muted }]}>{detail}</Text>
    </View>
  );
}

function percentLabel(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0 || value <= 0) {
    return "0%";
  }
  const percent = (value / total) * 100;
  return `${percent < 0.1 ? "<0.1" : percent.toFixed(percent >= 10 ? 0 : 1)}%`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "存储读取失败";
}

const styles = StyleSheet.create({
  routeShell: {
    flex: 1,
  },
  navBar: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    borderBottomWidth: 1,
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
    left: 88,
    right: 88,
    bottom: 16,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: 0,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 96,
    gap: 22,
  },
  contentWide: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  loadingPanel: {
    minHeight: 220,
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0,
  },
  errorText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0,
  },
  retryButton: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "900",
    letterSpacing: 0,
  },
  hero: {
    alignItems: "center",
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 20,
  },
  ringWrap: {
    width: 248,
    height: 248,
    alignItems: "center",
    justifyContent: "center",
  },
  ringTrack: {
    position: "absolute",
    width: 232,
    height: 232,
    borderRadius: 116,
    borderWidth: 28,
  },
  ringArc: {
    position: "absolute",
    width: 232,
    height: 232,
    borderRadius: 116,
    borderWidth: 28,
    borderColor: "transparent",
  },
  ringArcPhone: {
    transform: [{ rotate: "32deg" }],
  },
  ringArcApp: {
    transform: [{ rotate: "-18deg" }],
  },
  ringCore: {
    width: 154,
    height: 154,
    borderRadius: 77,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  heroLabel: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    letterSpacing: 0,
  },
  heroValue: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
    letterSpacing: 0,
    fontVariant: ["tabular-nums"],
  },
  heroPercent: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
    letterSpacing: 0,
  },
  legendGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
  },
  legendItem: {
    minWidth: 104,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  legendCopy: {
    minWidth: 0,
    gap: 4,
  },
  legendLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0,
  },
  legendValue: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 0,
    fontVariant: ["tabular-nums"],
  },
  cardStack: {
    gap: 14,
  },
  dataCard: {
    minHeight: 168,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
  },
  cardHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: "800",
    letterSpacing: 0,
  },
  cardButton: {
    minWidth: 88,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  cardButtonText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900",
    letterSpacing: 0,
  },
  cardValue: {
    maxWidth: "100%",
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "900",
    letterSpacing: 0,
    fontVariant: ["tabular-nums"],
  },
  cardDetail: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    letterSpacing: 0,
  },
});
