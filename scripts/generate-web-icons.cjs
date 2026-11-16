// Reuse the native app asset; Expo's existing image pipeline generates install sizes.
const fs = require('node:fs/promises');
const path = require('node:path');
const { generateImageAsync } = require('@expo/image-utils');
async function main() {
  const projectRoot = path.resolve(__dirname, '../apps/mobile');
  const output = path.join(projectRoot, 'public/icons');
  await fs.mkdir(output, { recursive: true });
  for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
    const { source } = await generateImageAsync({ projectRoot }, {
      src: path.join(projectRoot, 'assets/icon.png'), width: size, height: size,
      resizeMode: 'contain', removeTransparency: true, backgroundColor: '#101C18',
    });
    await fs.writeFile(path.join(output, name), source);
  }
}
main().catch(() => { console.error('Web icon generation failed'); process.exitCode = 1; });
