const sharp = require('sharp');

const source = process.argv[2];
const output = process.argv[3];

if (!source || !output) {
  throw new Error('usage: node scripts/render-bormi-welcome.cjs <source> <output>');
}

const mark = Buffer.from(`
  <svg width="112" height="112" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <rect width="48" height="48" rx="15" fill="#5B3CF2"/>
    <path d="M16 12v23.5M16 25.5c0-6.1 3.9-10 9.4-10 5.1 0 8.6 3.8 8.6 9.3 0 6.1-3.8 10.2-9.4 10.2-5 0-8.6-3.7-8.6-9.5Z" fill="none" stroke="#FFF" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="36.5" cy="10.5" r="4.5" fill="#D8FF57"/>
  </svg>
`);

const wordmark = Buffer.from(`
  <svg width="610" height="250" xmlns="http://www.w3.org/2000/svg">
    <style>
      .brand{font:800 104px 'Segoe UI',Arial,sans-serif;letter-spacing:-5px;fill:#17151F}
      .promise{font:700 46px 'Segoe UI',Arial,sans-serif;letter-spacing:-1.5px;fill:#5B3CF2}
      .hint{font:600 25px 'Segoe UI',Arial,sans-serif;letter-spacing:.5px;fill:#666171}
    </style>
    <text x="0" y="94" class="brand">Bormi</text>
    <text x="2" y="164" class="promise">Bormi? — Bor.</text>
    <text x="4" y="218" class="hint">Нужное — рядом</text>
  </svg>
`);

async function main() {
  await sharp(source)
    .resize(1536, 1024, { fit: 'cover' })
    .composite([
      { input: mark, left: 110, top: 180 },
      { input: wordmark, left: 110, top: 315 },
    ])
    .webp({ quality: 88, effort: 6 })
    .toFile(output);

  const metadata = await sharp(output).metadata();
  process.stdout.write(JSON.stringify({
    output,
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
  }));
}

void main();
