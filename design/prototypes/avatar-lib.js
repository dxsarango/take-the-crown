(function(){
const S = {};
window.CrownAvatarLib = function(){
if (S._lib) return S._lib;
    const W = 32, N = W * W;
    const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase(); };
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

    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const render = (layers, st) => {
      const col = new Array(N).fill(null), own = new Array(N).fill(-1);
      layers.forEach((L, li) => {
        const m = L.m; if (!m) return;
        if (L.bg) { for (let i = 0; i < N; i++) if (m[i]) { col[i] = L.hex; own[i] = li; } return; }
        const P = L.p;
        const inM = (x, y) => x >= 0 && y >= 0 && x < W && y < W && m[y * W + x] === 1;
        if (L.ol) {
          const out = [];
          for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x; if (m[i]) continue;
            if (!N4.some(([dx, dy]) => inM(x + dx, y + dy))) continue;
            const u = own[i], U = u < 0 ? null : layers[u];
            if (L.ol === 'noskin' && U && U.skin) continue;
            out.push([i, st === 'A' || !U || U.bg ? P.o : P.s2]);
          }
          out.forEach(([i, c]) => { col[i] = c; own[i] = li; });
        }
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x; if (!m[i]) continue;
          let c;
          if (L.tone) c = P[L.tone];
          else if (L.fh) c = inM(x, y + 1) ? P.b : P.s1;
          else {
            const tl = !inM(x - 1, y) || !inM(x, y - 1), br = !inM(x + 1, y) || !inM(x, y + 1);
            if (st === 'A') c = br && !tl ? P.s1 : P.b;
            else { const br2 = !inM(x + 2, y) || !inM(x, y + 2); c = tl && br ? P.b : tl ? P.h : br ? P.s2 : br2 ? P.s1 : P.b; }
          }
          col[i] = c; own[i] = li;
        }
      });
      return col;
    };
    const cv = document.createElement('canvas'); cv.width = W; cv.height = W;
    const cx = cv.getContext('2d');
    const svg = col => {
      const img = cx.createImageData(W, W);
      col.forEach((c, i) => { if (!c) return; const n = parseInt(c.slice(1), 16); img.data.set([n >> 16, (n >> 8) & 255, n & 255, 255], i * 4); });
      cx.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    };

    // Temporada: la activa (season-lib.js) o la que se pase como 5.º argumento. Cambia fondos, colores de capa y corona.
    const avatar = (c, st = 'A', only = null, raw = false, season) => {
      const SE = season || (window.CrownSeasons && window.CrownSeasons.current()), AV = SE && SE.avatar;
      const S = SKINS[c.skin].p, H = HAIRC[c.hc].p, hs = HAIRS[c.hair], cp = CAPES[c.cape], CC = (AV ? AV.capes : CAPEC)[c.cc].p, cr = CROWNS[c.cr], ex = EX[c.ex].m;
      const L = [];
      const add = (cat, o) => { if (o.m && (!only || only === cat)) L.push({ cat, ...o }); };
      if (!only) L.push({ cat: 'bg', bg: true, m: FULL, hex: (AV ? AV.bgs : BGS)[c.bg].hex });
      add('hair', { m: hs.B, p: H, ol: true }); add('hair', { m: hs.Bt, p: H, tone: 's1' });
      add('cape', { m: cp.R, p: CC, ol: true }); add('cape', { m: cp.T, p: IVORY2, ol: true }); add('cape', { m: cp.E, p: IVORY, ol: true }); add('cape', { m: cp.k, p: IVORY, tone: 'o' }); add('cape', { m: cp.J, p: GOLD, ol: true });
      add('skin', { m: NECK, p: S, tone: 's1', ol: true, skin: true }); add('skin', { m: FACE, p: S, ol: true, skin: true }); add('skin', { m: NOSE, p: S, tone: 's1', skin: true });
      add('expr', { m: ex.b, p: H, tone: 'o', skin: true }); add('expr', { m: or(ex.e, ex.m), p: S, tone: 'o', skin: true }); add('expr', { m: ex.w, p: IVORY, tone: 'b', skin: true });
      if (FH[c.fh].m) add('fh', { m: FH[c.fh].m, p: H, ol: 'noskin', fh: true });
      add('hair', { m: hs.H, p: H, ol: true }); add('hair', { m: hs.t, p: H, tone: 's1' });
      if (c.acc >= 0) ACC[c.acc].L(S).forEach(o => add('acc', o));
      if (cr && SE && SE.crownLayers) SE.crownLayers().forEach(o => add('crown', o));
      else if (cr) { add('crown', { m: cr.all, p: GOLD, ol: true }); add('crown', { m: cr.G, p: CRIMSON, tone: 'b' }); add('crown', { m: cr.P, p: IVORY, tone: 'b' }); }
      const out = render(L, st); return raw ? out : svg(out);
    };

    const gen = name => {
      let h = 2166136261; for (const ch of name.trim().toLowerCase()) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
      let s = h || 1; const r = n => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s % n; };
      return { skin: r(6), hair: r(10), hc: r(8), fh: r(10) < 6 ? 0 : 1 + r(4), ex: r(6), cr: r(3), cape: r(5), cc: r(5), acc: r(10) < 4 ? -1 : r(6), bg: r(5) };
    };
    const tags = c => [SKINS[c.skin].n, HAIRS[c.hair].n, HAIRC[c.hc].n, FH[c.fh].n === 'Ninguno' ? 'Sin vello' : FH[c.fh].n, EX[c.ex].n, CROWNS[c.cr].n, CAPES[c.cape].n + ' ' + CAPEC[c.cc].n.toLowerCase(), c.acc < 0 ? 'Sin accesorio' : ACC[c.acc].n, 'Fondo ' + BGS[c.bg].n.toLowerCase()];

    S._lib = { SKINS, HAIRS, HAIRC, FH, EX, CROWNS, CAPES, CAPEC, ACC, BGS, avatar, gen, tags };
    return S._lib;
  
};
})();
