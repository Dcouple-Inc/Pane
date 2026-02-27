/**
 * Generate Electron app icons from SVG source
 *
 * Converts foozol-logo.svg to:
 * - icon.png (1024x1024 for Linux)
 * - icon.ico (Windows - multiple sizes)
 * - icon.icns (macOS - multiple sizes)
 *
 * Usage: node tools/generate-icons.js
 *
 * Requirements: pnpm add -D sharp png-to-ico
 */

const fs = require('fs');
const path = require('path');

async function generateIcons() {
  // Dynamically import sharp (ESM module)
  const sharp = (await import('sharp')).default;

  // Accept a source image path as argument, or fall back to defaults
  const argSource = process.argv[2];
  const defaultPng = path.join(__dirname, '../frontend/src/assets/pane-logo.png');
  const defaultSvg = path.join(__dirname, '../frontend/src/assets/foozol-logo.svg');
  const sourcePath = argSource
    ? path.resolve(argSource)
    : fs.existsSync(defaultPng) ? defaultPng : defaultSvg;

  const outputDir = path.join(__dirname, '../main/assets');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const svgBuffer = fs.readFileSync(sourcePath);

  console.log('Generating icons from:', sourcePath);
  console.log('Output directory:', outputDir);

  // Icon sizes needed for different platforms
  const sizes = {
    ico: [16, 24, 32, 48, 64, 128, 256], // Windows
    icns: [16, 32, 64, 128, 256, 512, 1024], // macOS
    png: [1024] // Linux (main icon)
  };

  // Generate main PNG (1024x1024 for Linux)
  console.log('\n📦 Generating PNG for Linux...');
  await sharp(svgBuffer)
    .resize(1024, 1024)
    .png()
    .toFile(path.join(outputDir, 'icon.png'));
  console.log('✅ icon.png (1024x1024)');

  // Generate ICO for Windows
  console.log('\n📦 Generating ICO for Windows...');
  try {
    const pngToIco = (await import('png-to-ico')).default;

    // Generate PNG buffers for each size
    const pngBuffers = await Promise.all(
      sizes.ico.map(async (size) => {
        return sharp(svgBuffer)
          .resize(size, size)
          .png()
          .toBuffer();
      })
    );

    // Convert to ICO
    const icoBuffer = await pngToIco(pngBuffers);
    fs.writeFileSync(path.join(outputDir, 'icon.ico'), icoBuffer);
    console.log('✅ icon.ico (sizes:', sizes.ico.join(', '), ')');
  } catch (error) {
    console.log('⚠️  png-to-ico not installed. Installing...');
    console.log('   Run: pnpm add -D png-to-ico');
    console.log('   Then run this script again.');

    // Fallback: generate a single 256x256 PNG that can be manually converted
    await sharp(svgBuffer)
      .resize(256, 256)
      .png()
      .toFile(path.join(outputDir, 'icon-256.png'));
    console.log('✅ Generated icon-256.png as fallback (convert manually to .ico)');
  }

  // Generate ICNS for macOS using png2icons (cross-platform)
  console.log('\n📦 Generating ICNS for macOS...');
  try {
    const png2icons = require('png2icons');

    // Generate 1024x1024 PNG buffer for ICNS conversion
    const png1024 = await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toBuffer();

    // Create ICNS using png2icons
    const icnsBuffer = png2icons.createICNS(png1024, png2icons.BICUBIC2, 0);
    if (icnsBuffer) {
      fs.writeFileSync(path.join(outputDir, 'icon.icns'), icnsBuffer);
      console.log('✅ icon.icns (all sizes embedded)');
    } else {
      throw new Error('Failed to create ICNS buffer');
    }

    // Clean up any leftover iconset directory
    const iconsetDir = path.join(outputDir, 'icon.iconset');
    if (fs.existsSync(iconsetDir)) {
      fs.rmSync(iconsetDir, { recursive: true });
    }
  } catch (error) {
    console.error('❌ Error generating ICNS:', error.message);
    console.log('   You may need to generate ICNS manually on macOS');
  }

  // Also generate favicon sizes for web
  console.log('\n📦 Generating web favicons...');
  const faviconDir = path.join(__dirname, '../frontend/public');

  await sharp(svgBuffer)
    .resize(96, 96)
    .png()
    .toFile(path.join(faviconDir, 'favicon-96x96.png'));
  console.log('✅ favicon-96x96.png');

  await sharp(svgBuffer)
    .resize(180, 180)
    .png()
    .toFile(path.join(faviconDir, 'apple-touch-icon.png'));
  console.log('✅ apple-touch-icon.png (180x180)');

  // Generate favicon.ico
  try {
    const pngToIco = (await import('png-to-ico')).default;
    const faviconSizes = [16, 32, 48];
    const faviconBuffers = await Promise.all(
      faviconSizes.map(async (size) => {
        return sharp(svgBuffer)
          .resize(size, size)
          .png()
          .toBuffer();
      })
    );
    const faviconIco = await pngToIco(faviconBuffers);
    fs.writeFileSync(path.join(faviconDir, 'favicon.ico'), faviconIco);
    console.log('✅ favicon.ico (16, 32, 48)');
  } catch (error) {
    console.log('⚠️  Skipped favicon.ico (png-to-ico not available)');
  }

  console.log('\n✨ Icon generation complete!');
  console.log('\nGenerated files:');
  console.log('  - main/assets/icon.png (Linux)');
  console.log('  - main/assets/icon.ico (Windows)');
  console.log('  - main/assets/icon.icns (macOS) - may need manual step on non-macOS');
  console.log('  - frontend/public/favicon-96x96.png');
  console.log('  - frontend/public/apple-touch-icon.png');
  console.log('  - frontend/public/favicon.ico');
}

generateIcons().catch(console.error);
