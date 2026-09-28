/** Crown · preset de Tailwind v3 (tailwind.config.js → presets: [require('./design/tokens/tailwind.preset.js')]).
 *  Los colores apuntan a las variables de tokens.css (impórtalo en app/globals.css) para que el color de temporada cambie sin recompilar.
 *  Tailwind v4: usa tailwind-v4.css en su lugar. */
const t = require('./tokens.json');
module.exports = {
  theme: {
    extend: {
      colors: {
        crown: {
          page: 'var(--crown-page)', ink: 'var(--crown-ink)', velvet: 'var(--crown-velvet)', hall: 'var(--crown-hall)',
          stone: 'var(--crown-stone)', 'stone-hi': 'var(--crown-stone-hi)', abyss: 'var(--crown-abyss)',
          text: 'var(--crown-text)', muted: 'var(--crown-text-muted)', 'parchment-shade': 'var(--crown-parchment-shade)', 'parchment-hi': 'var(--crown-parchment-hi)',
          gold: 'var(--crown-gold)', 'gold-old': 'var(--crown-gold-old)', 'gold-glow': 'var(--crown-gold-glow)',
          success: 'var(--crown-success)', danger: 'var(--crown-danger)', season: 'var(--crown-season)'
        },
        rarity: { common: t.color.rarity.common, rare: t.color.rarity.rare, epic: t.color.rarity.epic, legendary: t.color.rarity.legendary, seasonal: 'var(--crown-season)' }
      },
      fontFamily: { ui: ['Manrope', 'system-ui', 'sans-serif'], pixel: ['"Pixelify Sans"', 'Manrope', 'sans-serif'] },
      fontSize: Object.fromEntries(Object.entries(t.font.size).map(([k, v]) => [k, v])), // text-12 … text-64
      lineHeight: { none: '1', tight: '1.1', snug: '1.4', body: '1.5' },
      letterSpacing: { display: t.font.tracking.display },
      spacing: t.space,           // p-1 = 4px … p-20 = 80px (misma escala que Tailwind: 1 = 4px)
      borderRadius: { none: '0', tag: t.radius.tag },
      boxShadow: Object.fromEntries(Object.entries(t.shadow).map(([k, v]) => [k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), v])), // shadow-relief, shadow-relief-gold, shadow-inset-field…
      height: { button: t.size.buttonH, 'button-m': t.size.buttonHMobile, field: t.size.fieldH, topbar: t.size.topbarH },
      minWidth: { hit: t.size.hitMin }, minHeight: { hit: t.size.hitMin },
      outlineOffset: { relief: t.focus.offsetRelief }
    }
  }
};
