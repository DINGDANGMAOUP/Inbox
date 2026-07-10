import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { PageHeader, AppScreen } from "@/components/ui/app-ui";
import { FeedbackPressable } from "@/components/ui/feedback-pressable";
import {
  MaterialSymbol,
  type MaterialSymbolName,
} from "@/components/ui/material-symbol";
import { useRouteSlideTransition } from "@/components/ui/route-slide-transition";
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

export default function StorageScreen() {
  const db = useSQLiteContext();
  const { resolvedAppTheme } = useReaderPreferences();
  const { width } = useWindowDimensions();
  const { closeRoute, routeStyle } = useRouteSlideTransition(width);
  const theme = brand.appThemes[resolvedAppTheme];
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
      <AppScreen
        key={`storage-screen-${resolvedAppTheme}`}
        theme={theme}
        backgroundSource={appThemeAssets[resolvedAppTheme].background}
        overlayColor={
          resolvedAppTheme === "deep" ? "rgba(8, 9, 6, 0.46)" : "rgba(250, 248, 242, 0.93)"
        }
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.content,
            width >= 700 && styles.contentWide,
          ]}
        >
          <PageHeader
            theme={theme}
            title="存储空间"
            subtitle="书籍、缓存和阅读记录"
            onBack={closeRoute}
          />
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
              <FeedbackPressable
                onPress={() => refreshStorage().catch((nextError: unknown) => setError(errorMessage(nextError)))}
                style={[styles.retryButton, { backgroundColor: theme.accent }]}
              >
                <Text style={[styles.retryText, { color: theme.accentText }]}>重试</Text>
              </FeedbackPressable>
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
      </AppScreen>
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
  const ringSize = 232;
  const ringStroke = 28;
  const ringCenter = ringSize / 2;
  const ringRadius = ringCenter - ringStroke / 2;
  const ringCircumference = Math.PI * 2 * ringRadius;
  const diskFraction = Math.max(0, Math.min(1, diskUsedBytes / Math.max(1, overview.totalDiskBytes)));
  const appFraction = Math.max(0, Math.min(1, overview.totalBytes / Math.max(1, overview.totalDiskBytes)));

  return (
    <View style={[styles.hero, { backgroundColor: theme.surfaceSolid, borderColor: theme.line }]}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`应用内存储 ${formatBytes(overview.totalBytes)}`}
        style={styles.ringWrap}>
        <Svg width={ringSize} height={ringSize} style={styles.ringSvg}>
          <Circle
            cx={ringCenter}
            cy={ringCenter}
            r={ringRadius}
            fill="none"
            stroke={theme.surfaceContainer}
            strokeWidth={ringStroke}
          />
          <Circle
            cx={ringCenter}
            cy={ringCenter}
            r={ringRadius}
            fill="none"
            stroke={theme.surfaceContainerHigh}
            strokeWidth={ringStroke}
            strokeLinecap="round"
            strokeDasharray={[diskFraction * ringCircumference, ringCircumference]}
            transform={`rotate(-90 ${ringCenter} ${ringCenter})`}
          />
          <Circle
            cx={ringCenter}
            cy={ringCenter}
            r={ringRadius}
            fill="none"
            stroke={theme.accent}
            strokeWidth={ringStroke}
            strokeLinecap="round"
            strokeDasharray={[appFraction * ringCircumference, ringCircumference]}
            transform={`rotate(-90 ${ringCenter} ${ringCenter})`}
          />
        </Svg>
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
          <FeedbackPressable
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
          </FeedbackPressable>
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
  loadingPanel: {
    minHeight: 220,
    borderRadius: brand.radius.extraLarge,
    borderCurve: "continuous",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 20,
    boxShadow: brand.shadow.card,
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
    borderRadius: brand.radius.extraLarge,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 24,
    gap: 20,
    boxShadow: brand.shadow.card,
  },
  ringWrap: {
    width: 248,
    height: 248,
    alignItems: "center",
    justifyContent: "center",
  },
  ringSvg: {
    position: "absolute",
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
    borderRadius: brand.radius.large,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    gap: 14,
    boxShadow: brand.shadow.card,
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
