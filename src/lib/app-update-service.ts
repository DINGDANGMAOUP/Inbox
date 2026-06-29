import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';
const ACTION_INSTALL_PACKAGE = 'android.intent.action.INSTALL_PACKAGE';
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268435456;

const githubUpdates = Constants.expoConfig?.extra?.githubUpdates as { owner?: string; repo?: string } | undefined;
const updateConfig = {
  owner: githubUpdates?.owner ?? 'DINGDANGMAOUP',
  repo: githubUpdates?.repo ?? 'Inbox',
};

export type InstalledAppVersion = {
  version: string;
  buildNumber: number;
  environment: ExecutionEnvironment;
};

export type RemoteAppVersion = {
  version: string;
  buildNumber: number;
  minSupportedBuild?: number;
  apkUrl: string;
  apkSize?: number;
  releaseNotes: string;
  force: boolean;
  publishedAt?: string;
  tagName: string;
  releaseUrl: string;
};

export type UpdateCheckResult =
  | { status: 'unsupported'; message: string; current: InstalledAppVersion }
  | { status: 'current'; message: string; current: InstalledAppVersion; remote?: RemoteAppVersion }
  | { status: 'available'; message: string; current: InstalledAppVersion; remote: RemoteAppVersion }
  | { status: 'error'; message: string; current: InstalledAppVersion };

type LatestJson = Partial<Omit<RemoteAppVersion, 'tagName' | 'releaseUrl'>> & {
  tagName?: string;
  releaseUrl?: string;
};

export function getInstalledAppVersion(): InstalledAppVersion {
  const isExpoHost = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const version = isExpoHost ? Constants.expoConfig?.version ?? '1.0.0' : Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '1.0.0';
  const rawBuildNumber = isExpoHost
    ? String(Constants.expoConfig?.android?.versionCode ?? 0)
    : Application.nativeBuildVersion ?? String(Constants.expoConfig?.android?.versionCode ?? 0);
  const buildNumber = Number.parseInt(rawBuildNumber, 10);

  return {
    version,
    buildNumber: Number.isFinite(buildNumber) ? buildNumber : 0,
    environment: Constants.executionEnvironment,
  };
}

export function getUpdateSourceInfo() {
  return {
    label: 'GitHub Release',
    repository: `${updateConfig.owner}/${updateConfig.repo}`,
    latestReleaseUrl: `https://github.com/${updateConfig.owner}/${updateConfig.repo}/releases/latest`,
  };
}

export async function checkForGithubAppUpdate(): Promise<UpdateCheckResult> {
  const current = getInstalledAppVersion();

  if (Platform.OS !== 'android') {
    return {
      status: 'unsupported',
      current,
      message: '当前完整包更新仅支持 Android。iOS 仍需要 App Store、TestFlight 或企业签名渠道。',
    };
  }

  try {
    const remote = await fetchLatestVersionMarker();

    if (remote.buildNumber <= current.buildNumber) {
      return {
        status: 'current',
        current,
        remote,
        message: `当前已是最新版本：${current.version} (${current.buildNumber})。`,
      };
    }

    return {
      status: 'available',
      current,
      remote,
      message: `发现新版本 ${remote.version} (${remote.buildNumber})，可以下载完整安装包。`,
    };
  } catch (error) {
    return {
      status: 'error',
      current,
      message: error instanceof Error ? error.message : '检查 GitHub 最新版本失败。',
    };
  }
}

export async function downloadGithubApk(remote: RemoteAppVersion, onProgress: (progress: number, written: number, total: number) => void) {
  const updatesDirectory = new Directory(Paths.cache, 'app-updates');
  updatesDirectory.create({ intermediates: true, idempotent: true });

  const destination = new File(updatesDirectory, `Inbox-${remote.version}-${remote.buildNumber}.apk`);
  if (destination.exists) {
    destination.delete();
  }

  const task = File.createDownloadTask(remote.apkUrl, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      const progress = totalBytes > 0 ? Math.min(1, bytesWritten / totalBytes) : 0;
      onProgress(progress, bytesWritten, totalBytes);
    },
  });

  const file = await task.downloadAsync();
  if (!file) {
    throw new Error('下载已暂停，未生成安装包。');
  }

  return file;
}

export async function installDownloadedApk(fileUri: string) {
  if (Platform.OS !== 'android') {
    throw new Error('APK 安装仅支持 Android。');
  }

  const file = new File(fileUri);
  if (!file.exists) {
    throw new Error('安装包不存在，请重新下载。');
  }

  await IntentLauncher.startActivityAsync(ACTION_INSTALL_PACKAGE, {
    data: file.contentUri,
    type: APK_MIME_TYPE,
    flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
  });
}

export async function openReleasePage(remote?: RemoteAppVersion) {
  const url = remote?.releaseUrl ?? getUpdateSourceInfo().latestReleaseUrl;
  await Linking.openURL(url);
}

async function fetchLatestVersionMarker(): Promise<RemoteAppVersion> {
  const latestJsonUrl = `https://github.com/${updateConfig.owner}/${updateConfig.repo}/releases/latest/download/latest.json`;
  const manifest = await fetchLatestJson(latestJsonUrl);
  const buildNumber = Number(manifest.buildNumber);

  if (!manifest.version || !Number.isFinite(buildNumber) || buildNumber <= 0 || !manifest.apkUrl) {
    throw new Error('GitHub latest.json 缺少 version、buildNumber 或 apkUrl。');
  }

  return {
    version: manifest.version,
    buildNumber,
    minSupportedBuild: manifest.minSupportedBuild,
    apkUrl: manifest.apkUrl,
    apkSize: manifest.apkSize,
    releaseNotes: manifest.releaseNotes ?? '这个版本没有填写更新说明。',
    force: Boolean(manifest.force),
    publishedAt: manifest.publishedAt,
    tagName: manifest.tagName ?? `android-v${manifest.version}+${buildNumber}`,
    releaseUrl: manifest.releaseUrl ?? `https://github.com/${updateConfig.owner}/${updateConfig.repo}/releases/latest`,
  };
}

async function fetchLatestJson(url: string) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('GitHub Release 里还没有 latest.json。先运行 Android Release 工作流发布完整安装包。');
    }
    throw new Error(`版本标记读取失败：HTTP ${response.status}`);
  }

  return (await response.json()) as LatestJson;
}
