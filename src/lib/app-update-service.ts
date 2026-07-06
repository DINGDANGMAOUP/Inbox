import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Linking, Platform } from 'react-native';

const githubUpdates = Constants.expoConfig?.extra?.githubUpdates as { owner?: string; repo?: string } | undefined;
const updateConfig = {
  owner: githubUpdates?.owner ?? 'DINGDANGMAOUP',
  repo: githubUpdates?.repo ?? 'Inbox',
};
const apkMimeType = 'application/vnd.android.package-archive';
const androidViewAction = 'android.intent.action.VIEW';
const flagGrantReadUriPermission = 1;

export type InstalledAppVersion = {
  version: string;
  buildNumber: number;
  environment: ExecutionEnvironment;
};

export type RemoteAppVersion = {
  version: string;
  buildNumber: number;
  releaseNotes: string;
  force: boolean;
  minSupportedBuild?: number;
  publishedAt?: string;
  tagName: string;
  releaseUrl: string;
  apkUrl?: string;
  apkSize?: number;
};

export type UpdateCheckResult =
  | { status: 'current'; message: string; current: InstalledAppVersion; remote?: RemoteAppVersion }
  | { status: 'available'; message: string; current: InstalledAppVersion; remote: RemoteAppVersion }
  | { status: 'error'; message: string; current: InstalledAppVersion };

export function getInstalledAppVersion(): InstalledAppVersion {
  const version = Constants.expoConfig?.version ?? '0.0.1';
  const rawBuildNumber = String(Constants.expoConfig?.android?.versionCode ?? 0);
  const buildNumber = Number.parseInt(rawBuildNumber, 10);

  return {
    version,
    buildNumber: Number.isFinite(buildNumber) ? buildNumber : 0,
    environment: Constants.executionEnvironment,
  };
}
export function getUpdateSourceInfo() {
  return {
    label: 'GitHub Releases',
    repository: `${updateConfig.owner}/${updateConfig.repo}`,
    latestReleaseUrl: `https://github.com/${updateConfig.owner}/${updateConfig.repo}/releases`,
  };
}

export async function checkForGithubAppUpdate(): Promise<UpdateCheckResult> {
  const current = getInstalledAppVersion();

  try {
    const remote = await fetchLatestGithubRelease();
    const versionDelta = compareVersions(remote.version, current.version);
    const hasNewerBuild = versionDelta === 0 && remote.buildNumber > current.buildNumber;

    if (versionDelta < 0 || (versionDelta === 0 && !hasNewerBuild)) {
      return {
        status: 'current',
        current,
        remote,
        message: '已是最新版本',
      };
    }

    return {
      status: 'available',
      current,
      remote,
      message: `发现新版本 ${remote.version}`,
    };
  } catch (error) {
    return {
      status: 'error',
      current,
      message: error instanceof Error ? error.message : '检查 GitHub Releases 失败。',
    };
  }
}

export async function openUpdateDownloadLink(remote?: RemoteAppVersion) {
  const url =
    remote?.apkUrl ?? remote?.releaseUrl ?? getUpdateSourceInfo().latestReleaseUrl;
  await Linking.openURL(url);
}

export async function downloadAndOpenUpdateInstaller(remote: RemoteAppVersion) {
  if (!remote.apkUrl) {
    throw new Error('这个版本还没有上传安装包，请稍后再试。');
  }

  if (Platform.OS !== 'android') {
    await openUpdateDownloadLink(remote);
    return;
  }

  const rootDirectory =
    FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!rootDirectory) {
    await openUpdateDownloadLink(remote);
    return;
  }

  const downloadDirectory = `${rootDirectory}updates/`;
  await FileSystem.makeDirectoryAsync(downloadDirectory, {
    intermediates: true,
  });

  const fileName = `Inbox-${sanitizeFileSegment(remote.version)}-${remote.buildNumber}.apk`;
  const result = await FileSystem.downloadAsync(
    remote.apkUrl,
    `${downloadDirectory}${fileName}`,
    {
      headers: {
        Accept: apkMimeType,
      },
    },
  );

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`安装包下载失败：HTTP ${result.status}`);
  }

  const contentUri = await FileSystem.getContentUriAsync(result.uri);
  await IntentLauncher.startActivityAsync(androidViewAction, {
    data: contentUri,
    flags: flagGrantReadUriPermission,
    type: apkMimeType,
  });
}

async function fetchLatestGithubRelease(): Promise<RemoteAppVersion> {
  const release = await fetchLatestRelease();
  const manifest = await fetchReleaseManifest(release).catch(() => undefined);
  const version = normalizeReleaseVersion(
    manifest?.version ?? release.tag_name ?? release.name,
  );

  return {
    version,
    buildNumber: manifest?.buildNumber ?? parseReleaseBuildNumber(release.tag_name),
    releaseNotes:
      manifest?.releaseNotes?.trim() ||
      release.body?.trim() ||
      '这个版本没有填写更新说明。',
    force: manifest?.force ?? false,
    minSupportedBuild: manifest?.minSupportedBuild,
    publishedAt: manifest?.publishedAt ?? release.published_at,
    tagName: manifest?.tagName ?? release.tag_name,
    releaseUrl: manifest?.releaseUrl ?? release.html_url,
    apkUrl: manifest?.apkUrl,
    apkSize: manifest?.apkSize,
  };
}

type GithubRelease = {
  tag_name: string;
  html_url: string;
  name?: string;
  body?: string;
  draft: boolean;
  published_at?: string;
  assets: {
    name: string;
    browser_download_url: string;
  }[];
};

type ReleaseManifest = {
  version?: string;
  buildNumber?: number;
  minSupportedBuild?: number;
  apkUrl?: string;
  apkSize?: number;
  releaseNotes?: string;
  force?: boolean;
  publishedAt?: string;
  tagName?: string;
  releaseUrl?: string;
};

async function fetchLatestRelease() {
  const latestReleaseUrl = `https://api.github.com/repos/${updateConfig.owner}/${updateConfig.repo}/releases/latest`;
  const response = await fetch(latestReleaseUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('暂未发布正式版本。');
    }
    throw new Error(`Releases 读取失败：HTTP ${response.status}`);
  }

  return (await response.json()) as GithubRelease;
}

async function fetchReleaseManifest(release: GithubRelease) {
  const manifestAsset = release.assets.find(
    (asset) => asset.name === 'latest.json',
  );
  if (!manifestAsset?.browser_download_url) {
    return undefined;
  }

  const response = await fetch(manifestAsset.browser_download_url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`版本清单读取失败：HTTP ${response.status}`);
  }

  return sanitizeReleaseManifest((await response.json()) as ReleaseManifest);
}

function normalizeReleaseVersion(value?: string) {
  const version = value?.trim().replace(/^v/i, '');
  if (!version) {
    throw new Error('Release 缺少版本号。');
  }
  return version;
}

function sanitizeReleaseManifest(manifest: ReleaseManifest): ReleaseManifest {
  return {
    version: sanitizeString(manifest.version),
    buildNumber: sanitizeNumber(manifest.buildNumber),
    minSupportedBuild: sanitizeNumber(manifest.minSupportedBuild),
    apkUrl: sanitizeString(manifest.apkUrl),
    apkSize: sanitizeNumber(manifest.apkSize),
    releaseNotes: sanitizeString(manifest.releaseNotes),
    force: manifest.force === true,
    publishedAt: sanitizeString(manifest.publishedAt),
    tagName: sanitizeString(manifest.tagName),
    releaseUrl: sanitizeString(manifest.releaseUrl),
  };
}

function sanitizeString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function sanitizeNumber(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-z0-9.+-]/gi, '-');
}

function parseReleaseBuildNumber(tagName: string) {
  const buildMatch = tagName.match(/[+.-]build[.-]?(\d+)/i) ?? tagName.match(/\+(\d+)$/);
  if (!buildMatch?.[1]) {
    return 0;
  }
  const buildNumber = Number.parseInt(buildMatch[1], 10);
  return Number.isFinite(buildNumber) ? buildNumber : 0;
}

function compareVersions(left: string, right: string) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function versionParts(value: string) {
  return value
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}
