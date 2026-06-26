const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const sourcePath = process.argv[2] || path.join(process.cwd(), 'assets/images/brand/moyu-app-icon.png');
const source = PNG.sync.read(fs.readFileSync(sourcePath));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readPixel(image, x, y) {
  const px = clamp(Math.round(x), 0, image.width - 1);
  const py = clamp(Math.round(y), 0, image.height - 1);
  const idx = (py * image.width + px) * 4;
  return [image.data[idx], image.data[idx + 1], image.data[idx + 2], image.data[idx + 3]];
}

function writePixel(image, x, y, rgba) {
  const idx = (y * image.width + x) * 4;
  image.data[idx] = rgba[0];
  image.data[idx + 1] = rgba[1];
  image.data[idx + 2] = rgba[2];
  image.data[idx + 3] = rgba[3];
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function resize(image, width, height) {
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = (x / Math.max(1, width - 1)) * (image.width - 1);
      const sy = (y / Math.max(1, height - 1)) * (image.height - 1);
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = clamp(x0 + 1, 0, image.width - 1);
      const y1 = clamp(y0 + 1, 0, image.height - 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const c00 = readPixel(image, x0, y0);
      const c10 = readPixel(image, x1, y0);
      const c01 = readPixel(image, x0, y1);
      const c11 = readPixel(image, x1, y1);
      const rgba = [0, 1, 2, 3].map((i) => mix(mix(c00[i], c10[i], tx), mix(c01[i], c11[i], tx), ty));
      writePixel(output, x, y, rgba);
    }
  }
  return output;
}

function compose(base, overlay, dx, dy) {
  for (let y = 0; y < overlay.height; y += 1) {
    for (let x = 0; x < overlay.width; x += 1) {
      const bx = x + dx;
      const by = y + dy;
      if (bx < 0 || by < 0 || bx >= base.width || by >= base.height) {
        continue;
      }

      const srcIdx = (y * overlay.width + x) * 4;
      const dstIdx = (by * base.width + bx) * 4;
      const alpha = overlay.data[srcIdx + 3] / 255;
      const inv = 1 - alpha;
      base.data[dstIdx] = Math.round(overlay.data[srcIdx] * alpha + base.data[dstIdx] * inv);
      base.data[dstIdx + 1] = Math.round(overlay.data[srcIdx + 1] * alpha + base.data[dstIdx + 1] * inv);
      base.data[dstIdx + 2] = Math.round(overlay.data[srcIdx + 2] * alpha + base.data[dstIdx + 2] * inv);
      base.data[dstIdx + 3] = Math.round(255 * alpha + base.data[dstIdx + 3] * inv);
    }
  }
}

function createCanvas(width, height, fill = [0, 0, 0, 0]) {
  const output = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      writePixel(output, x, y, fill);
    }
  }
  return output;
}

function createMistBackground(size) {
  const output = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const vertical = y / (size - 1);
      const radial = Math.hypot((x - size * 0.32) / size, (y - size * 0.72) / size);
      const t = clamp(vertical * 0.7 + radial * 0.22, 0, 1);
      const mist = [
        mix(232, 213, t),
        mix(235, 222, t),
        mix(242, 231, t),
        255,
      ];
      writePixel(output, x, y, mist);
    }
  }
  return output;
}

function makeRoundedAlpha(image, radiusRatio = 0.23) {
  const output = new PNG({ width: image.width, height: image.height });
  image.data.copy(output.data);
  const r = image.width * radiusRatio;
  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      const cx = x < r ? r : x > output.width - r ? output.width - r : x;
      const cy = y < r ? r : y > output.height - r ? output.height - r : y;
      const distance = Math.hypot(x - cx, y - cy);
      if (distance > r) {
        const idx = (y * output.width + x) * 4;
        output.data[idx + 3] = 0;
      }
    }
  }
  return output;
}

function makeMonochrome(image) {
  const output = new PNG({ width: image.width, height: image.height });
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const idx = (y * image.width + x) * 4;
      const r = image.data[idx];
      const g = image.data[idx + 1];
      const b = image.data[idx + 2];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const alpha = luminance < 190 ? 255 : 0;
      writePixel(output, x, y, [255, 255, 255, alpha]);
    }
  }
  return output;
}

function save(image, relativePath) {
  fs.writeFileSync(path.join(process.cwd(), relativePath), PNG.sync.write(image));
}

const icon1024 = resize(source, 1024, 1024);
save(icon1024, 'assets/images/icon.png');
save(resize(source, 96, 96), 'assets/images/favicon.png');
save(resize(source, 512, 512), 'assets/images/splash-icon.png');

const adaptiveBackground = createMistBackground(1024);
save(adaptiveBackground, 'assets/images/android-icon-background.png');

const foregroundCanvas = createCanvas(1024, 1024);
const roundedForeground = makeRoundedAlpha(resize(source, 720, 720));
compose(foregroundCanvas, roundedForeground, 152, 152);
save(foregroundCanvas, 'assets/images/android-icon-foreground.png');
save(makeMonochrome(foregroundCanvas), 'assets/images/android-icon-monochrome.png');
