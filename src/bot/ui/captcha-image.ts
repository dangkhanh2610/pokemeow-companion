import { AttachmentBuilder } from 'discord.js';
import sharp from 'sharp';

export const CAPTCHA_IMAGE_FILENAME = 'captcha.png';

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 140;

/**
 * Vector SVG paths on a 0..36 x 0..54 coordinate grid for digits 0-9.
 * Using explicit paths avoids OS/container font dependencies completely.
 */
const DIGIT_PATHS: Readonly<Record<string, string>> = {
  '0': 'M18 4 C29 4 32 14 32 27 C32 40 29 50 18 50 C7 50 4 40 4 27 C4 14 7 4 18 4 Z M11 40 L25 14',
  '1': 'M10 14 L19 5 L19 49 M10 49 L28 49',
  '2': 'M7 14 C7 6 13 4 19 4 C26 4 31 8 31 15 C31 24 19 31 7 49 L32 49',
  '3': 'M7 11 C10 5 15 4 20 4 C27 4 31 8 31 14 C31 20 26 24 18 25 C27 26 32 31 32 38 C32 45 26 50 18 50 C12 50 8 48 6 43',
  '4': 'M25 49 L25 5 L6 35 L33 35',
  '5': 'M30 5 L10 5 L8 23 C12 20 16 19 20 19 C28 19 32 25 32 34 C32 44 26 50 17 50 C11 50 7 47 5 43',
  '6': 'M28 8 C24 4 18 4 14 7 C7 12 5 22 5 33 C5 44 10 50 19 50 C27 50 32 44 32 36 C32 28 27 23 19 23 C12 23 7 27 6 33',
  '7': 'M6 5 L32 5 L15 49 M14 27 L27 27',
  '8': 'M18 24 C10 24 6 19 6 13 C6 7 11 4 18 4 C25 4 30 7 30 13 C30 19 26 24 18 24 Z M18 24 C9 24 5 30 5 38 C5 45 10 50 18 50 C26 50 31 45 31 38 C31 30 27 24 18 24 Z',
  '9': 'M30 22 C28 27 24 30 17 30 C10 30 5 25 5 17 C5 9 10 4 18 4 C27 4 32 11 32 24 C32 38 28 50 17 50 C12 50 8 48 6 44',
};

const DIGIT_COLORS: readonly string[] = [
  '#38bdf8',
  '#facc15',
  '#4ade80',
  '#fb7185',
  '#c084fc',
  '#f97316',
];

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function buildCaptchaSvg(code: string): string {
  const noiseLines: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const x1 = randomInt(8, 90);
    const y1 = randomInt(10, CANVAS_HEIGHT - 10);
    const cx = randomInt(130, 290);
    const cy = randomInt(10, CANVAS_HEIGHT - 10);
    const x2 = randomInt(330, CANVAS_WIDTH - 8);
    const y2 = randomInt(10, CANVAS_HEIGHT - 10);
    const stroke = DIGIT_COLORS[i % DIGIT_COLORS.length]!;
    noiseLines.push(
      `<path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="2" stroke-opacity="0.28"/>`,
    );
  }

  const noiseDots: string[] = [];
  for (let i = 0; i < 24; i += 1) {
    const cx = randomInt(12, CANVAS_WIDTH - 12);
    const cy = randomInt(12, CANVAS_HEIGHT - 12);
    const r = (1.2 + Math.random() * 1.8).toFixed(1);
    noiseDots.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#e2e8f0" fill-opacity="0.22"/>`,
    );
  }

  const chars = code.split('');
  const totalSpan = chars.length * 70;
  const startX = Math.round((CANVAS_WIDTH - totalSpan) / 2) + 17;

  const digitGroups = chars.map((ch, idx) => {
    const pathData = DIGIT_PATHS[ch] ?? DIGIT_PATHS['0']!;
    const color = DIGIT_COLORS[(idx + randomInt(0, 2)) % DIGIT_COLORS.length]!;
    const tx = startX + idx * 70 + randomInt(-3, 3);
    const ty = 43 + randomInt(-6, 6);
    const rot = randomInt(-10, 10);
    return `<g transform="translate(${tx}, ${ty}) rotate(${rot}, 18, 27)">
      <path d="${pathData}" fill="none" stroke="#020617" stroke-width="11" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="0.72"/>
      <path d="${pathData}" fill="none" stroke="${color}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="55%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#172554"/>
    </linearGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#94a3b8" stroke-width="0.7" stroke-opacity="0.1"/>
    </pattern>
  </defs>
  <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" rx="16" fill="url(#bg)"/>
  <rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" rx="16" fill="url(#grid)"/>
  <rect x="2" y="2" width="${CANVAS_WIDTH - 4}" height="${CANVAS_HEIGHT - 4}" rx="14" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.35"/>
  ${noiseDots.join('\n  ')}
  ${noiseLines.join('\n  ')}
  ${digitGroups.join('\n  ')}
</svg>`;
}

/**
 * Render ảnh PNG chứa mã Captcha số (không phụ thuộc font hệ thống).
 */
export async function renderCaptchaImage(code: string): Promise<AttachmentBuilder> {
  const sanitized = code.replace(/[^0-9]/g, '').slice(0, 8) || '00000';
  const svg = buildCaptchaSvg(sanitized);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return new AttachmentBuilder(pngBuffer, { name: CAPTCHA_IMAGE_FILENAME });
}
