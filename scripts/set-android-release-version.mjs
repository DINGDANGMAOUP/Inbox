import { readFileSync, writeFileSync } from 'node:fs';

const [version, buildNumberText] = process.argv.slice(2);
const buildNumber = Number.parseInt(buildNumberText, 10);

if (!version || !Number.isFinite(buildNumber) || buildNumber <= 0) {
  console.error('Usage: node scripts/set-android-release-version.mjs <version> <positive-build-number>');
  process.exit(1);
}

const configPath = new URL('../app.json', import.meta.url);
const appConfig = JSON.parse(readFileSync(configPath, 'utf8'));

appConfig.expo.version = version;
appConfig.expo.android = {
  ...appConfig.expo.android,
  versionCode: buildNumber,
};

writeFileSync(configPath, `${JSON.stringify(appConfig, null, 2)}\n`);
