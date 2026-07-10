import { existsSync, readFileSync } from 'node:fs';

const appConfig = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
const packageConfig = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

if (appConfig.expo.version !== packageConfig.version) {
  throw new Error(`Version mismatch: app.json=${appConfig.expo.version}, package.json=${packageConfig.version}`);
}

for (const asset of [
  appConfig.expo.icon,
  appConfig.expo.android?.adaptiveIcon?.foregroundImage,
  appConfig.expo.android?.adaptiveIcon?.backgroundImage,
  appConfig.expo.android?.adaptiveIcon?.monochromeImage,
]) {
  if (!asset || !existsSync(new URL(`../${asset.replace(/^\.\//, '')}`, import.meta.url))) {
    throw new Error(`Missing configured asset: ${asset ?? '<unset>'}`);
  }
}

if (!appConfig.expo.plugins?.includes('./plugins/with-readium-android')) {
  throw new Error('Readium Android config plugin is not enabled.');
}

console.log('project config ok');
