(function(){
let cache = null;
window.CrownMedalLib = function(){
if (cache) return cache;

    const R = {
      gold: { o: '#5A3A12', s1: '#C9962C', b: '#F2C14E', h: '#F7D57F' },
      silver: { o: '#3E4452', s1: '#8E96A4', b: '#C3C8D0', h: '#E4E8EE' },
      iron: { o: '#1E2230', s1: '#4A5060', b: '#6E7480', h: '#A4AAB6' },
      wood: { o: '#3A2214', s1: '#6E4428', b: '#8A5A34', h: '#A8744A' },
      crimson: { o: '#3A0A14', s1: '#6E1626', b: '#9A1F35', h: '#D24660' },
      blue: { o: '#16284A', s1: '#3566B0', b: '#4A90E2', h: '#8CC0F2' },
      ivory: { o: '#4E4034', s1: '#BFB29C', b: '#F3EDE2' },
      glass: { o: '#BFB29C', s1: '#2A2438', b: '#3D3550' },
      stone: { o: '#14111C', s1: '#3D3550', b: '#3D3550' },
      common: { o: '#3A3F48', s1: '#6E7682', b: '#9AA3AE' },
      rare: { o: '#16284A', s1: '#3566B0', b: '#4A90E2' },
      epic: { o: '#2E1650', s1: '#6E3AB0', b: '#9B5DE5' },
      legendary: { o: '#5A3A12', s1: '#C9962C', b: '#F2C14E' },
      seasonal0: { o: '#133A3C', s1: '#2E6A6C', b: '#4FA39B' },
      lockRing: { o: '#24212C', s1: '#3E3A48', b: '#57525F' },
      lockIn: { o: '#14111C', s1: '#2A2438', b: '#2A2438' },
      lockIcon: { o: '#24212C', s1: '#45404F', b: '#45404F' }
    };
    const enc = (W, H, col) => {
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const cx = cv.getContext('2d'), img = cx.createImageData(W, H);
      col.forEach((c, i) => { if (!c) return; const n = parseInt(c.slice(1), 16); img.data.set([n >> 16, (n >> 8) & 255, n & 255, 255], i * 4); });
      cx.putImageData(img, 0, 0); return cv.toDataURL('image/png');
    };
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const render = (W, layers) => {
      const col = new Array(W * W).fill(null);
      layers.forEach(L => {
        const m = L.m, P = R[L.p];
        const inM = (x, y) => x >= 0 && y >= 0 && x < W && y < W && m[y * W + x] === 1;
        if (!L.d) { const ol = []; for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (!m[y * W + x] && N4.some(([a, b]) => inM(x + a, y + b))) ol.push(y * W + x); ol.forEach(i => (col[i] = P.o)); }
        for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
          if (!m[y * W + x]) continue;
          let c;
          if (L.d) c = P[L.d]; else if (L.flat) c = P.b;
          else { const tl = !inM(x - 1, y) || !inM(x, y - 1), br = !inM(x + 1, y) || !inM(x, y + 1); c = br && !tl ? P.s1 : P.b; }
          col[y * W + x] = c;
        }
      });
      return col;
    };

    /* ---------- Medallas ---------- */
    const M24 = () => new Uint8Array(576);
    const G = (rows, sym) => { const out = {}; rows.forEach((r, y) => { const s = sym ? r + [...r].reverse().join('') : r; [...s].forEach((c, x) => { if (c === '.') return; (out[c] || (out[c] = M24()))[(y + 4) * 24 + x + 4] = 1; }); }); return out; };
    const U = (g, chars) => { const m = M24(); [...chars].forEach(c => g[c] && g[c].forEach((v, i) => { if (v) m[i] = 1; })); return m; };
    const pts = list => { const m = M24(); list.forEach(([x, y]) => (m[(y + 4) * 24 + x + 4] = 1)); return m; };
    const L = (g, spec) => spec.map(([ch, p, o]) => ({ m: U(g, ch), p, ...(o || {}) }));
    const E = Array(16).fill('................');
    const star = (ox, oy) => { const s = ['.##.', '####', '.##.', '#..#'], out = []; s.forEach((r, y) => [...r].forEach((c, x) => c === '#' && out.push([ox + x, oy + y]))); return out; };
    const shieldRows = ['........', '........', ...Array(7).fill('..rrrrrr'), '...rrrrr', '....rrrr', '.....rrr', '......rr', '.......r', '........', '........'];
    const shieldG = G(shieldRows, true);
    const guardian = starsAt => [{ m: shieldG.r, p: 'crimson' }, { m: pts(starsAt.flatMap(([x, y]) => star(x, y))), p: 'gold', d: 'b' }];

    const icons = {
      oneMin: () => { const g = G(['........', '.wwwwwww', '.wwwwwww', '........', '..w.gggg', '..w..ggg', '..w...gg', '..w....g', '..w....g', '..w...gg', '..w..ggg', '..w.gggg', '........', '.wwwwwww', '.wwwwwww', '........'], true); return L(g, [['g', 'glass'], ['w', 'wood']]); },
      owl: () => { const g = G(['........', '.....g.g', '.....ggg', '........', '..b.bbbb', '..bbbbbb', '..bffffb', '..bfeefb', '..bfepfb', '..bffffk', '..bbbbbk', '..bbbbbb', '..bbsbbb', '...bbbbb', '....tt..', '........'], true); return L(g, [['bfepks', 'wood'], ['fep', 'ivory', { d: 'b' }], ['ep', 'gold', { d: 'b' }], ['p', 'gold', { d: 'o' }], ['k', 'gold', { d: 's1' }], ['s', 'wood', { d: 's1' }], ['g', 'gold'], ['t', 'gold']]); },
      bag: () => { const g = G(['........', '........', '.....s.s', '......ss', '......tt', '......ss', '.....sss', '...sssss', '..sssscc', '..ssscc c'.replace(' ', ''), '..ssscmm', '..ssscmm', '...sssc c'.replace(' ', ''), '....sscc', '........', '........'], true); return L(g, [['stcm', 'wood'], ['t', 'crimson', { d: 'b' }], ['cm', 'gold'], ['m', 'gold', { d: 's1' }]]); },
      regicide: () => {
        const g = G(['................', '................', '................', '................', '..g....gg....g..', '..g...gggg...g..', '..gg..gggg..gg..', '..gggggggggggg..', '..gggggggggggg..', '..ggrrggggrrgg..', '..ggrrggggrrgg..', '..gggggggggggg..', '................', '................', '................', '................']);
        const all = U(g, 'gr'), gem = g.r;
        const parts = [M24(), M24(), M24(), M24()];
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
          const i = y * 24 + x; if (!all[i]) continue;
          const c = 4 + ((y - 4) % 2 ? 8 : 7), left = x < c, X = x + (left ? -1 : 1), Y = y + (left ? -1 : 1), j = Y * 24 + X;
          parts[left ? 0 : 1][j] = 1; if (gem[i]) parts[left ? 2 : 3][j] = 1;
        }
        return [{ m: parts[0], p: 'gold' }, { m: parts[2], p: 'crimson', d: 'b' }, { m: parts[1], p: 'gold' }, { m: parts[3], p: 'crimson', d: 'b' }];
      },
      revenge: () => {
        const A = { blade: [], grip: [], guard: [[3, 7], [4, 8], [5, 9], [6, 10], [7, 11]], pom: [[1, 13], [2, 13], [1, 14], [2, 14]] };
        for (let x = 6; x <= 13; x++) for (const s of [14, 15]) { const y = s - x; if (y >= 1) A.blade.push([x, y]); }
        for (let x = 3; x <= 4; x++) for (const s of [14, 15]) A.grip.push([x, s - x]);
        const mir = l => l.map(([x, y]) => [15 - x, y]);
        const sw = S => [{ m: pts(S.blade), p: 'silver' }, { m: pts(S.grip), p: 'wood' }, { m: pts(S.guard), p: 'gold' }, { m: pts(S.pom), p: 'gold' }];
        return [...sw(A), ...sw({ blade: mir(A.blade), grip: mir(A.grip), guard: mir(A.guard), pom: mir(A.pom) })];
      },
      g1: () => guardian([[6, 5]]),
      g2: () => guardian([[3, 4], [9, 4]]),
      g3: () => guardian([[3, 3], [9, 3], [6, 8]]),
      patriot: () => { const g = G(['................', '..gg............', '................', '..pp.rrrrrrrrr..', '..pp.rrrrrrrrr..', '..pp.iiiiiiii...', '..pp.iiiiiii....', '..pp.iiiiiiii...', '..pp.rrrrrrrrr..', '..pp.rrrrrrrrr..', '..pp............', '..pp............', '..pp............', '..pp............', '..pp............', '................']); return L(g, [['p', 'wood'], ['ri', 'crimson'], ['i', 'ivory', { d: 'b' }], ['g', 'gold']]); },
      firstBlood: () => { const g = G(['................', '.....ss.........', '.....ss.....r...', '.....ss....rrr..', '.....ss....rrr..', '.....ss.....r...', '.....ss.........', '.....ss.........', '................', '..gggggggg......', '................', '.....ww.........', '.....ww.........', '................', '.....gg.........', '................']); return L(g, [['s', 'silver'], ['w', 'wood'], ['g', 'gold'], ['r', 'crimson']]); },
      collector: () => { const g = G(['................', '................', '.....g.gg.g.....', '.....gggggg.....', '.....gggggg.....', '................', '....wwwwwwww....', '................', '..g.g.g..g.g.g..', '..ggggg..ggggg..', '..ggggg..ggggg..', '................', '..wwwwwwwwwwww..', '..wwwwwwwwwwww..', '................', '................']); return L(g, [['w', 'wood'], ['g', 'gold']]); },
      rivalry: () => { const g = G(['........', '........', '...rr...', '...rr...', '........', '..ssss..', '.ssssss.', '.ssssss.', '.sssvvv.', '.ssssss.', '.sssss..', '.ssss...', '.sssss..', '..ssss..', '........', '........'], true); return L(g, [['r', 'crimson'], ['sv', 'iron'], ['v', 'iron', { d: 'o' }]]); },
      founder: () => { const g = G(['........', '........', '..g....g', '..gg..gg', '..gggggj', '..gggggj', '........', '......00', '.....00.', '.....00.', '.....00.', '.....00.', '.....00.', '......00', '........', '........'], true); return L(g, [['gj', 'gold'], ['j', 'crimson', { d: 'b' }], ['0', 'ivory']]); }
    };

    const dd = (x, y) => Math.hypot(x - 11.5, y - 11.5);
    const ringM = (() => { const m = M24(); for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (dd(x, y) <= 10.9) m[y * 24 + x] = 1; return m; })();
    const innerM = (() => { const m = M24(); for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (dd(x, y) <= 7.9) m[y * 24 + x] = 1; return m; })();
    const medal = (key, rar, locked) => {
      if (rar === 'seasonal' || !icons[key]) { const S = window.CrownSeasons && window.CrownSeasons.medalByKey(key); if (S) return S.img(locked); }
      const ic = icons[key]();
      if (!locked) return enc(24, 24, render(24, [{ m: ringM, p: rar }, { m: innerM, p: 'stone', flat: true }, ...ic]));
      const sil = M24(); ic.forEach(l => l.m.forEach((v, i) => { if (v) sil[i] = 1; }));
      return enc(24, 24, render(24, [{ m: ringM, p: 'lockRing' }, { m: innerM, p: 'lockIn', flat: true }, { m: sil, p: 'lockIcon', flat: true }]));
    };
    const MED = [
      ['common', 'Común', '#9AA3AE', [['oneMin', 'One-Minute King', 'Rey de un minuto', 'Ser destronado en menos de 60 s'], ['owl', 'Night Owl', 'Noctámbulo', 'Tomar la corona entre las 3 y las 5 a. m. (hora local)'], ['bag', 'Bargain Hunter', 'Cazador de gangas', 'Tomar la corona al precio mínimo']]],
      ['rare', 'Raro', '#4A90E2', [['regicide', 'Regicide', 'Regicida', 'Destronar a alguien que llevaba más de 24 h'], ['revenge', 'Revenge', 'Venganza', 'Recuperar la corona de quien te la quitó'], ['g1', 'Guardian I', 'Guardián I', 'Reinar 12 h seguidas'], ['patriot', 'Patriot', 'Patriota', 'Ser el primer rey de tu país']]],
      ['epic', 'Épico', '#9B5DE5', [['firstBlood', 'First Blood', 'Primera sangre', 'Ser el primer rey de una temporada'], ['g2', 'Guardian II', 'Guardián II', 'Reinar 24 h seguidas'], ['collector', 'Collector', 'Coleccionista', 'Tomar 10 coronas'], ['rivalry', 'Rivalry', 'Rivalidad', 'Quitarse la corona 5 veces con la misma persona']]],
      ['legendary', 'Legendario', '#F2C14E', [['g3', 'Guardian III', 'Guardián III', 'Reinar 72 h seguidas']]]
    ];
    const groups = MED.map(([rar, n, hex, list]) => ({ n, hex, items: list.map(([k, en, es, cond]) => ({ en, es, cond, on: medal(k, rar, false), off: medal(k, rar, true) })) }));

    
cache = { medal, MED, R };
    if (window.CrownSeasons) window.CrownSeasons.seasonalMedals().forEach(sm => MED.push(['seasonal', 'De temporada', sm.hex, [[sm.key, sm.en, sm.es, sm.cond.es]]]));
return cache;
};
})();
