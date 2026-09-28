# Tarjetas para compartir y correo

Prototipo: `prototypes/Compartir y Correo.dc.html` (zonas variables en cian; `?zones=0` las oculta; `?season=1` muestra la T1). Todas las tarjetas se **generan en el servidor** (p. ej. `next/og` / `@vercel/og` o Satori + resvg) con la escena de la temporada activa, el avatar de `lib/avatar-lib.js` y los textos de `i18n/*.json → share`. Idioma = el del usuario que comparte.

Fondo de todas: Tinta #14111C. Tipos: Manrope 700/500 y Pixelify Sans 700 (incrustar ambas en el generador). Arte siempre `image-rendering: pixelated`, escala entera.

## Formatos
| Formato | Uso | Medidas |
|---|---|---|
| 1200×630 | `og:image` / `twitter:image` (summary_large_image), vista previa de enlaces | Columna de arte 700×630 (o 560 en Logro) + columna de texto 500 px, padding 56 56 52 44 |
| 1080×1920 | Historias IG/TikTok | Zonas seguras: 250 px arriba y 340 px abajo quedan tapadas por la app; todo lo importante entre y = 250 y y = 1580 |
| Miniatura en X | Comprobación | La 1200×630 se ve a ~506 px (×0,42): debe leerse quién, cuánto tiempo o cuánto cuesta, y verse la corona |

## Tarjetas (4) y zonas variables
Llaves `{…}` = lo rellena el servidor.

### 1200×630
Común a las 4: arriba a la derecha, «Crown» Pixelify 32/700 + `{season}` Manrope 18 #A89FB8 (baseline, gap 14).

**Victoria** (`share.vicHead` «I'm the king of the internet.»)
- Arte: escena 100×90 ×7 (700×630) variante `seat`; **retrato en (196, 196), 308×308** = `{avatar} + {rank_frame} + {crown}` a ×7.
- Titular 44/700, lh 1,1. Etiqueta «Reigning for» 24 #A89FB8. `{time}` Pixelify 112/700 lh 1 (p. ej. «2h 15m»).
- Pie: `{name}` 32/700 · `{flag}` 36×24 (bandera ×3 o pastilla) · `{rank}` pastilla alto 36, borde 2 px #3D3550, radio 4, muestra 12×12 del material + Pixelify 18/500.

**Desafío** (se comparte el rey actual)
- Arte igual que Victoria. `{name} {flag}` 44/700 + bandera 48×32; «holds the crown.» 44/700.
- «Dethrone her for» 28/500 (usar la forma neutra/según pronombre que decida producto) · `{price}` Pixelify 112/700 **#F2C14E** (dato de corona → oro).

**Logro**
- Columna izquierda 560×630 #1E1A29 con franja superior interior de 12 px del color de rareza (`inset 0 12px 0 {rarity}`); `{medal}` 24×24 a ×16 = 384×384 centrada.
- «Achievement unlocked» 24 #A89FB8 · `{achievement}` 80/700, tracking −0,02em · `{rarity}` y `{pct}` («6.2% of players have it»).

**Destronado**
- Arte: `{avatar}` **sin corona** + `{rank_frame}` en (196,196) 308×308 (expresión Sorprendida + corona caída según el prototipo).
- «I was king for» 44/700 · `{time}` Pixelify 112 + unidad 40/700 («11 seconds.»).
- `{name} {flag}` 32/700 + 36×24 · «Dethroned by `{new_king}` `{new_flag}`» 22 #A89FB8 con nombre #F3EDE2 700, bandera 30×20.

### 1080×1920
- Cabecera en top 260, márgenes laterales 80: «Crown» Pixelify 40 + `{season}` 24.
- `{name} {flag} {rank}` 48/700, bandera 54×36, pastilla de rango alto 44. Titular 72/700 lh 1,08. Etiqueta 36/500. Cifra `{time}`/`{price}` Pixelify **160**/700.
- Escena 120×84 a ×9 = **1080×756 en y = 820**; retrato `{avatar}+{rank_frame}(+{crown})` en (342, 198) de la escena, 396×396. Debajo, relleno #17141E desde y = 1576.
- Logro: bloque #1E1A29 de ancho completo desde y = 360, franja de rareza 12 px, medalla ×24 = 576×576.

## Correo «You were dethroned»
- Asunto: «You were dethroned by `{new_king}`». Preheader: «Take it back for `{price}` before the price goes up.» (ES en `i18n/es.json → share`).
- Anchos: **600 px** (escritorio, marco exterior 760, padding 40) y **375 px** (móvil, padding 20). Una sola columna, un único botón.
- Imagen de cabecera generada por el servidor (misma técnica que las tarjetas): los dos avatares + la bandera pixel en **una sola imagen** — 440×176 a 600 px, 330×132 a 375 px. Nunca emoji de bandera.
- Texto: `m1 {duration} m2 {king_name} {king_flag}` · «Take it back for» `{price}` · botón dorado «Take back the crown» (es la acción de corona; ancho auto a 600, ancho completo a 375) · nota «The price drops 2% every hour. Floor price $5.» · pie + enlace «Turn off dethrone alerts».
- HTML de correo con tablas y estilos en línea; relieve del botón con bordes sólidos (los clientes no soportan box-shadow de forma fiable): fondo #F2C14E, borde superior/izquierdo #F7D57F 4 px, inferior/derecho #C9962C 4 px.
