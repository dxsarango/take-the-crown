/**
 * Crown · avatar-lib.js — generador de avatares pixel 32×32.
 * Módulo ES independiente: sin DOM, sin canvas, sin dependencias. Funciona en Node (servidor, Edge) y en el navegador.
 * Determinista: el mismo nombre de usuario + la misma temporada producen siempre el mismo avatar.
 *
 *   import { avatarSVG, traitsFromUsername, renderAvatar } from './avatar-lib.js';
 *   avatarSVG('valeruiz', { season: 1, scale: 4 })           // <svg> 128×128
 *   avatarSVG('lucas.fm', { crown: false })                   // reyes pasados: sin corona
 *   renderAvatar(traitsFromUsername('kenji'), { season: 0 })  // 1024 celdas '#RRGGBB' | null, fila a fila
 *
 * Estilo 3a «Esmalte»: contorno de 1 px con el tono o (oscuro) de cada rampa; sombra s1 en los bordes abajo-derecha; base b.
 * Rampas en hex explícito (sin mezclas en tiempo de ejecución). Paleta completa: design/pixel-art/palette-core.json.
 * Rampa: { o: contorno, s2: sombra profunda, s1: sombra, b: base, h: brillo }.
 */
const W = 32, N = W * W;
// Paleta explícita: cada rampa lleva sus 5 tonos en hex (sin colores derivados).
const R = (b, s1, o, s2, h) => ({ b, s1, o, s2, h });
const mk = () => new Uint8Array(N);
const F = fn => { const m = mk(); for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (fn(x, y)) m[y * W + x] = 1; return m; };
const or = (...ms) => { const m = mk(); ms.forEach(a => a && a.forEach((v, i) => { if (v) m[i] = 1; })); return m; };
const sym = rows => rows.map(r => r + [...r].reverse().join(''));
const part = (rows, oy, ox = 0, asym = false) => { const out = {}; (asym ? rows : sym(rows)).forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = r[x]; if (c === '.') continue; const X = x + ox, Y = y + oy; if (X < 0 || Y < 0 || X >= W || Y >= W) continue; (out[c] || (out[c] = mk()))[Y * W + X] = 1; } }); return out; };
const px = list => { const m = mk(); list.forEach(([x, y]) => (m[y * W + x] = 1)); return m; };
const rep = (n, a, b) => Array.from({ length: n }, (_, i) => (i % 2 ? b : a));

const GOLD = { o: '#5A3A12', s2: '#8A5A1C', s1: '#C9962C', b: '#F2C14E', h: '#F7D57F' };
const IVORY = { o: '#4E4034', s2: '#8C7E6C', s1: '#BFB29C', b: '#F3EDE2', h: '#FFFBF2' };
const IVORY2 = { o: '#4E4034', s2: '#6E6050', s1: '#8C7E6C', b: '#BFB29C', h: '#DDD3C2' };
const STONE = { o: '#14111C', s2: '#1E1A29', s1: '#2A2438', b: '#3D3550', h: '#574C70' };
const SILVER = R('#C3C8D0', '#8E96A4', '#3E4452', '#666D7B', '#DBDAD5');
const CRIMSON = R('#9A1F35', '#6E1626', '#3A0A14', '#54101D', '#C27478');

const SKINS = [
  ['Porcelana', '#F2D3B8', '#DDA98A', '#6E3F2C', '#B57A60', '#F6DDC3'], ['Arena', '#E6B68C', '#C98F66', '#5E3420', '#A06A46', '#EEC9A4'],
  ['Miel', '#CF9563', '#AE7446', '#4E2C16', '#8A5632', '#DDB287'], ['Canela', '#A86B42', '#88522F', '#3E200E', '#6A3C20', '#C29470'],
  ['Cacao', '#80502F', '#643B20', '#2C160A', '#4C2A14', '#A68163'], ['Ébano', '#5C3822', '#462816', '#1E0E06', '#361C0E', '#8D705A']
].map(([n, b, s1, o, s2, h]) => ({ n, p: R(b, s1, o, s2, h) }));
const HAIRC = [
  ['Azabache', '#2F2B38', '#211E29', '#0E0C12', '#18151E', '#827B7A'], ['Castaño oscuro', '#4E3022', '#3A2218', '#1A0E08', '#2A1810', '#957E6C'], ['Castaño', '#7E4E2E', '#603822', '#2C180C', '#462817', '#B29074'], ['Cobrizo', '#B8582C', '#8C3E1E', '#461C0A', '#692D14', '#D49672'],
  ['Trigo', '#D9BE86', '#B39862', '#5A4424', '#876E43', '#E8D4A8'], ['Platino', '#E8E2D4', '#C0B8A6', '#5A5244', '#8D8575', '#F1E9D7'], ['Ceniza', '#A6A2AE', '#807C8A', '#3A3644', '#5D5967', '#CAC3C0'], ['Añil', '#5266C8', '#3C4C9C', '#1A2250', '#2B3776', '#979FD0']
].map(([n, b, s1, o, s2, h]) => ({ n, p: R(b, s1, o, s2, h) }));
const CAPEC = [['Carmesí', CRIMSON], ['Púrpura', R('#5E3C8E', '#452A6C', '#1E1030', '#321D4E', '#9E86AD')], ['Cobalto', R('#2F52A0', '#223C7A', '#0E1A3A', '#182B5A', '#8293B8')], ['Bosque', R('#2F6E48', '#225234', '#0C2414', '#173B24', '#82A483')], ['Azabache', R('#3E3850', '#2C283A', '#14111C', '#201D2B', '#8B8388')]].map(([n, p]) => ({ n, p }));
const BGS = [['Pizarra', '#4B5A78'], ['Musgo', '#58704F'], ['Lavanda', '#6B5B84'], ['Verdín', '#2E6A6C'], ['Arenisca', '#7C6A58']].map(([n, hex]) => ({ n, hex }));

const FULL = F(() => true);
const FACE = part(['............SSSS', '...........SSSSS', ...rep(5, '..........SSSSSS', '..........SSSSSS'), ...rep(4, '.........SSSSSSS', '.........SSSSSSS'), ...rep(3, '..........SSSSSS', '..........SSSSSS'), '...........SSSSS', '............SSSS'], 6).S;
const NECK = part(rep(3, '.............SSS', '.............SSS'), 22).S;
const NOSE = px([[16, 16], [16, 17]]);

const EX = [
  ['Seria', ['............', '..bb....bb..', '...e....e...', '...e....e...', '............', '............', '............', '....mmmm....', '............']],
  ['Sonriente', ['............', '..bb....bb..', '...e....e...', '..e.e..e.e..', '............', '............', '...m....m...', '....mmmm....', '............']],
  ['Arrogante', ['........bb..', '..bb........', '............', '..ee....ee..', '............', '............', '........m...', '.....mmm....', '............']],
  ['Sorprendida', ['..bb....bb..', '............', '..we....ew..', '..ee....ee..', '............', '............', '.....mm.....', '....m..m....', '.....mm.....']],
  ['Pícara', ['............', '..bb....bb..', '...e........', '...e....ee..', '............', '............', '........m...', '...mmmmm....', '............']],
  ['Furiosa', ['..b......b..', '...bb..bb...', '...e....e...', '...e....e...', '............', '............', '............', '....mmmm....', '...m....m...']]
].map(([n, rows]) => ({ n, m: part(rows, 12, 10, true) }));

const afroB = F((x, y) => y >= 1 && y <= 20 && ((x - 15.5) / 11.5) ** 2 + ((y - 10.5) / 10.5) ** 2 <= 1);
const HAIRS = [
  { n: 'Corto', f: part(['...........HHHHH', '..........HHHHHH', '.........HHHHHHH', '.........HHHHHHH', '.........HHHHHHH', '.........HH.....', '.........HH.....', '.........H......'], 5) },
  { n: 'Calvo', f: part(['.........HH.....', '.........HH.....', '.........H......'], 10) },
  { n: 'Largo liso', f: part(['...........HHHHH', '..........HHHHHH', '.........HHHHHHH', '........HHHHHHHH', '........HHHHHHH.', '........HHHH....', ...Array(8).fill('........HH......')], 5), b: part(['.......BBB......', ...Array(14).fill('......BBBB......'), '......BBB.......', '.......BB.......'], 8).B },
  { n: 'Afro', f: part(['.........HHHHHHH', '.........HHHtHHH', '.........HH.HH.H'], 8), b: afroB, bt: F((x, y) => afroB[y * W + x] && (x * 2 + y * 3) % 7 === 0) },
  { n: 'Trenzas', f: part(['...........HHHHH', '..........HHHHHH', '.........HHHHHHH', '.........HHHHHHH', '.........HHHHHH.', '........HHHH....', '........HHH.....', '........HH......', ...rep(14, '.......HHt......', '.......tHH......'), '........H.......'], 5) },
  { n: 'Paje', f: part(['...........HHHHH', '..........HHHHHH', '.........HHHHHHH', ...Array(4).fill('........HHHHHHHH'), ...Array(8).fill('........HHH.....'), '.........HH.....'], 5) },
  { n: 'Despeinado', f: part(['...........HHHHH', '..........HHHHHH', '......H..HHHHHHH', '.......HHHHHHHHH', '........HHHHHHHH', '.........H.HH.HH', '.........H......'], 5) },
  { n: 'Raya al lado', f: part(['.....HHHHHH.....', '....HHHHHHHH....', '...HHHHHHHHHH...', '.HHHHHHHHHHHHHH.', '.HHHHHHHHHHHHHH.', '.HHHHHHHHH...HH.', '.HHHHHH......HH.', '.HHH.........H..', '.HH.............'], 5, 8, true) },
  { n: 'Rizos cortos', f: part(['...........HHHHH', '..........HHHHHH', '........HHHHHHHH', '.......HHHtHHHtH', '.......HtHHHtHHH', '........HHH.HH.H', '........HtH.....', '.........H......'], 5) },
  { n: 'Largo ondulado', f: part(['...........HHHHH', '..........HHHHHH', '.........HHHHHHH', '........HHHHHHH.', '........HHHHHH..', '........HHHH....', '.......HHH......', '.......HH.......', '.......HH.......', '.......HH.......', '.......HHH......', '........HH......', '........HH......', '.......HHH......', '.......HH.......'], 5), b: F((x, y) => { const hx = x < 16 ? x : 31 - x; const l = 4 + ((y >> 1) & 1) + (y >= 24 ? 1 : 0); return y >= 9 && y <= 26 && hx >= l && hx <= 9; }) }
].map(h => ({ n: h.n, H: or(h.f.H, h.f.t), t: h.f.t, B: h.b, Bt: h.bt }));

const FH = [
  { n: 'Ninguno', m: null },
  { n: 'Bigote', m: part(['.............HHH', '............H...'], 18).H },
  { n: 'Perilla', m: part(['..............HH', '..............HH', '...............H'], 20).H },
  { n: 'Barba corta', m: part(['.........H......', '..........H.....', '..........HH.HHH', '..........HHH...', '...........HHHHH', '............HHHH', '.............HHH'], 16).H },
  { n: 'Barba larga', m: part(['.........H......', '..........H.....', '..........HH.HHH', '..........HHH...', '..........HHHHHH', '...........HHHHH', '...........HHHHH', '............HHHH', '............HHHH', '.............HHH', '..............HH'], 16).H }
];

const feather = part(['.s#.....', '.#s#....', '..#s#...', '..#s#...', '...#s#..', '...#s#..', '....#s..', '.....s#.'], 0, 3, true);
const ACC = [
  { n: 'Monóculo', L: () => [{ m: px([[18, 13], [19, 13], [17, 14], [20, 14], [17, 15], [20, 15], [18, 16], [19, 16], [21, 17], [21, 18], [22, 19], [22, 20]]), p: GOLD, tone: 's1', ol: 'noskin' }, { m: px([[19, 14]]), p: IVORY, tone: 'h' }] },
  { n: 'Cicatriz', L: S => [{ m: px([[11, 11], [12, 12], [12, 13], [14, 16], [14, 17], [15, 18]]), p: S, tone: 's2' }] },
  { n: 'Pendiente', L: () => [{ m: px([[22, 17], [21, 18], [23, 18], [22, 19]]), p: GOLD, tone: 'b', ol: 'noskin' }] },
  { n: 'Parche', L: () => [{ m: px([[12, 13], [13, 13], [14, 13], [12, 14], [13, 14], [14, 14], [12, 15], [13, 15], [14, 15], [13, 16]]), p: STONE, ol: true }, { m: px([[16, 12], [17, 11], [18, 11], [19, 10], [20, 10], [21, 9], [22, 9], [10, 14], [9, 14]]), p: STONE, tone: 'o' }] },
  { n: 'Gafas', L: () => [{ m: px([[12, 13], [13, 13], [11, 14], [14, 14], [11, 15], [14, 15], [12, 16], [13, 16], [19, 13], [18, 13], [20, 14], [17, 14], [20, 15], [17, 15], [19, 16], [18, 16], [15, 14], [16, 14], [10, 14], [21, 14]]), p: SILVER, tone: 's1' }, { m: px([[12, 14], [19, 14]]), p: IVORY, tone: 'h' }] },
  { n: 'Pluma', L: () => [{ m: or(feather['#'], feather.s), p: IVORY, ol: true }, { m: feather.s, p: IVORY, tone: 's2' }] }
];

const CROWNS = [
  ['Puntas', part(['...............C', '.........C.....C', '.........C..C.CC', '.........CCCCCCC', '.........KKKKKKK', '.........KKGKKKG', '.........KKKKKKK'], 0)],
  ['Diadema', part(['...............C', '..............CC', '.............CCC', '.........KPKKKKG', '.........KKKKKKK'], 2)],
  ['Almenada', part(['.........CC.CC.C', '.........CC.CC.C', '.........CCCCCCC', '.........KKKKKKK', '.........KGKKGKK', '.........KKKKKKK'], 1)]
].map(([n, c]) => ({ n, all: or(c.C, c.K, c.G, c.P), G: c.G, P: c.P }));

const hw = { 23: 6.5, 24: 8.5, 25: 10.5, 26: 12.5, 27: 13.5, 28: 14.5 };
const robe5 = F((x, y) => y >= 23 && Math.abs(x - 15.5) <= (hw[y] || 16));
const sash = F((x, y) => { const d = x - (8 + 2 * (y - 23)); return robe5[y * W + x] && d >= 0 && d <= 3; });
const CAPES = [
  { n: 'Manto', ...part(['.........EEEE...', '......EEEEEEE...', '....EEEEEkEEEEEE', '...EEkEEEEEEEkEE', '..EEEEEEEkEEEEEE', '.RRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRR'], 23) },
  { n: 'Cuello alto', ...part(['......EE........', '.....EEEE.......', '.....EEkE.......', '.....EEEEE......', '....EEEEEE......', '....EEEkEEE.....', '...RRRRRRRRR....', '..RRRRRRRRRRTTTT', '.RRRRRRRRRRRRTTT', 'RRRRRRRRRRRRRTTT', ...Array(4).fill('RRRRRRRRRRRRRRTT')], 18) },
  { n: 'Estola en V', ...part(['.........REETTTT', '.......RRREETTTT', '.....RRRRRREETTT', '...RRRRRRRRREkTT', '..RRRRRRRRRRREET', '.RRRRRRRRRRRRREE', 'RRRRRRRRRRRRRRRE', 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRR'], 23) },
  { n: 'Broche', ...part(['.........RRR....', '.......RRRREE...', '.....RRRRRREEkEE', '...RRRRRRRRRRRRJ', '..RRRRRRRRRRRRRJ', '.RRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRRRRRR'], 23) },
  { n: 'Banda', R: robe5, E: sash, k: F((x, y) => sash[y * W + x] && (x + y) % 5 === 0) }
].map(c => ({ n: c.n, R: c.R, T: c.T, E: or(c.E, c.k), k: c.k, J: c.J }));


// ---------- Temporadas (solo lo que afecta al avatar) ----------
const GOLD_CORE = { o: '#5A3A12', s1: '#C9962C', b: '#F2C14E', h: '#F7D57F' };
const IVORY_CORE = { o: '#4E4034', s1: '#BFB29C', b: '#F3EDE2' };
const T1 = {
  marigold: { o: '#6A2A08', s1: '#D9661A', b: '#F28C28', h: '#FFC24A' },
  pink: { o: '#4A0E36', s1: '#B01E78', b: '#E0409A', h: '#F27AB8' },
  turquoise: { o: '#0E3A40', s1: '#1E7A80', b: '#3AB4B0' },
  lime: { o: '#1E4014', s1: '#3E8A2A', b: '#6CC04A' },
  violet: { o: '#2A1650', s1: '#5A36A0', b: '#8A62D8' }
};
const capeRamp = P => ({ b: P.b, s1: P.s1, o: P.o, s2: P.o, h: P.b });
// Corona Calavera (T1): media fila de 7 px reflejada (14 px), 8 filas, en x=9 y=0.
// C oro · B banda · o bola de cempasúchil · k calavera · e/n cuencas · t dientes · m gema rosa · g gema cempasúchil
const CROWN_T1 = ['.o.....', '.C...kk', '.CC.kkk', '.CCCkek', 'CCCCkkn', 'BBBBBkt', 'BmBBgBB', 'BBBBBBB'];
const glyphMasks = (rows, ox, oy) => { const out = {}; rows.forEach((r, y) => { const s = r + [...r].reverse().join(''); [...s].forEach((ch, x) => { if (ch === '.') return; const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= W || Y >= W) return; (out[ch] || (out[ch] = new Uint8Array(N)))[Y * W + X] = 1; }); }); return out; };
const union = (g, chars) => { const m = new Uint8Array(N); [...chars].forEach(c => g[c] && g[c].forEach((v, i) => { if (v) m[i] = 1; })); return m; };
const crownT1 = () => { const g = glyphMasks(CROWN_T1, 9, 0); return [
  { m: union(g, 'oCBmg'), p: GOLD_CORE, ol: true }, { m: union(g, 'kent'), p: IVORY_CORE, ol: true },
  { m: union(g, 'en'), p: IVORY_CORE, tone: 'o' }, { m: union(g, 't'), p: IVORY_CORE, tone: 's1' },
  { m: union(g, 'og'), p: T1.marigold, tone: 'b' }, { m: union(g, 'm'), p: T1.pink, tone: 'b' }]; };

/** Qué cambia cada temporada en el avatar: fondos (5), colores de capa (5) y, opcionalmente, la corona. El resto es núcleo fijo. */
export const SEASON_AVATAR = {
  0: { key: 'genesis', backgrounds: BGS, capeColors: CAPEC, crownLayers: null },
  1: { key: 'muertos', crownLayers: crownT1,
    backgrounds: [['Noche', 'Night', '#4A3466'], ['Jade', 'Jade', '#2E6A5A'], ['Ciruela', 'Plum', '#6A3656'], ['Añil', 'Indigo', '#3A4A7A'], ['Terracota', 'Terracotta', '#7A4A38']].map(([n, en, hex]) => ({ n, en, hex })),
    capeColors: [['Rosa mexicano', 'Mexican pink', T1.pink], ['Turquesa', 'Turquoise', T1.turquoise], ['Lima', 'Lime', T1.lime], ['Violeta', 'Violet', T1.violet], ['Cempasúchil', 'Marigold', T1.marigold]].map(([n, en, P]) => ({ n, en, p: capeRamp(P) })) },
  // T2 · Escarcha: provisional. Hasta que exista su arte, el avatar usa el de la T0.
  2: { key: 'escarcha', provisional: true, backgrounds: BGS, capeColors: CAPEC, crownLayers: null }
};

// Nombres en inglés (los de la librería están en español).
const EN = {
  skins: ['Porcelain', 'Sand', 'Honey', 'Cinnamon', 'Cocoa', 'Ebony'],
  hairStyles: ['Short', 'Bald', 'Long straight', 'Afro', 'Braids', 'Pageboy', 'Messy', 'Side part', 'Short curls', 'Long wavy'],
  hairColors: ['Jet', 'Dark brown', 'Brown', 'Copper', 'Wheat', 'Platinum', 'Ash', 'Indigo'],
  facialHair: ['None', 'Mustache', 'Goatee', 'Short beard', 'Long beard'],
  expressions: ['Serious', 'Smiling', 'Smug', 'Surprised', 'Cheeky', 'Furious'],
  crowns: ['Spikes', 'Diadem', 'Crenellated'],
  capes: ['Mantle', 'High collar', 'V stole', 'Brooch', 'Sash'],
  capeColors: ['Crimson', 'Purple', 'Cobalt', 'Forest', 'Jet'],
  accessories: ['Monocle', 'Scar', 'Earring', 'Eyepatch', 'Glasses', 'Feather'],
  backgrounds: ['Slate', 'Moss', 'Lavender', 'Verdigris', 'Sandstone']
};
export const PARTS = { skins: SKINS, hairStyles: HAIRS, hairColors: HAIRC, facialHair: FH, expressions: EX, crowns: CROWNS, capes: CAPES, capeColors: CAPEC, accessories: ACC, backgrounds: BGS };
Object.entries(PARTS).forEach(([k, list]) => list.forEach((p, i) => { p.en = EN[k][i]; }));

/** Orden de capas, de atrás hacia delante. */
export const LAYER_ORDER = ['background', 'hairBack', 'cape', 'skin', 'expression', 'facialHair', 'hairFront', 'accessory', 'crown'];

// ---------- Render ----------
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function paint(layers) {
  const col = new Array(N).fill(null), own = new Array(N).fill(-1);
  layers.forEach((L, li) => {
    const m = L.m; if (!m) return;
    if (L.bg) { for (let i = 0; i < N; i++) if (m[i]) { col[i] = L.hex; own[i] = li; } return; }
    const P = L.p, inM = (x, y) => x >= 0 && y >= 0 && x < W && y < W && m[y * W + x] === 1;
    if (L.ol) {
      const out = [];
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (m[i] || !N4.some(([dx, dy]) => inM(x + dx, y + dy))) continue;
        const u = own[i];
        if (L.ol === 'noskin' && u >= 0 && layers[u].skin) continue; // vello y accesorios no contornean sobre la piel
        out.push(i);
      }
      out.forEach(i => { col[i] = P.o; own[i] = li; });
    }
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!m[i]) continue;
      let c;
      if (L.tone) c = P[L.tone];
      else if (L.fh) c = inM(x, y + 1) ? P.b : P.s1;
      else { const tl = !inM(x - 1, y) || !inM(x, y - 1), br = !inM(x + 1, y) || !inM(x, y + 1); c = br && !tl ? P.s1 : P.b; }
      col[i] = c; own[i] = li;
    }
  });
  return col;
}

/**
 * Rasgos a partir del nombre de usuario (FNV-1a de 32 bits + xorshift32). No cambiar: los avatares ya mostrados dependen de ello.
 * cr: 0–2 = corona base; -1 = sin corona (reyes pasados). acc: -1 = sin accesorio.
 */
export function traitsFromUsername(username) {
  let h = 2166136261; for (const ch of String(username).trim().toLowerCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let s = h || 1; const r = n => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s % n; };
  return { skin: r(6), hair: r(10), hc: r(8), fh: r(10) < 6 ? 0 : 1 + r(4), ex: r(6), cr: r(3), cape: r(5), cc: r(5), acc: r(10) < 4 ? -1 : r(6), bg: r(5) };
}

function layersFor(c, season) {
  const SA = SEASON_AVATAR[season] || SEASON_AVATAR[0];
  const S = SKINS[c.skin].p, H = HAIRC[c.hc].p, hs = HAIRS[c.hair], cp = CAPES[c.cape], CC = SA.capeColors[c.cc].p, cr = CROWNS[c.cr], ex = EX[c.ex].m;
  const L = [], add = (layer, o) => { if (o.m) L.push({ layer, ...o }); };
  L.push({ layer: 'background', bg: true, m: FULL, hex: SA.backgrounds[c.bg].hex });
  add('hairBack', { m: hs.B, p: H, ol: true }); add('hairBack', { m: hs.Bt, p: H, tone: 's1' });
  add('cape', { m: cp.R, p: CC, ol: true }); add('cape', { m: cp.T, p: IVORY2, ol: true }); add('cape', { m: cp.E, p: IVORY, ol: true }); add('cape', { m: cp.k, p: IVORY, tone: 'o' }); add('cape', { m: cp.J, p: GOLD, ol: true });
  add('skin', { m: NECK, p: S, tone: 's1', ol: true, skin: true }); add('skin', { m: FACE, p: S, ol: true, skin: true }); add('skin', { m: NOSE, p: S, tone: 's1', skin: true });
  add('expression', { m: ex.b, p: H, tone: 'o', skin: true }); add('expression', { m: or(ex.e, ex.m), p: S, tone: 'o', skin: true }); add('expression', { m: ex.w, p: IVORY, tone: 'b', skin: true });
  if (FH[c.fh].m) add('facialHair', { m: FH[c.fh].m, p: H, ol: 'noskin', fh: true });
  add('hairFront', { m: hs.H, p: H, ol: true }); add('hairFront', { m: hs.t, p: H, tone: 's1' });
  if (c.acc >= 0) ACC[c.acc].L(S).forEach(o => add('accessory', o));
  if (cr && SA.crownLayers) SA.crownLayers().forEach(o => add('crown', o));
  else if (cr) { add('crown', { m: cr.all, p: GOLD, ol: true }); add('crown', { m: cr.G, p: CRIMSON, tone: 'b' }); add('crown', { m: cr.P, p: IVORY, tone: 'b' }); }
  return L;
}

/**
 * Pinta el avatar. Devuelve 1024 celdas ('#RRGGBB' o null), fila a fila.
 * opts.season (0|1|2), opts.crown (false fuerza sin corona), opts.layer (una sola capa, sin fondo; para el editor por capas).
 */
export function renderAvatar(traits, opts = {}) {
  const c = { ...traits }; if (opts.crown === false) c.cr = -1;
  let L = layersFor(c, opts.season ?? 0);
  if (opts.layer) L = L.filter(l => l.layer === opts.layer);
  return paint(L);
}

/** Cuadrícula → SVG nítido (un <path> por color, tramos horizontales). scale: entero ≥ 1. */
export function toSVG(col, w, h, { scale = 1, title } = {}) {
  const by = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
    const c = col[y * w + x]; if (!c) { x++; continue; }
    let e = x + 1; while (e < w && col[y * w + e] === c) e++;
    (by.get(c) || by.set(c, []).get(c)).push('M' + x + ' ' + y + 'h' + (e - x) + 'v1h-' + (e - x) + 'z'); x = e;
  }
  const paths = [...by].map(([c, d]) => '<path fill="' + c + '" d="' + d.join('') + '"/>').join('');
  const t = title ? '<title>' + String(title).replace(/[<&]/g, s => (s === '<' ? '&lt;' : '&amp;')) + '</title>' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * scale + '" height="' + h * scale + '" viewBox="0 0 ' + w + ' ' + h + '" shape-rendering="crispEdges">' + t + paths + '</svg>';
}

/** Avatar como SVG. input: nombre de usuario (string) o rasgos. */
export function avatarSVG(input, opts = {}) {
  const traits = typeof input === 'string' ? traitsFromUsername(input) : input;
  return toSVG(renderAvatar(traits, opts), W, W, { scale: opts.scale || 1, title: typeof input === 'string' ? input : undefined });
}

/** Capas sueltas (editor de avatar). Superponerlas reproduce el avatar salvo los contornos 'noskin' del vello y los accesorios, que dependen de la capa de debajo: para el resultado final usa siempre avatarSVG. */
export function avatarLayersSVG(traits, opts = {}) {
  return LAYER_ORDER.map(layer => ({ layer, svg: toSVG(renderAvatar(traits, { ...opts, layer }), W, W, { scale: opts.scale || 1 }) }));
}

/** Etiquetas legibles de los rasgos (lang 'en' | 'es'). */
export function describe(traits, lang = 'en', season = 0) {
  const SA = SEASON_AVATAR[season] || SEASON_AVATAR[0], k = lang === 'en' ? 'en' : 'n';
  return { skin: SKINS[traits.skin][k], hair: HAIRS[traits.hair][k], hairColor: HAIRC[traits.hc][k], facialHair: FH[traits.fh][k], expression: EX[traits.ex][k],
    crown: traits.cr < 0 ? null : CROWNS[traits.cr][k], cape: CAPES[traits.cape][k], capeColor: SA.capeColors[traits.cc][k], accessory: traits.acc < 0 ? null : ACC[traits.acc][k], background: SA.backgrounds[traits.bg][k] };
}

export const SIZE = W;
