// Redes sociales del perfil: 5 plataformas opcionales, logos oficiales monocromos (24×24) y validación de usuario.
(function () {
  const P = {
    x: '<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/>',
    ig: '<rect x="2.1" y="2.1" width="19.8" height="19.8" rx="5.6" fill="none" stroke="C" stroke-width="2.2"/><circle cx="12" cy="12" r="4.7" fill="none" stroke="C" stroke-width="2.2"/><circle cx="17.8" cy="6.2" r="1.45"/>',
    gh: '<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>',
    li: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 4.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
    yt: '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>'
  };
  const cache = {};
  const logo = (k, c = '#F3EDE2') => {
    const id = k + c;
    if (!cache[id]) cache[id] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${c}" fill-rule="evenodd">${P[k].replace(/"C"/g, `"${c}"`)}</svg>`);
    return cache[id];
  };
  const LIST = [
    { k: 'x', name: 'X', host: 'x.com/', strip: /^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, re: /^[A-Za-z0-9_]{1,15}$/, en: 'X usernames use letters, numbers and _ only, up to 15.', es: 'Los usuarios de X solo llevan letras, números y _, hasta 15.' },
    { k: 'ig', name: 'Instagram', host: 'instagram.com/', strip: /^(https?:\/\/)?(www\.)?instagram\.com\//i, re: /^(?!.*\.\.)(?!\.)[A-Za-z0-9._]{1,30}(?<!\.)$/, en: 'Instagram usernames use letters, numbers, . and _, up to 30.', es: 'Los usuarios de Instagram llevan letras, números, . y _, hasta 30.' },
    { k: 'gh', name: 'GitHub', host: 'github.com/', strip: /^(https?:\/\/)?(www\.)?github\.com\//i, re: /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, en: 'GitHub usernames use letters, numbers and single hyphens, up to 39.', es: 'Los usuarios de GitHub llevan letras, números y guiones sueltos, hasta 39.' },
    { k: 'li', name: 'LinkedIn', host: 'linkedin.com/in/', strip: /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/in\//i, re: /^[A-Za-z0-9-]{3,100}$/, en: 'LinkedIn profile URLs use letters, numbers and hyphens, 3 to 100.', es: 'Las URL de LinkedIn llevan letras, números y guiones, de 3 a 100.' },
    { k: 'yt', name: 'YouTube', host: 'youtube.com/@', strip: /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/@?/i, re: /^[A-Za-z0-9._-]{3,30}$/, en: 'YouTube handles use letters, numbers, . _ and -, 3 to 30.', es: 'Los identificadores de YouTube llevan letras, números, . _ y -, de 3 a 30.' }
  ];
  const by = Object.fromEntries(LIST.map(p => [p.k, p]));
  const clean = (k, v) => String(v || '').trim().replace(by[k].strip, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  const valid = (k, v) => { const c = clean(k, v); return !!c && by[k].re.test(c); };
  const url = (k, v) => 'https://' + by[k].host + clean(k, v);
  const shown = (k, v) => (k === 'x' || k === 'ig' || k === 'yt' ? '@' : '') + clean(k, v);
  window.CrownSocial = { LIST, by, logo, clean, valid, url, shown };
})();
