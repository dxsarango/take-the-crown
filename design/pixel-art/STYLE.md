# Guía de estilo pixel art · Crown (estilo 3a «Esmalte»)

Todo el arte del juego (escenas, tronos, avatares, marcos, medallas, coronas, banderas, sellos, íconos) sigue estas reglas. Los SVG de `assets/` ya las cumplen; esta guía es para crear arte nuevo (temporadas, medallas) y para revisar.

## 1. Rejilla y escalado
- Un píxel de arte = un cuadrado. Nunca se interpola: `image-rendering: pixelated` en `<img>`, `shape-rendering="crispEdges"` en SVG (ya incluido).
- **Escalado entero siempre** (×1, ×2, ×3…). Nunca ×1,5 ni `width:100%` libre. Si el hueco no es múltiplo, se elige el múltiplo inferior y el sobrante se rellena con el color de fondo del arte (no con el de la interfaz).
- **Escena del trono = un bloque**: escenario, trono y busto comparten un único tamaño de píxel. Se escala todo junto:
  - Móvil (diseño a 390): escena 98×72 a ×4 → 392×288 (se centra; recorta 1 px por lado).
  - Escritorio (1440): escena 240×84 a ×6 → 1440×504.
  - Tarjeta 1200×630: escena 100×90 a ×7 → 700×630. Historia 1080×1920: 120×84 a ×9 → 1080×756.
- La escena crece hacia los lados con el ancho (muro, columnas cada ±66/±114, estandartes): no se estira. Para anchos distintos de los exportados, portar el generador (`sceneT0` en `prototypes/throne-lib.js`, `scene1` en `prototypes/season-lib.js`): son funciones puras `(W, H, opt) → colores[]`.
- Trono 64×68 anclado abajo al centro: `x0 = W/2 − 32`, `y0 = H − 68`. **Hueco del retrato** (marco 44×44): `x = W/2 − 22`, `y = H − 62`.
- Elementos de interfaz con arte (medallas, banderas, sellos) también a escala entera: medalla 24×24 a ×2 (48) en listas, ×3 en el aviso de logro, ×16 en la tarjeta; bandera 12×8 a ×2 (24×16) junto al nombre, ×3/×4 en tarjetas.

## 2. Contorno
- 1 px, del tono `o` (el más oscuro) **de la propia rampa** del objeto. Nunca negro puro.
- Contorno exterior en los 4 vecinos (sin diagonales).
- El vello facial y los accesorios **no** se contornean sobre la piel (`ol: 'noskin'`): así no ensucian la cara.
- Detalles internos (ojos, boca, cejas, juntas) son del tono `o` sin contorno propio.

## 3. Sombreado
- Luz fija **arriba a la izquierda** (igual que el relieve de la interfaz).
- Base `b` en el cuerpo; `s1` (sombra) en los bordes que miran abajo o a la derecha y no arriba/izquierda. Brillo `h` solo en puntos (gemas, perlas, llama, filo de corona).
- Sin degradados, sin transparencias, sin antialias. Oscurecer = cambiar al tono inferior de la rampa. Los fundidos se hacen con **tramado** (Bayer 4×4 o patrón de 1 px), p. ej. el foco del trono vacío o la salida del rey en la coronación.
- Vello facial: base `b` si hay vello debajo, `s1` en el borde inferior.

## 4. Color
- Rampas de 3–5 tonos en **hex explícito** (`o, s2, s1, b, h`). Prohibido mezclar colores en tiempo de ejecución.
- **Núcleo fijo** (no cambia con la temporada): `palette-core.json` → oro, marfil, carmesí heráldico #9A1F35, plata, hierro, madera, azul de gemas, piedra, bloqueado, bronce, las 6 pieles y los 8 colores de pelo, rarezas y banderas.
- **Por temporada**: hasta **32 colores** propios (escena, trono, fondos de avatar, colores de capa, color de temporada). Ver `seasons/*.json`.
- Carmesí ≠ rubí: el carmesí es del arte; el rubí #E5484D es solo de estados de la interfaz.
- Oro en el arte: coronas, joyas y marcos altos. El Oro brillo #F7D57F es el `h` del oro.

## 5. Formas y centrado
- Simetría por reflejo: la mayoría de piezas se dibujan como media fila y se reflejan. En rejilla par (32, 24, 44) usar formas de **ancho par** para que el centro óptico caiga en el centro real.
- Centrar íconos e interiores ópticamente, no por caja (hubo un desplazamiento en Guardián III que ya está corregido).

## 6. Piezas
- **Avatar 32×32** por capas, de atrás adelante: `background → hairBack → cape → skin → expression → facialHair → hairFront → accessory → crown`. Generado por `lib/avatar-lib.js` (determinista por nombre + temporada). Reyes pasados: sin corona.
- **Marco de rango 44×44**, igual para todos los rangos: banda completa de **6 px** por lado; el avatar 32×32 va en (6, 6). Cambia el material y el detalle, nunca el grosor. Fotos y logos subidos usan la misma caja (pixelados a 32×32 o tal cual, a elección del usuario).
  - Plebeyo: madera · Caballero: hierro + tachones · Barón: plata · Conde: plata + gemas azules · Duque: oro + anillas · Emperador: oro + gemas carmesí/azules + tachones.
  - Marcos de temporada: Genesis (T0, piedra + gemas verdín + tachones oro), Cempasúchil (T1). Bloqueado: rampa `lock`.
- **Medalla 24×24**: aro (r ≤ 10,9 px) con el color de rareza, interior de piedra #3D3550 (r ≤ 7,9), icono encima. Bloqueada: aro `lock`, interior `lockIn`, silueta `lockIcon` (sin detalle). Rareza «De temporada»: el aro usa el color de la temporada de **origen**.
- **Bandera 12×8**: 20 propias. Resto: pastilla 12×8 #3D3550 con el código ISO en letras 3×5 #F3EDE2 (`country-pill-font.json`, generador en `lib/country-pill.js`).
- **Sello del reino 20×20** y **franja de piedra 32×12** (mosaico): toman la piedra (`stone`) de la temporada.

## 7. Revisión rápida
- ¿Escala entera? ¿Mismo píxel en todo el bloque? ¿Contorno del tono `o` de su rampa? ¿Luz arriba-izquierda? ¿Ningún color fuera de núcleo + temporada? ¿Sin alfa ni degradado? ¿Centrado óptico?
