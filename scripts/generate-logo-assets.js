const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const source = process.argv[2];
if (!source) {
  throw new Error('Usage: node scripts/generate-logo-assets.js <source-png>');
}

const outDir = path.join(process.cwd(), 'assets/images/brand');
fs.mkdirSync(outDir, { recursive: true });

const input = PNG.sync.read(fs.readFileSync(source));

function cropPng({ name, x, y, width, height }) {
  const output = new PNG({ width, height });
  PNG.bitblt(input, output, x, y, width, height, 0, 0);
  fs.writeFileSync(path.join(outDir, name), PNG.sync.write(output));
}

fs.copyFileSync(source, path.join(outDir, 'moyu-logo-board.png'));

cropPng({ name: 'moyu-app-icon.png', x: 260, y: 160, width: 700, height: 700 });
cropPng({ name: 'moyu-wordmark.png', x: 280, y: 710, width: 500, height: 120 });
