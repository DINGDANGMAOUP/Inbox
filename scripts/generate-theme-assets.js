const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const source = process.argv[2];
if (!source) {
  throw new Error('Usage: node scripts/generate-theme-assets.js <source-png>');
}

const outDir = path.join(process.cwd(), 'assets/images/themes');
fs.mkdirSync(outDir, { recursive: true });

const input = PNG.sync.read(fs.readFileSync(source));

function cropPng({ name, x, y, width, height }) {
  const output = new PNG({ width, height });

  PNG.bitblt(input, output, x, y, width, height, 0, 0);
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(output));
}

fs.copyFileSync(source, path.join(outDir, 'moyu-material-board.png'));

cropPng({ name: 'mist-background.png', x: 10, y: 10, width: 497, height: 1004 });
cropPng({ name: 'deep-background.png', x: 517, y: 10, width: 501, height: 1004 });
cropPng({ name: 'reading-background.png', x: 1028, y: 10, width: 498, height: 1004 });

cropPng({ name: 'mist-cover.png', x: 10, y: 190, width: 497, height: 760 });
cropPng({ name: 'deep-cover.png', x: 517, y: 188, width: 501, height: 760 });
cropPng({ name: 'reading-cover.png', x: 1028, y: 40, width: 498, height: 760 });
