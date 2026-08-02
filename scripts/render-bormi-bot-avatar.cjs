const path = require('node:path');
const sharp = require('sharp');

const output = path.resolve(
  __dirname,
  '../apps/market-mini-app/public/assets/brand/bormi-bot-avatar.jpg',
);

const avatar = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" fill="#F8F4F7"/>
    <g transform="translate(192 192) scale(13.3333333333)">
      <rect width="48" height="48" rx="15" fill="#5B3CF2"/>
      <path
        d="M16 12v23.5M16 25.5c0-6.1 3.9-10 9.4-10 5.1 0 8.6 3.8 8.6 9.3 0 6.1-3.8 10.2-9.4 10.2-5 0-8.6-3.7-8.6-9.5Z"
        fill="none"
        stroke="#FFFFFF"
        stroke-width="4.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="36.5" cy="10.5" r="4.5" fill="#D8FF57"/>
    </g>
  </svg>
`);

sharp(avatar)
  .jpeg({ quality: 94, mozjpeg: true, chromaSubsampling: '4:4:4' })
  .toFile(output)
  .then(({ width, height, size }) => {
    process.stdout.write(`${output}\n${width}x${height} ${size} bytes\n`);
  })
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
