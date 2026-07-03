import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking } from 'react-native';

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
  releaseNotes: string;
  force: boolean;
  publishedAt?: string;
  tagName: string;
  releaseUrl: string;
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

    if (compareVersions(remote.version, current.version) <= 0) {
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

export async function openReleasePage(remote?: RemoteAppVersion) {
  const url = remote?.releaseUrl ?? getUpdateSourceInfo().latestReleaseUrl;
  await Linking.openURL(url);
}

async function fetchLatestGithubRelease(): Promise<RemoteAppVersion> {
  const release = await fetchLatestRelease();
  const version = normalizeReleaseVersion(release.tag_name || release.name);

  return {
    version,
    buildNumber: parseReleaseBuildNumber(release.tag_name),
    releaseNotes: release.body?.trim() || '这个版本没有填写更新说明。',
    force: false,
    publishedAt: release.published_at,
    tagName: release.tag_name,
    releaseUrl: release.html_url,
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

function normalizeReleaseVersion(value?: string) {
  const version = value?.trim().replace(/^v/i, '');
  if (!version) {
    throw new Error('Release 缺少版本号。');
  }
  return version;
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
