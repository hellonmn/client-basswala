/**
 * scripts/build-icons.js
 *
 * Generates Play Store-ready icons from the BW logo PNG.
 * Run with:  node scripts/build-icons.js
 *
 * Outputs:
 *   assets/images/icon.png                       — 1024x1024, black bg, centered logo (iOS + fallback Android)
 *   assets/images/android-icon-foreground.png    — 1024x1024, transparent, generously padded for adaptive crop
 *   assets/images/android-icon-monochrome.png    — 1024x1024, white silhouette on transparent
 *   assets/images/splash-icon.png                — 1024x1024, transparent logo for splash screen
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'images', 'splash-icon.png');
const OUT_DIR = path.join(__dirname, '..', 'assets', 'images');

// Black background for the launcher icon
const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };

// Square canvas size — Play Store + iOS App Store want 1024px
const SIZE = 1024;

// How much of the canvas the logo occupies (fraction of square edge).
// Adaptive icons are cropped to ~66% safe zone on circular launchers,
// so foreground should leave a wide transparent border.
const FOREGROUND_LOGO_FRAC = 0.55;   // ~563px logo on 1024 canvas — fits safely inside any crop
const FULLBLEED_LOGO_FRAC  = 0.50;   // smaller for the icon.png since it has black bg + extra padding feels balanced
const SPLASH_LOGO_FRAC     = 0.70;   // splash gets a bigger logo since it's not cropped

async function makeSquareLogo(targetWidthPx, opaqueBg = null) {
  // 1. Resize the source while preserving aspect ratio
  const resized = await sharp(SRC)
    .resize({ width: targetWidthPx, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // 2. Build the canvas
  const canvasInput = opaqueBg
    ? sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: opaqueBg } })
    : sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

  // 3. Composite the logo dead-centre
  return canvasInput
    .composite([{ input: resized, gravity: 'center' }])
    .png()
    .toBuffer();
}

async function makeMonochrome(targetWidthPx) {
  // Recolor every visible pixel to white (#ffffff) for monochrome themed icon.
  // We threshold the alpha and keep its alpha channel as the silhouette.
  const resized = await sharp(SRC)
    .resize({ width: targetWidthPx, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .toBuffer();

  // Replace RGB with white while keeping alpha
  const meta = await sharp(resized).metadata();
  const white = await sharp({
    create: { width: meta.width, height: meta.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
  })
    .composite([{ input: resized, blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: white, gravity: 'center' }])
    .png()
    .toBuffer();
}

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('Source missing:', SRC);
    process.exit(1);
  }

  console.log('Generating icons from:', SRC);

  // 1. icon.png — opaque black background, padded logo
  const iconBuf = await makeSquareLogo(Math.round(SIZE * FULLBLEED_LOGO_FRAC), BLACK);
  fs.writeFileSync(path.join(OUT_DIR, 'icon.png'), iconBuf);
  console.log('✓ icon.png (1024x1024, black bg)');

  // 2. android-icon-foreground.png — transparent, generously padded
  const fgBuf = await makeSquareLogo(Math.round(SIZE * FOREGROUND_LOGO_FRAC), null);
  fs.writeFileSync(path.join(OUT_DIR, 'android-icon-foreground.png'), fgBuf);
  console.log('✓ android-icon-foreground.png (1024x1024, transparent)');

  // 3. android-icon-monochrome.png — white silhouette on transparent
  const monoBuf = await makeMonochrome(Math.round(SIZE * FOREGROUND_LOGO_FRAC));
  fs.writeFileSync(path.join(OUT_DIR, 'android-icon-monochrome.png'), monoBuf);
  console.log('✓ android-icon-monochrome.png (1024x1024, white silhouette)');

  // 4. splash-icon.png — transparent, bigger logo for splash screen
  const splashBuf = await makeSquareLogo(Math.round(SIZE * SPLASH_LOGO_FRAC), null);
  fs.writeFileSync(path.join(OUT_DIR, 'splash-icon.png'), splashBuf);
  console.log('✓ splash-icon.png (1024x1024, transparent)');

  console.log('\nAll icons generated. Now run:');
  console.log('  npx expo prebuild --clean   # regenerates android/ resources');
  console.log('  eas build --profile production --platform android');
})();
