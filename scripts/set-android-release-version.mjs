import { readFileSync, writeFileSync } from 'node:fs';

const [version, buildNumberText] = process.argv.slice(2);
const buildNumber = Number(buildNumberText);
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!versionPattern.test(version ?? '') || !Number.isInteger(buildNumber) || buildNumber <= 0) {
  console.error('Usage: node scripts/set-android-release-version.mjs <version> <positive-build-number>');
  process.exit(1);
}

const configPath = new URL('../app.json', import.meta.url);
const packagePath = new URL('../package.json', import.meta.url);
const appConfig = JSON.parse(readFileSync(configPath, 'utf8'));
const packageConfig = JSON.parse(readFileSync(packagePath, 'utf8'));

appConfig.expo.version = version;
appConfig.expo.android = {
  ...appConfig.expo.android,
  versionCode: buildNumber,
};
packageConfig.version = version;

writeFileSync(configPath, `${JSON.stringify(appConfig, null, 2)}\n`);
writeFileSync(packagePath, `${JSON.stringify(packageConfig, null, 2)}\n`);
