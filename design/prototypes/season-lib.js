/* Crown · temporadas. Cada temporada es un objeto con tokens y capas; la interfaz no cambia.
   Activa: ?season=N en la URL, o window.CROWN_SEASON. Por defecto, 0. */
(function () {
  const rgb = c => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const enc = (W, H, col) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
    col.forEach((c, i) => { if (!c) return; const [r, g, b] = rgb(c); img.data.set([r, g, b, 255], i * 4); });
    cx.putImageData(img, 0, 0); return cv.toDataURL('image/png');
  };
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // Pinta capas sobre un array de colores: contorno de 1 px (o), sombra abajo-derecha (s1), base (b).
  const paint = (col, W, H, layers) => layers.forEach(L => {
    const m = L.m, P = L.p, inM = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
    if (L.ol) { const o = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!m[y * W + x] && N4.some(([a, b]) => inM(x + a, y + b))) o.push(y * W + x); o.forEach(i => (col[i] = P.o)); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m[y * W + x]) continue;
      if (L.tone) { col[y * W + x] = P[L.tone]; continue; }
      const tl = !inM(x - 1, y) || !inM(x, y - 1), br = !inM(x + 1, y) || !inM(x, y + 1);
      col[y * W + x] = br && !tl ? P.s1 : P.b;
    }
  });
  const maskOf = (W, H, rows, ox, oy, sym) => {
    const out = {};
    rows.forEach((r, y) => { const s = sym ? r + [...r].reverse().join('') : r; [...s].forEach((ch, x) => { if (ch === '.') return; const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= W || Y >= H) return; (out[ch] || (out[ch] = new Uint8Array(W * H)))[Y * W + X] = 1; }); });
    return out;
  };
  const U = (W, H, g, chars) => { const m = new Uint8Array(W * H); [...chars].forEach(c => g[c] && g[c].forEach((v, i) => { if (v) m[i] = 1; })); return m; };

  /* ---------- Núcleo fijo (no cambia con la temporada) ---------- */
  const CORE = {
    gold: { o: '#5A3A12', s1: '#C9962C', b: '#F2C14E', h: '#F7D57F' },
    ivory: { o: '#4E4034', s1: '#BFB29C', b: '#F3EDE2' },
    crimson: { o: '#3A0A14', s1: '#6E1626', b: '#9A1F35' },
    lock: { o: '#24212C', s1: '#3E3A48', b: '#57525F', h: '#57525F' },
    lockIn: { o: '#14111C', s1: '#2A2438', b: '#2A2438' },
    lockIcon: { o: '#24212C', s1: '#45404F', b: '#45404F' },
    stone: '#3D3550',
    bronze: { o: '#3A2214', s1: '#8A5A34', b: '#B98050', h: '#D8A070' } // 3.er puesto del podio (Reino)
  };

  /* ================= TEMPORADA 0 · GÉNESIS ================= */
  const T0 = {
    id: 0, key: 'genesis', color: '#4FA39B',
    name: { en: 'Season 0: Genesis', es: 'Temporada 0: Génesis' },
    dates: { en: 'Sep 15 – Oct 31, 2026', es: '15 sep – 31 oct 2026' }, starts: { en: 'Sep 15', es: '15 sep' }, ends: { en: 'Oct 31', es: '31 oct' },
    ui: {
      en: { season: 'Season 0: Genesis', seasonLong: 'Season 0: Genesis · 34 days left', seasonShort: 'Season 0 · 34 days left', firstKing: 'Be the first king of Season 0.' },
      es: { season: 'Temporada 0: Génesis', seasonLong: 'Temporada 0: Génesis · quedan 34 días', seasonShort: 'T0 · quedan 34 días', firstKing: 'Sé el primer rey de la Temporada 0.' }
    },
    banner: { o: '#3A0A14', s1: '#6E1626', b: '#9A1F35', h: '#B3263B' },
    ped: { o: '#1F1C27', s1: '#2C2936', b: '#3A3645', h: '#4E4A5A', hh: '#5E5A6C' },
    next: { id: 1, en: 'Season 1: Day of the Dead', es: 'Temporada 1: Día de Muertos', starts: { en: 'Nov 1', es: '1 nov' },
      desc: { en: 'Papel picado, marigolds and candlelight, a sugar skull crown, a new seasonal frame and medal. The throne starts empty at $5.', es: 'Papel picado, cempasúchil y velas, una corona de calavera de azúcar, un marco y una medalla de temporada nuevos. El trono empieza vacío a $5.' } },
    palette: [
      ['#1F1C27', 'Piedra · contorno', 'Muro, juntas'], ['#2C2936', 'Piedra · sombra', 'Muro'], ['#3A3645', 'Piedra · base', 'Muro'], ['#4E4A5A', 'Columna · luz', 'Columnas, peldaño'],
      ['#17141E', 'Suelo · junta', 'Suelo'], ['#262330', 'Suelo · base', 'Suelo'],
      ['#3E0C18', 'Estandarte · contorno', 'Estandartes, alfombra'], ['#861B2F', 'Estandarte · sombra', 'Estandartes, cojín'], ['#B3263B', 'Estandarte · base', 'Estandartes, alfombra'],
      ['#2A160C', 'Roble · contorno', 'Trono'], ['#4E2E1A', 'Roble · sombra', 'Trono'], ['#6E4428', 'Roble · base', 'Trono'],
      ['#4B5A78', 'Fondo Pizarra', 'Fondo de avatar'], ['#58704F', 'Fondo Musgo', 'Fondo de avatar'], ['#6B5B84', 'Fondo Lavanda', 'Fondo de avatar'], ['#2E6A6C', 'Fondo Verdín', 'Fondo de avatar'], ['#7C6A58', 'Fondo Arenisca', 'Fondo de avatar'],
      ['#1E1030', 'Púrpura · contorno', 'Capa'], ['#452A6C', 'Púrpura · sombra', 'Capa'], ['#5E3C8E', 'Púrpura · base', 'Capa'],
      ['#0E1A3A', 'Cobalto · contorno', 'Capa'], ['#223C7A', 'Cobalto · sombra', 'Capa'], ['#2F52A0', 'Cobalto · base', 'Capa'],
      ['#0C2414', 'Bosque · contorno', 'Capa'], ['#225234', 'Bosque · sombra', 'Capa'], ['#2F6E48', 'Bosque · base', 'Capa'],
      ['#14111C', 'Azabache · contorno', 'Capa'], ['#2C283A', 'Azabache · sombra', 'Capa'], ['#3E3850', 'Azabache · base', 'Capa'],
      ['#133A3C', 'Verdín · contorno', 'Aro Fundador, marco Genesis'], ['#4FA39B', 'Verdín · base', 'Color de temporada'], ['#8FD1C4', 'Verdín · brillo', 'Gemas del marco Genesis']
    ],
    medal: { key: 'founder', en: 'Founder', es: 'Fundador', rarity: { en: 'Seasonal', es: 'De temporada' }, cond: { en: 'Reign during Season 0', es: 'Reinar en la Temporada 0' } },
    medalImg: locked => window.CrownMedalLib().medal('founder', 'seasonal0', locked),
    ring: { o: '#133A3C', s1: '#2E6A6C', b: '#4FA39B', h: '#8FD1C4' },
    frameName: { en: 'Genesis frame', es: 'Marco Genesis' },
    crownName: { en: 'Base crowns (3)', es: 'Coronas base (3)' }
  };

  /* ================= TEMPORADA 1 · DÍA DE MUERTOS ================= */
  const NO = { o: '#1A1226', s1: '#261A36', b: '#33234A' };
  const SU = '#231A2C';
  const BA = { o: '#2A1614', s1: '#4A2620', b: '#7A4A38' };
  const CE = { o: '#6A2A08', s1: '#D9661A', b: '#F28C28', h: '#FFC24A' };
  const RO = { o: '#4A0E36', s1: '#B01E78', b: '#E0409A', h: '#F27AB8' };
  const TU = { o: '#0E3A40', s1: '#1E7A80', b: '#3AB4B0' };
  const LI = { o: '#1E4014', s1: '#3E8A2A', b: '#6CC04A' };
  const VI = { o: '#2A1650', s1: '#5A36A0', b: '#8A62D8' };
  const MA = { o: '#0C1E26', s1: '#163644', b: '#1F4E5E' };
  const BG1 = [['Noche', '#4A3466'], ['Jade', '#2E6A5A'], ['Ciruela', '#6A3656'], ['Añil', '#3A4A7A'], ['Terracota', '#7A4A38']];

  // Corona de temporada: media fila de 7 px reflejada (14 px), 8 filas. C oro, B banda, o bola de cempasúchil, k calavera, e/n cuencas, t dientes, m gema rosa, g gema cempasúchil
  const CROWN1 = ['.o.....', '.C...kk', '.CC.kkk', '.CCCkek', 'CCCCkkn', 'BBBBBkt', 'BmBBgBB', 'BBBBBBB'];
  const crownLayersOn = (W, H, ox, oy, locked) => {
    const g = maskOf(W, H, CROWN1, ox, oy, true), G = locked ? CORE.lock : CORE.gold, K = locked ? CORE.lock : CORE.ivory;
    const L = [{ m: U(W, H, g, 'oCBmg'), p: G, ol: true }, { m: U(W, H, g, 'kent'), p: K, ol: true }];
    if (!locked) L.push({ m: U(W, H, g, 'en'), p: CORE.ivory, tone: 'o' }, { m: U(W, H, g, 't'), p: CORE.ivory, tone: 's1' }, { m: U(W, H, g, 'og'), p: CE, tone: 'b' }, { m: U(W, H, g, 'm'), p: RO, tone: 'b' });
    else L.push({ m: U(W, H, g, 'ent'), p: CORE.lock, tone: 'o' });
    return L;
  };
  const crownSprite1 = locked => { const W = 16, H = 10, col = new Array(W * H).fill(null); paint(col, W, H, crownLayersOn(W, H, 1, 1, locked)); return enc(W, H, col); };

  // Escena T1: misma geometría que T0 (trono 64×68 anclado abajo al centro, retrato en x0+10, y0+6)
  const scene1 = (W, H, opt = {}) => {
    const N = W * H, col = new Array(N).fill(null), cx = W / 2, wallB = H - 10;
    const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return h ^ (h >>> 16); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c; const rx = x - cx + 1024;
      if (y < wallB - 5) c = hash(rx, y) % 11 === 0 ? NO.s1 : NO.b;
      else if (y === wallB - 5) c = RO.s1;
      else if (y < wallB) { const tx = rx % 10; c = tx === 9 ? BA.o : y === wallB - 1 ? BA.s1 : (tx === 4 || tx === 5) && (y === wallB - 3 || y === wallB - 2) && Math.floor(rx / 10) % 2 === 0 ? TU.s1 : BA.b; }
      else if (y === wallB) c = NO.o;
      else { const fy = y - wallB - 1, r2 = rx + (fy >= 4 ? 6 : 0); c = fy === 4 || r2 % 12 === 11 ? NO.o : SU; }
      col[y * W + x] = c;
    }
    const M = () => new Uint8Array(N);
    const rect = (m, x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) m[y * W + x] = 1; return m; };
    const pat = (m, rows, ox, oy) => { rows.forEach((r, y) => [...r].forEach((ch, x) => { const X = ox + x, Y = oy + y; if (ch === '#' && X >= 0 && Y >= 0 && X < W && Y < H) m[Y * W + X] = 1; })); return m; };
    const draw = (m, P, tone) => paint(col, W, H, [tone ? { m, p: P, tone } : { m, p: P, ol: true }]);
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) col[y * W + x] = c; };
    const before = () => col.slice();

    // Papel picado: dos cordeles con banderitas recortadas
    const FLAG = ['########', '########', '##.##.##', '#.#..#.#', '##.##.##', '########', '.#.##.#.'];
    const RAMPS = [RO, CE, TU, LI, VI];
    const cord = (top, sag, span, phase, ci) => {
      const yAt = x => { const u = (((x - cx - phase) % span) + span) % span / span; return top + Math.round(sag * 4 * u * (1 - u)); };
      for (let x = 0; x < W; x++) put(x, yAt(x), NO.o);
      const first = Math.floor((0 - cx - phase) / span) - 1, last = Math.ceil((W - cx - phase) / span) + 1;
      for (let s = first; s <= last; s++) for (let k = 0; k < 3; k++) {
        const fx = Math.round(cx + phase + s * span + 3 + k * Math.floor((span - 6) / 3));
        const fy = yAt(fx + 4) + 1, idx = ((s * 3 + k + ci) % 5 + 5) % 5;
        draw(pat(M(), FLAG, fx, fy), RAMPS[idx]);
      }
    };
    cord(1, 5, 40, 20, 0);
    cord(13, 6, 48, 0, 2);

    // Guirnaldas verticales de cempasúchil
    const FLOW = ['.##.', '####', '####', '.##.'];
    const flowers = (list, P) => { const m = M(); list.forEach(([x, y]) => pat(m, FLOW, x, y)); draw(m, P); list.forEach(([x, y]) => put(x + 1, y + 1, P.h || P.b)); };
    [cx - 54, cx + 54, cx - 98, cx + 98].filter(gc => gc - 3 >= 0 && gc + 2 < W).forEach(gc => {
      const bottom = Math.min(wallB - 14, Math.round(H * 0.62)), pts = [];
      for (let y = 2, k = 0; y <= bottom; y += 5, k++) pts.push([Math.round(gc - 2 + (k % 2 ? 1 : -1) * 0), y]);
      flowers(pts.filter((_, i) => i % 4 !== 3), CE);
      flowers(pts.filter((_, i) => i % 4 === 3), RO);
      draw(pat(M(), ['.##.', '.##.', '####', '#..#'], Math.round(gc - 2), bottom + 5), RO);
    });

    // Velas (cera marfil del núcleo, llama de cempasúchil)
    const candle = (x, h) => {
      const top = wallB + 2 - h;
      draw(rect(M(), x, top, x + 2, wallB + 2), CORE.ivory);
      draw(rect(M(), x + 1, top - 3, x + 1, top - 2), CE);
      put(x + 1, top - 3, CE.h);
    };
    [cx - 66, cx + 66, cx - 114, cx + 114].filter(p => p > -6 && p < W + 6).forEach(pc => { candle(pc - 5, 9); candle(pc - 1, 13); candle(pc + 3, 7); });

    // Arco de cempasúchil detrás del trono
    const arch = [], ccx = cx - 2, ccy = H - 6, rx = 39, ry = H - 10;
    let last = null;
    for (let a = 0; a <= Math.PI + 1e-6; a += 0.004) {
      const x = Math.round(ccx + rx * Math.cos(a)), y = Math.round(ccy - ry * Math.sin(a));
      if (!last || Math.hypot(x - last[0], y - last[1]) >= 5) { arch.push([x, y]); last = [x, y]; }
    }
    flowers(arch.filter((_, i) => i % 3 !== 2), CE);
    flowers(arch.filter((_, i) => i % 3 === 2), RO);

    // Peldaño de barro y camino de pétalos
    draw(rect(M(), cx - 38, H - 4, cx + 37, H - 1), BA);
    draw(rect(M(), cx - 10, H - 4, cx + 9, H - 1), CE);
    for (let y = H - 3; y <= H - 2; y++) for (let x = cx - 9; x <= cx + 8; x++) if (hash(x, y) % 4 === 0) put(x, y, CE.h);

    // Trono: madera pintada con flores y calavera de azúcar en el copete
    const pre = before();
    const x0 = cx - 32, y0 = H - 68;
    const T = (a, b, c, d, m) => rect(m || M(), x0 + a, y0 + b, x0 + c, y0 + d);
    draw(T(14, 1, 49, 5), MA);
    draw(T(6, 4, 57, 51), MA);
    for (let y = 8; y <= 48; y += 5) { put(x0 + 8, y0 + y, TU.b); put(x0 + 55, y0 + y, TU.b); }
    draw(T(59, 44, 62, 59, T(1, 44, 4, 59)), MA);
    draw(T(54, 38, 63, 43, T(0, 38, 9, 43)), MA);
    flowers([[x0 + 0, y0 + 35], [x0 + 60, y0 + 35]], CE);
    draw(T(4, 52, 59, 56), RO);
    draw(T(4, 57, 59, 59), MA); draw(T(6, 58, 57, 58), CE, 'b');
    for (let x = 10; x <= 54; x += 6) put(x0 + x, y0 + 58, RO.b);
    draw(T(54, 60, 59, 63, T(4, 60, 9, 63)), MA);
    flowers([[x0 + 3, y0 + 0], [x0 + 57, y0 + 0], [x0 + 12, y0 + 1], [x0 + 48, y0 + 1]], CE);
    const SK = ['...######...', '.##########.', '############', '##..####..##', '##..####..##', '#####..#####', '.##########.', '..#.#..#.#..', '...######...'];
    draw(pat(M(), SK, x0 + 26, y0 - 4), CORE.ivory);
    put(x0 + 31, y0 - 3, CE.b); put(x0 + 32, y0 - 3, CE.b); put(x0 + 31, y0 - 2, CE.h); put(x0 + 32, y0 - 2, CE.s1);
    put(x0 + 27, y0 + 1, RO.b); put(x0 + 36, y0 + 1, RO.b);
    if (opt.frame) {
      for (let fy = 0; fy < 44; fy++) for (let fx = 0; fx < 44; fx++) { const c = opt.frame[fy * 44 + fx]; if (c) put(x0 + 10 + fx, y0 + 6 + fy, c); }
    } else {
      draw(T(11, 7, 52, 49), RO);
      const tuft = M(); for (let ty = 13; ty <= 43; ty += 10) for (let tx = 17; tx <= 47; tx += 10) T(tx, ty, tx + 1, ty + 1, tuft);
      draw(tuft, RO, 'o'); draw(T(14, 10, 14, 46), RO, 's1');
      if (!opt.bare) paint(col, W, H, crownLayersOn(W, H, x0 + 25, y0 + 43));
    }
    if (opt.spot) {
      const DK = {};
      [NO, BA, CE, RO, TU, LI, VI, MA, CORE.ivory, CORE.gold].forEach(P => { if (P.h) DK[P.h] = P.b; DK[P.b] = P.s1; DK[P.s1] = P.o; DK[P.o] = NO.o; });
      DK[SU] = NO.o; DK[NO.o] = NO.o;
      for (let y = 0; y < H; y++) {
        const hw = 8 + (y * 28) / H;
        for (let x = 0; x < W; x++) {
          const d = Math.abs(x + 0.5 - cx) - hw, i = y * W + x;
          if (col[i] !== pre[i] && d < 30) continue;
          if (d > 2 || (d > 0 && (x + y) % 2 === 0)) col[i] = DK[col[i]] || col[i];
        }
      }
    }
    return col;
  };

  // Marco exclusivo T1 · Cempasúchil (banda completa de 6 px, caja 44×44)
  const frame1 = (av, locked) => {
    const S = 44, col = new Array(S * S).fill(null);
    const P = locked ? CORE.lock : RO, F = locked ? CORE.lock : CE, K = locked ? CORE.lock : { ...CORE.ivory, h: CORE.ivory.b };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) col[(y + 6) * S + x + 6] = av[y * 32 + x];
    const rr = (x, y) => Math.min(x, y, S - 1 - x, S - 1 - y);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = rr(x, y); if (r > 5) continue;
      const i = y * S + x;
      if (r === 0 || r === 5) { col[i] = P.o; continue; }
      const top = y === r, left = x === r, bot = S - 1 - y === r, right = S - 1 - x === r;
      col[i] = (r === 1 && (bot || right)) || (r === 4 && (top || left)) ? P.s1 : (r === 1 && (top || left)) ? P.h : P.b;
    }
    const put = (x, y, c) => { col[y * S + x] = c; };
    const side = (t, r, c) => { put(t, r, c); put(t, S - 1 - r, c); put(r, t, c); put(S - 1 - r, t, c); };
    [9, 15].forEach(t => [t, S - 1 - t].forEach(u => { side(u, 2, P.o); side(u, 3, P.o); }));
    const stamp = (pat, ox, oy, ramp) => pat.forEach((row, y) => row.forEach((k, x) => { if (k) put(ox + x, oy + y, ramp[k]); }));
    const flower = [['o', 'b', 'b', 'o'], ['b', 'h', 'b', 's1'], ['b', 'b', 's1', 's1'], ['o', 's1', 's1', 'o']];
    const skull = [['b', 'b', 'b', 'b'], ['o', 'b', 'b', 'o'], ['b', 'b', 'b', 's1'], [null, 's1', 's1', null]];
    [[1, 1], [39, 1], [1, 39], [39, 39]].forEach(([x, y]) => stamp(flower, x, y, F));
    [[20, 1], [20, 39], [1, 20], [39, 20]].forEach(([x, y]) => stamp(skull, x, y, K));
    return col;
  };

  // Medalla exclusiva T1 · Remembered / Recordado (anillo con el color de temporada)
  const medal1 = locked => {
    const W = 24, col = new Array(W * W).fill(null), dd = (x, y) => Math.hypot(x - 11.5, y - 11.5);
    const ring = new Uint8Array(576), inner = new Uint8Array(576);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { if (dd(x, y) <= 10.9) ring[y * 24 + x] = 1; if (dd(x, y) <= 7.9) inner[y * 24 + x] = 1; }
    const rows = ['........', '........', '........', '....kkkk', '...kkkkf', '..kkkkff', '..kkkkkk', '..keekkk', '..keekkk', '..kkkkkn', '..ckkkkk', '...kmkmk', '....kkkk', '........', '........', '........'];
    const g = maskOf(24, 24, rows, 4, 4, true);
    const all = new Uint8Array(576); Object.values(g).forEach(m => m.forEach((v, i) => { if (v) all[i] = 1; }));
    if (locked) { paint(col, 24, 24, [{ m: ring, p: CORE.lock, ol: true }, { m: inner, p: CORE.lockIn, tone: 'b' }, { m: all, p: CORE.lockIcon, ol: true }]); return enc(24, 24, col); }
    paint(col, 24, 24, [{ m: ring, p: CE, ol: true }, { m: inner, p: { b: CORE.stone }, tone: 'b' }, { m: all, p: CORE.ivory, ol: true },
      { m: U(24, 24, g, 'f'), p: CE, tone: 'b' }, { m: U(24, 24, g, 'e'), p: VI, tone: 'o' }, { m: U(24, 24, g, 'nm'), p: CORE.ivory, tone: 'o' }, { m: U(24, 24, g, 'c'), p: RO, tone: 'b' }]);
    return enc(24, 24, col);
  };

  const T1 = {
    id: 1, key: 'muertos', color: CE.b,
    name: { en: 'Season 1: Day of the Dead', es: 'Temporada 1: Día de Muertos' },
    dates: { en: 'Nov 1 – Nov 30, 2026', es: '1 nov – 30 nov 2026' }, starts: { en: 'Nov 1', es: '1 nov' }, ends: { en: 'Nov 30', es: '30 nov' },
    ui: {
      en: { season: 'Season 1: Day of the Dead', seasonLong: 'Season 1: Day of the Dead · 23 days left', seasonShort: 'Season 1 · 23 days left', firstKing: 'Be the first king of Season 1.' },
      es: { season: 'Temporada 1: Día de Muertos', seasonLong: 'Temporada 1: Día de Muertos · quedan 23 días', seasonShort: 'T1 · quedan 23 días', firstKing: 'Sé el primer rey de la Temporada 1.' }
    },
    banner: RO,
    ped: { o: MA.o, s1: MA.s1, b: MA.b, h: TU.s1, hh: TU.b },
    next: { id: 2, en: 'Season 2: Frost', es: 'Temporada 2: Escarcha', starts: { en: 'Dec 1', es: '1 dic' },
      desc: { en: 'A frozen hall, a new seasonal crown and frame, and new achievements. The throne starts empty at $5.', es: 'Un salón helado, corona y marco de temporada nuevos, y nuevos logros. El trono empieza vacío a $5.' } },
    palette: [
      [NO.o, 'Noche · contorno', 'Muro, cordel, juntas'], [NO.s1, 'Noche · sombra', 'Muro (textura)'], [NO.b, 'Noche · base', 'Muro de adobe'], [SU, 'Suelo', 'Baldosa'],
      [BA.o, 'Barro · contorno', 'Zócalo, peldaño'], [BA.s1, 'Barro · sombra', 'Zócalo'], [BA.b, 'Barro · base', 'Zócalo; fondo Terracota'],
      [CE.o, 'Cempasúchil · contorno', 'Flores, llamas'], [CE.s1, 'Cempasúchil · sombra', 'Flores'], [CE.b, 'Cempasúchil · base', 'Flores, color de temporada'], [CE.h, 'Cempasúchil · brillo', 'Pétalos, llama'],
      [RO.o, 'Rosa · contorno', 'Papel picado, cojín'], [RO.s1, 'Rosa · sombra', 'Papel picado, capa'], [RO.b, 'Rosa · base', 'Papel picado, capa'], [RO.h, 'Rosa · brillo', 'Marco exclusivo'],
      [TU.o, 'Turquesa · contorno', 'Papel picado, capa'], [TU.s1, 'Turquesa · sombra', 'Azulejo, capa'], [TU.b, 'Turquesa · base', 'Pintura del trono'],
      [LI.o, 'Lima · contorno', 'Papel picado, capa'], [LI.s1, 'Lima · sombra', 'Capa'], [LI.b, 'Lima · base', 'Papel picado'],
      [VI.o, 'Violeta · contorno', 'Cuencas de calavera'], [VI.s1, 'Violeta · sombra', 'Capa'], [VI.b, 'Violeta · base', 'Papel picado'],
      [MA.o, 'Madera pintada · contorno', 'Trono'], [MA.s1, 'Madera pintada · sombra', 'Trono'], [MA.b, 'Madera pintada · base', 'Trono'],
      [BG1[0][1], 'Fondo Noche', 'Fondo de avatar'], [BG1[1][1], 'Fondo Jade', 'Fondo de avatar'], [BG1[2][1], 'Fondo Ciruela', 'Fondo de avatar'], [BG1[3][1], 'Fondo Añil', 'Fondo de avatar']
    ],
    avatar: {
      bgs: BG1.map(([n, hex]) => ({ n, hex })),
      capes: [['Rosa mexicano', RO], ['Turquesa', TU], ['Lima', LI], ['Violeta', VI], ['Cempasúchil', CE]].map(([n, P]) => ({ n, p: { b: P.b, s1: P.s1, o: P.o, s2: P.o, h: P.b } }))
    },
    scene: scene1,
    crownLayers: () => crownLayersOn(32, 32, 9, 0),
    crownSprite: crownSprite1,
    frame: frame1,
    medalImg: medal1,
    medal: { key: 'remembered', en: 'Remembered', es: 'Recordado', rarity: { en: 'Seasonal', es: 'De temporada' }, cond: { en: 'Reign during Season 1', es: 'Reinar en la Temporada 1' } },
    frameName: { en: 'Marigold frame', es: 'Marco Cempasúchil' },
    crownName: { en: 'Sugar skull crown', es: 'Corona Calavera' }
  };

  const list = [T0, T1];
  // Rareza «De temporada»: el aro usa el color de la temporada de ORIGEN de la medalla (las medallas no cambian después).
  const SEASONAL = { key: 'seasonal', en: 'Seasonal', es: 'De temporada' };
  const seasonalMedals = () => (window.CrownMedalLib ? list : list.filter(S => S.id !== 0)).filter(S => S.medalImg).map(S => ({ season: S, key: S.medal.key, hex: S.color, en: S.medal.en, es: S.medal.es, cond: S.medal.cond, on: S.medalImg(false), off: S.medalImg(true) }));
  // Sello del reino (20×20) y franja de piedra (16×8) con la piedra de la temporada activa.
  const seal = S => {
    const P = S.ped, N = 20, col = new Array(N * N).fill(null), inD = (x, y) => Math.hypot(x - 9.5, y - 9.5) <= 9.6;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!inD(x, y)) continue;
      const edge = !inD(x - 1, y) || !inD(x + 1, y) || !inD(x, y - 1) || !inD(x, y + 1);
      const rimTL = !inD(x - 2, y) || !inD(x, y - 2), rimBR = !inD(x + 2, y) || !inD(x, y + 2);
      col[y * N + x] = edge ? P.o : rimTL && x + y < 19 ? P.h : rimBR && x + y > 19 ? P.b : P.s1;
    }
    const cr = ['.....##.....', '#....##....#', '##..####..##', '############', '############', '#.##.##.##.#', '############'];
    const on = (x, y) => y >= 0 && y < cr.length && x >= 0 && x < 12 && cr[y][x] === '#';
    const ox = 4, oy = 6;
    for (let y = 0; y < cr.length + 1; y++) for (let x = 0; x < 13; x++) {
      const i = (oy + y) * N + ox + x;
      if (on(x, y)) col[i] = P.hh;
      else if (on(x - 1, y) || on(x, y - 1)) col[i] = P.o;
    }
    for (let x = 0; x < 12; x++) if (cr[5][x] === '.') col[(oy + 5) * N + ox + x] = P.o;
    return enc(N, N, col);
  };
  const stoneBand = S => {
    const P = S.ped, W = 32, H = 12, col = new Array(W * H).fill(P.s1);
    for (let x = 0; x < W; x++) { col[x] = P.o; col[6 * W + x] = P.o; }
    for (let y = 1; y < 6; y++) { col[y * W] = P.o; col[y * W + 16] = P.o; }
    for (let y = 7; y < 12; y++) { col[y * W + 8] = P.o; col[y * W + 24] = P.o; }
    return enc(W, H, col);
  };
  window.CrownSeasons = {
    list, CORE, enc, SEASONAL, seasonalMedals,
    seal: () => seal(window.CrownSeasons.current()),
    // URL de objeto (sin «;»): apta para background-image en estilos en línea.
    stoneBand: () => { const d = stoneBand(window.CrownSeasons.current()), bin = atob(d.split(',')[1]), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return URL.createObjectURL(new Blob([u], { type: 'image/png' })); },
    get: id => list[id] || T0,
    medalByKey: key => { const S = list.find(S => S.medal && S.medal.key === key && S.medalImg); return S ? { season: S, hex: S.color, img: S.medalImg } : null; },
    setSeason(id) { try { const u = new URL(location.href); u.searchParams.set('season', id); location.href = u.toString(); } catch (e) {} },
    current() {
      let id = 0;
      try { const q = new URLSearchParams(location.search).get('season'); if (q != null) id = +q; else if (window.CROWN_SEASON != null) id = +window.CROWN_SEASON; } catch (e) {}
      return list[id] || T0;
    }
  };

})();
