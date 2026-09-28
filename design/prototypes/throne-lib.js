(function () {
  const rgb = c => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const enc = (W, H, col) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
    col.forEach((c, i) => { if (!c) return; const [r, g, b] = rgb(c); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; });
    cx.putImageData(img, 0, 0); return cv.toDataURL('image/png');
  };
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };

  const R = {
    gold: { o: '#5A3A12', s1: '#C9962C', b: '#F2C14E', h: '#F7D57F' },
    silver: { o: '#3E4452', s1: '#8E96A4', b: '#C3C8D0', h: '#E4E8EE' },
    iron: { o: '#1E2230', s1: '#4A5060', b: '#6E7480', h: '#A4AAB6' },
    wood: { o: '#3A2214', s1: '#6E4428', b: '#8A5A34', h: '#A8744A' },
    crimson: { o: '#3A0A14', s1: '#6E1626', b: '#9A1F35', h: '#D24660' },
    blue: { o: '#16284A', s1: '#3566B0', b: '#4A90E2', h: '#8CC0F2' },
    ivory: { o: '#4E4034', s1: '#BFB29C', b: '#F3EDE2', h: '#FFFBF2' }
  };
  const RANKS = {
    peasant: { mat: 'wood', en: 'Peasant', es: 'Plebeyo', sw: '#8A5A34' },
    knight: { mat: 'iron', en: 'Knight', es: 'Caballero', sw: '#6E7480' },
    baron: { mat: 'silver', en: 'Baron', es: 'Barón', sw: '#C3C8D0' },
    count: { mat: 'silver', en: 'Count', es: 'Conde', sw: '#C3C8D0' },
    duke: { mat: 'gold', en: 'Duke', es: 'Duque', sw: '#F2C14E' },
    emperor: { mat: 'gold', en: 'Emperor', es: 'Emperador', sw: '#F2C14E' }
  };

  const S = 44;
  const frameCol = (id, av) => {
    const P = R[RANKS[id].mat], col = new Array(S * S).fill(null);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) col[(y + 6) * S + x + 6] = av[y * 32 + x];
    const rr = (x, y) => Math.min(x, y, S - 1 - x, S - 1 - y);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const r = rr(x, y); if (r > 5) continue;
      const i = y * S + x;
      if (r === 0 || r === 5) { col[i] = P.o; continue; }
      const top = y === r, left = x === r, bot = S - 1 - y === r, right = S - 1 - x === r;
      col[i] = (r === 1 && (bot || right)) || (r === 4 && (top || left)) ? P.s1 : P.b;
    }
    const put = (x, y, c) => { col[y * S + x] = c; };
    const side = (t, r, c) => { put(t, r, c); put(t, S - 1 - r, c); put(r, t, c); put(S - 1 - r, t, c); };
    const both = (t, r, c) => { side(t, r, c); side(S - 1 - t, r, c); };
    const stamp = (pat, ox, oy, ramp) => pat.forEach((row, y) => row.forEach((tk, x) => { if (tk) put(ox + x, oy + y, (ramp || P)[tk]); }));
    const at4 = (pat, ramp) => [[1, 1], [39, 1], [1, 39], [39, 39]].forEach(([x, y]) => stamp(pat, x, y, ramp));
    const mid4 = (pat, ramp) => [[20, 1], [20, 39], [1, 20], [39, 20]].forEach(([x, y]) => stamp(pat, x, y, ramp));
    const at2 = (pat, list) => list.forEach(t => { stamp(pat, t, 2); stamp(pat, t, 40); stamp(pat, 2, t); stamp(pat, 40, t); });
    const seam = (t, c) => { for (let r = 1; r <= 4; r++) both(t, r, c); };
    const carve = (pat, t0) => pat.forEach((row, ri) => [...row].forEach((ch, ti) => { if (ch === '#') both(t0 + ti, ri + 1, P.o); }));
    const gem = [['o', 'b', 'b', 'o'], ['b', 'h', 'b', 's1'], ['b', 'b', 's1', 's1'], ['o', 's1', 's1', 'o']];
    const stud = [['h', 'b'], ['b', 's1']];
    const ring4 = ['.##.', '#..#', '#..#', '.##.'].map(r => [...r].map(c => (c === '#' ? 'o' : null)));
    const arm = ['......', '###..#', '...##.', '......'];
    if (id === 'peasant') {
      for (let r = 1; r <= 4; r++) { put(r, r, P.s1); put(S - 1 - r, r, P.s1); put(r, S - 1 - r, P.s1); put(S - 1 - r, S - 1 - r, P.s1); }
      seam(14, P.o);
      [[2, 8, 10], [3, 17, 19], [2, 25, 27], [3, 33, 35]].forEach(([r, a, b]) => { for (let t = a; t <= b; t++) side(t, r, P.s1); });
    }
    if (id === 'knight') { seam(5, P.o); at4([[null, null, null, null], [null, 'h', 'b', null], [null, 'b', 's1', null], [null, null, null, null]]); at2(stud, [13, 21, 29]); }
    if (id === 'baron' || id === 'count') { for (let t = 1; t <= 42; t++) side(t, 2, P.s1); seam(5, P.o); at4([['b', 'b', 'b', 'b'], ['b', 'h', 'h', 'b'], ['b', 'h', 's1', 'b'], ['b', 'b', 'b', 'b']]); }
    if (id === 'count') { at4(gem, R.blue); seam(19, P.o); mid4(gem, R.blue); }
    if (id === 'duke') { at4(ring4); carve(arm, 6); mid4(ring4); }
    if (id === 'emperor') { carve(arm, 6); at4(gem, R.crimson); seam(19, P.o); mid4(gem, R.blue); at2(stud, [14, 28]); }
    return col;
  };

  // Escena T0. opt: { frame: 44×44 | bare: cojín sin corona | (ninguno): trono vacío con corona | spot }
  const sceneT0 = (W, H, opt = {}) => {
    const N = W * H, col = new Array(N).fill(null), cx = W / 2;
    const ST = { o: '#1F1C27', s1: '#2C2936', b: '#3A3645' };
    const PL = { o: '#1F1C27', s1: '#3A3645', b: '#4E4A5A' };
    const FLR = { o: '#17141E', b: '#262330' };
    const CR = { o: '#3E0C18', s1: '#861B2F', b: '#B3263B' };
    const GD = { o: '#5A3A12', s1: '#C9962C', b: '#F2C14E' };
    const WD = { o: '#2A160C', s1: '#4E2E1A', b: '#6E4428' };
    const wallB = H - 10;
    const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return h ^ (h >>> 16); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let c;
      if (y < wallB - 2) {
        const row = y >> 2, rx = x - cx + 1024 + (row % 2 ? 4 : 0), bx = rx % 8, bi = Math.floor(rx / 8);
        if (y % 4 === 3 || bx === 7) c = ST.o; else c = hash(bi, row) % 6 === 0 ? ST.s1 : (y % 4 === 2 ? ST.s1 : ST.b);
      } else if (y === wallB - 2) c = PL.b;
      else if (y === wallB - 1) c = PL.s1;
      else if (y === wallB) c = FLR.o;
      else { const fy = y - wallB - 1, rx = x - cx + 1024 + (fy >= 4 ? 6 : 0); c = fy === 4 || rx % 12 === 11 ? FLR.o : FLR.b; }
      col[y * W + x] = c;
    }
    const M = () => new Uint8Array(N);
    const rect = (m, x0, y0, x1, y1) => { for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) m[y * W + x] = 1; return m; };
    const pat = (m, rows, ox, oy) => { rows.forEach((r, y) => [...r].forEach((ch, x) => { const X = ox + x, Y = oy + y; if (ch === '#' && X >= 0 && Y >= 0 && X < W && Y < H) m[Y * W + X] = 1; })); return m; };
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const draw = (m, P, d) => {
      const inM = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1;
      if (!d) { const ol = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!m[y * W + x] && N4.some(([a, b]) => inM(x + a, y + b))) ol.push(y * W + x); ol.forEach(i => (col[i] = P.o)); }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!m[y * W + x]) continue;
        if (d) { col[y * W + x] = P[d]; continue; }
        const tl = !inM(x - 1, y) || !inM(x, y - 1), br = !inM(x + 1, y) || !inM(x, y + 1);
        col[y * W + x] = br && !tl ? P.s1 : P.b;
      }
    };
    [cx - 66, cx + 66, cx - 114, cx + 114].filter(p => p > -6 && p < W + 6).forEach(pc => {
      const m = M(); rect(m, pc - 4, 3, pc + 3, wallB - 4); rect(m, pc - 6, 0, pc + 5, 2); rect(m, pc - 6, wallB - 3, pc + 5, wallB - 1); draw(m, PL);
      const f = M(); rect(f, pc - 1, 5, pc - 1, wallB - 6); rect(f, pc + 2, 5, pc + 2, wallB - 6); draw(f, PL, 's1');
    });
    [cx - 42, cx + 42].concat(W >= 200 ? [cx - 90, cx + 90] : []).forEach(bc => {
      const by = 4, m = M(); rect(m, bc - 5, by + 2, bc + 4, by + 33);
      for (let k = 0; k < 4; k++) for (let x = bc - 5; x <= bc + 4; x++) if (Math.abs(x - (bc - 0.5)) < k + 1) m[(by + 30 + k) * W + x] = 0;
      draw(m, CR);
      draw(rect(M(), bc + 2, by + 13, bc + 2, by + 25), CR, 's1');
      draw(rect(rect(M(), bc - 4, by + 5, bc + 3, by + 5), bc - 4, by + 27, bc + 3, by + 27), GD, 's1');
      draw(pat(M(), ['#.##.#', '######', '######'], bc - 3, by + 10), GD);
      draw(rect(M(), bc - 7, by, bc + 6, by + 1), GD);
    });
    draw(rect(M(), cx - 38, H - 4, cx + 37, H - 1), PL);
    draw(rect(M(), cx - 10, H - 4, cx + 9, H - 1), CR);
    const before = col.slice();
    const x0 = cx - 32, y0 = H - 68;
    const T = (a, b, c, d, m) => rect(m || M(), x0 + a, y0 + b, x0 + c, y0 + d);
    draw(T(6, 4, 57, 51), WD);
    draw(T(59, 44, 62, 59, T(1, 44, 4, 59)), WD);
    draw(T(54, 38, 63, 43, T(0, 38, 9, 43)), WD);
    draw(T(60, 36, 63, 39, T(0, 36, 3, 39)), GD);
    draw(T(4, 52, 59, 56), CR);
    draw(T(4, 57, 59, 59), WD); draw(T(6, 58, 57, 58), GD, 's1');
    draw(T(54, 60, 59, 63, T(4, 60, 9, 63)), WD);
    const fin = ['..##..', '.####.', '######', '######', '.####.', '..##..'];
    draw(pat(pat(M(), fin, x0 + 4, y0), fin, x0 + 54, y0), GD);
    const crest = T(14, 2, 49, 5); T(31, 0, 32, 1, crest); T(22, 0, 23, 1, crest); T(40, 0, 41, 1, crest); draw(crest, GD);
    draw(T(31, 3, 32, 4), CR, 'b');
    if (opt.frame) {
      for (let fy = 0; fy < 44; fy++) for (let fx = 0; fx < 44; fx++) { const c = opt.frame[fy * 44 + fx]; if (c) col[(y0 + 6 + fy) * W + x0 + 10 + fx] = c; }
    } else {
      draw(T(11, 7, 52, 49), CR);
      const tuft = M(); for (let ty = 13; ty <= 43; ty += 10) for (let tx = 17; tx <= 47; tx += 10) T(tx, ty, tx + 1, ty + 1, tuft);
      draw(tuft, CR, 'o');
      draw(T(14, 10, 14, 46), CR, 's1');
      if (!opt.bare) {
        draw(pat(M(), ['#......##......#', '##....####....##', '##...######...##', '###.########.###', '################', '################', '################'], x0 + 24, y0 + 45), GD);
        draw(T(31, 49, 32, 50), CR, 'b');
      }
    }
    if (opt.spot) {
      const dark = {}, PAL = [...new Set(col.filter(Boolean))], near = t => { const T = rgb(t); let best = PAL[0], bd = 1e9; PAL.forEach(p => { const Q = rgb(p), d = 0.3 * (Q[0] - T[0]) ** 2 + 0.59 * (Q[1] - T[1]) ** 2 + 0.11 * (Q[2] - T[2]) ** 2; if (d < bd) { bd = d; best = p; } }); return best; }, dk = c => dark[c] || (dark[c] = near(mix(c, '#0B0910', 0.62)));
      for (let y = 0; y < H; y++) {
        const hw = 8 + (y * 28) / H;
        for (let x = 0; x < W; x++) {
          const d = Math.abs(x + 0.5 - cx) - hw, i = y * W + x;
          if (col[i] !== before[i]) continue;
          if (d > 2 || (d > 0 && (x + y) % 2 === 0)) col[i] = dk(col[i]);
        }
      }
    }
    return col;
  };
  // Escena de la temporada activa (season-lib.js); sin temporada, T0
  const scene = (W, H, opt = {}) => {
    const SE = opt.season || (window.CrownSeasons && window.CrownSeasons.current());
    return SE && SE.scene ? SE.scene(W, H, opt) : sceneT0(W, H, opt);
  };
  // Posición del retrato (marco 44×44) en la escena
  const portraitAt = (W, H) => ({ x: W / 2 - 32 + 10, y: H - 68 + 6 });

  // Banderas 12×8
  const W_ = '#F3EDE2', RED = '#D63A2F', GRN = '#1F8A4C', NAVY = '#1F2A6B', BLU = '#2E4FB0', YEL = '#F2C94C', BLK = '#1F1B24';
  const inSet = (x, y, list) => list.some(([a, b]) => a === x && b === y);
  const band3 = y => Math.floor((y * 3) / 8);
  const FL = {
    US: (x, y) => (x < 5 && y < 4 ? (x % 2 === 1 && y % 2 === 1 ? W_ : NAVY) : y % 2 === 0 ? RED : W_),
    MX: (x, y) => (x < 4 ? GRN : x < 8 ? ((x === 5 || x === 6) && (y === 3 || y === 4) ? '#8A5A34' : W_) : RED),
    ES: (x, y) => (y < 2 || y >= 6 ? '#C8281E' : (x === 3 && (y === 3 || y === 4) ? '#8A2A1E' : YEL)),
    AR: (x, y) => (y === 3 || y === 4 ? ((x === 5 || x === 6) ? YEL : W_) : '#74ACDF'),
    CO: (x, y) => (y < 4 ? YEL : y < 6 ? BLU : RED),
    EC: (x, y) => ((x === 5 || x === 6) && (y === 3 || y === 4) ? '#8A5A34' : y < 4 ? YEL : y < 6 ? BLU : RED),
    CL: (x, y) => (y < 4 ? (x < 4 ? (x >= 1 && x <= 2 && y >= 1 && y <= 2 ? W_ : BLU) : W_) : RED),
    PE: x => (x < 4 || x >= 8 ? RED : W_),
    BR: (x, y) => ((x - 5.5) ** 2 + (y - 3.5) ** 2 <= 2.6 ? NAVY : Math.abs(x - 5.5) / 6 + Math.abs(y - 3.5) / 4 <= 0.95 ? YEL : GRN),
    CA: (x, y) => (x < 3 || x >= 9 ? RED : inSet(x, y, [[5, 1], [6, 1], [4, 2], [5, 2], [6, 2], [7, 2], [4, 3], [5, 3], [6, 3], [7, 3], [5, 4], [6, 4], [5, 5], [6, 5]]) ? RED : W_),
    GB: (x, y) => { if (y === 3 || y === 4 || x === 5 || x === 6) return RED; if ((y >= 2 && y <= 5) || (x >= 4 && x <= 7)) return W_; if (Math.abs(x - y * 1.5 - 0.25) < 1 || Math.abs(11 - x - y * 1.5 - 0.25) < 1) return W_; return NAVY; },
    DE: (x, y) => [BLK, '#D63A2F', '#F2C14E'][band3(y)],
    FR: x => (x < 4 ? BLU : x < 8 ? W_ : RED),
    IT: x => (x < 4 ? GRN : x < 8 ? W_ : RED),
    IN: (x, y) => (y < 3 ? '#F08A24' : y < 5 ? ((x === 5 || x === 6) ? NAVY : W_) : GRN),
    JP: (x, y) => ((x - 5.5) ** 2 + (y - 3.5) ** 2 <= 5.2 ? RED : W_),
    KR: (x, y) => { const d = (x - 5.5) ** 2 + (y - 3.5) ** 2; if (d <= 5.2) return y < 3.5 ? RED : BLU; if (inSet(x, y, [[1, 1], [2, 1], [9, 1], [10, 1], [1, 6], [2, 6], [9, 6], [10, 6]])) return '#2A2438'; return W_; },
    CN: (x, y) => (inSet(x, y, [[2, 1], [1, 2], [2, 2], [3, 2], [2, 3], [4, 1], [5, 2], [5, 3], [4, 4]]) ? YEL : '#D8342A'),
    AU: (x, y) => { if (x < 6 && y < 4) return x === 2 || x === 3 || y === 1 || y === 2 ? RED : NAVY; if (inSet(x, y, [[2, 6], [8, 2], [10, 4], [8, 6], [9, 5]])) return W_; return NAVY; },
    NL: (x, y) => ['#C8281E', W_, BLU][band3(y)]
  };
  const flagCache = {};
  const flag = code => {
    if (!FL[code]) return null;
    if (!flagCache[code]) { const c = []; for (let y = 0; y < 8; y++) for (let x = 0; x < 12; x++) c.push(FL[code](x, y)); flagCache[code] = enc(12, 8, c); }
    return flagCache[code];
  };
  const COUNTRIES = [
    ['US', 'United States', 'Estados Unidos'], ['MX', 'Mexico', 'México'], ['ES', 'Spain', 'España'], ['AR', 'Argentina', 'Argentina'], ['CO', 'Colombia', 'Colombia'],
    ['EC', 'Ecuador', 'Ecuador'], ['CL', 'Chile', 'Chile'], ['PE', 'Peru', 'Perú'], ['BR', 'Brazil', 'Brasil'], ['CA', 'Canada', 'Canadá'],
    ['GB', 'United Kingdom', 'Reino Unido'], ['DE', 'Germany', 'Alemania'], ['FR', 'France', 'Francia'], ['IT', 'Italy', 'Italia'], ['IN', 'India', 'India'],
    ['JP', 'Japan', 'Japón'], ['KR', 'South Korea', 'Corea del Sur'], ['CN', 'China', 'China'], ['AU', 'Australia', 'Australia'], ['NL', 'Netherlands', 'Países Bajos'],
    ['PT', 'Portugal', 'Portugal'], ['DK', 'Denmark', 'Dinamarca'], ['ZA', 'South Africa', 'Sudáfrica'], ['NG', 'Nigeria', 'Nigeria'], ['SE', 'Sweden', 'Suecia']
  ];

  // Íconos pequeños
  const icon = (rows, color) => { const c = []; rows.forEach(r => [...r].forEach(ch => c.push(ch === '#' ? color : null))); return enc(rows[0].length, rows.length, c); };
  const crown16 = (() => {
    const W = 16, rows = ['................', '................', '.......##.......', '..#....##....#..', '..##..####..##..', '..###.####.###..', '..############..', '..############..', '..############..', '..############..', '..############..', '..############..', '................', '................', '................', '................'];
    const m = new Uint8Array(256); rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') m[y * W + x] = 1; }));
    const col = new Array(256).fill(null), P = R.gold, inM = (x, y) => x >= 0 && y >= 0 && x < W && y < W && m[y * W + x] === 1;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!m[i] && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => inM(x + a, y + b))) col[i] = P.o; }
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { if (!m[y * W + x]) continue; const tl = !inM(x - 1, y) || !inM(x, y - 1), br = !inM(x + 1, y) || !inM(x, y + 1); col[y * W + x] = br && !tl ? P.s1 : P.b; }
    [[7, 8], [8, 8], [7, 9], [8, 9]].forEach(([x, y]) => (col[y * W + x] = R.crimson.b));
    [[4, 9], [11, 9], [7, 2], [8, 2]].forEach(([x, y]) => (col[y * W + x] = R.ivory.b));
    for (let x = 2; x <= 13; x++) col[7 * W + x] = col[7 * W + x] === P.b ? P.s1 : col[7 * W + x];
    return enc(16, 16, col);
  })();
  const ICONS = {
    bang: icon(['...##...', '...##...', '...##...', '...##...', '...##...', '........', '...##...', '...##...'], '#14111C'),
    chev: icon(['#......#', '##....##', '.##..##.', '..####..', '...##...'], '#A89FB8'),
    check: icon(['.......#', '......##', '#....##.', '##..##..', '.####...', '..##....'], '#14111C'),
    close: icon(['##....##', '###..###', '.######.', '..####..', '..####..', '.######.', '###..###', '##....##'], '#F3EDE2')
  };

  window.CrownThroneLib = { enc, mix, R, RANKS, frameCol, scene, sceneT0, portraitAt, sceneSrc: (W, H, o) => enc(W, H, scene(W, H, o)), flag, COUNTRIES, crown16, ICONS };
})();
