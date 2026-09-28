/** Crown · pastilla de código de país 12×8 (países sin bandera pixel propia). Sin dependencias.
 *  import { countryPillSVG } from './country-pill.js'; countryPillSVG('PT', 2) */
import font from '../pixel-art/country-pill-font.json' with { type: 'json' };
import { toSVG } from './avatar-lib.js';

export function countryPill(code) {
  const W = 12, col = new Array(W * 8).fill(font.background);
  [...String(code).toUpperCase().slice(0, 2)].forEach((ch, k) => (font.glyphs[ch] || font.glyphs.A).forEach((r, y) =>
    [...r].forEach((c, x) => { if (c === '#') col[(y + 1) * W + font.origin.x[k] + x] = font.ink; })));
  return col;
}
export const countryPillSVG = (code, scale = 1) => toSVG(countryPill(code), 12, 8, { scale, title: code });

/** Las 20 banderas propias; el resto usa la pastilla. */
export const FLAGS = ['US', 'MX', 'ES', 'AR', 'CO', 'EC', 'CL', 'PE', 'BR', 'CA', 'GB', 'DE', 'FR', 'IT', 'IN', 'JP', 'KR', 'CN', 'AU', 'NL'];
export const flagOrPill = code => (FLAGS.includes(code) ? { type: 'flag', src: `/design/assets/flags/${code}.svg` } : { type: 'pill', svg: countryPillSVG(code) });
