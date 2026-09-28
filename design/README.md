# /design · Crown (Rey de la colina) — fuente de verdad visual

Diseño **alta fidelidad** aprobado: colores, tipografía, medidas, estados y movimiento son finales. Los archivos `.dc.html` son **prototipos de referencia** hechos en HTML, no código para copiar: la tarea es recrearlos en el stack del proyecto (Next.js App Router · TypeScript · Tailwind · Supabase · next-intl) con sus patrones. La especificación técnica y el esquema de base de datos propios mandan en lógica y datos; esta carpeta manda en lo visual.

Marca provisional «Crown». Solo USD. EN (principal) + ES. Solo modo oscuro.

## Estructura
```
design/
├─ README.md                 este archivo
├─ tokens/
│  ├─ tokens.css             variables CSS (paleta de interfaz, rareza, tipo, escala, espacios, radios, relieves, foco)
│  ├─ tokens.json            los mismos valores en JSON
│  ├─ tailwind.preset.js     preset para Tailwind v3
│  └─ tailwind-v4.css        bloque @theme para Tailwind v4
├─ pixel-art/
│  ├─ STYLE.md               guía: contorno, sombreado, escalado entero, piezas, revisión
│  ├─ palette-core.json      paleta NÚCLEO del arte (fija): rampas, pieles, pelo, rarezas, rangos, banderas
│  └─ country-pill-font.json letras 3×5 para la pastilla de país
├─ assets/                   SVG nítidos (1 unidad = 1 píxel de arte; escalar en múltiplos enteros)
│  ├─ avatar/                piezas 32×32 por capa: background (T0/T1), hair-back, skin, expression, facial-hair, cape, hair-front, accessory
│  │  └─ samples/            avatares completos de referencia (pruebas de regresión de avatar-lib)
│  ├─ crowns/                coronas del avatar (3 base + Calavera T1), sprites de cojín/perfil (+ bloqueadas), ícono 16
│  ├─ frames/                6 marcos de rango 44×44 + Genesis (T0) y Cempasúchil (T1), con versión bloqueada
│  ├─ medals/                14 medallas 24×24, *-on / *-off
│  ├─ thrones/               tronos T0/T1 (66×74): vacío con corona y «seat» (hueco del retrato en 11,12)
│  ├─ scenes/                escenarios T0/T1 a 98×72, 240×84, 100×90, 120×84 (seat · empty · empty-spot · bare) + T2 provisional
│  ├─ flags/                 20 banderas 12×8 + pill/ (pastilla con código, ejemplos)
│  ├─ seal/                  sello del reino 20×20 y franja de piedra 32×12 (mosaico) por temporada
│  └─ icons/                 íconos pixel monocromos (currentColor) + social/ (5 logos) + icons.json (color por defecto)
├─ lib/
│  ├─ avatar-lib.js          módulo ES independiente: avatar determinista por nombre + temporada → SVG (Node y navegador)
│  └─ country-pill.js        pastilla de país → SVG
├─ seasons/
│  ├─ t0-genesis.json        temporada base
│  ├─ t1-dia-de-muertos.json qué reemplaza y añade la T1
│  ├─ t2-escarcha.json       PROVISIONAL (solo arte de anuncio)
│  ├─ _template.json         plantilla
│  └─ TEMPLATE.md            cómo funcionan las temporadas y cómo crear una
├─ screens/SCREENS.md        todas las pantallas y sus estados, con reglas por pantalla
├─ motion/MOTION.md          cada animación: duración, curvas, fotogramas y versión reducida
├─ i18n/en.json · es.json    textos de interfaz, mismas claves (formato ICU para next-intl)
├─ share/SHARE.md            tarjetas 1200×630 y 1080×1920 + correo, con zonas variables y medidas
└─ prototypes/               pantallas en HTML (abrir en el navegador) + librerías que usan
```

## Cómo usar cada cosa
- **Tokens**: importa `tokens.css` en `app/globals.css` y el preset (v3) o `tailwind-v4.css` (v4). Clases resultantes: `bg-crown-velvet`, `text-crown-muted`, `font-pixel`, `shadow-relief-gold`, `h-button`… El relieve escalonado es un `box-shadow` en 4 lados: el elemento necesita `margin: 4px` (o hueco equivalente) para no recortarlo.
- **Fuentes**: `next/font/google` → Manrope (400, 500, 700) y Pixelify Sans (500, 700). Pixelify **solo** en marca, reloj, precio, cifras de Hazañas y etiquetas de juego pequeñas.
- **Assets**: SVG con `viewBox` = tamaño en píxeles de arte. Muéstralos con `width/height` = tamaño × escala entera y `style="image-rendering:pixelated"`. Composición del retrato: marco 44×44 + avatar 32×32 en (6,6) + (opcional) corona ya incluida en el avatar.
- **Avatares**: `import { avatarSVG } from '@/design/lib/avatar-lib.js'`. Mismo nombre + temporada ⇒ mismo SVG. `crown:false` para reyes pasados. Los SVG de `assets/avatar/samples/` sirven de test de regresión (`avatarSVG(name,{season}) === archivo`).
- **Textos**: `i18n/*.json` por espacios (`common`, `season`, `home`, `homeStates`, `payment`, `coronation`, `achievement`, `profile`, `editProfile`, `realm`, `login`, `share`, `medals`, `rarity`, `rank`, `country`, `social`). Placeholders ICU: `{price}` (siempre formateado en USD), `{name}`, `{n, plural, …}`, `{days, plural, …}`. Datos de ejemplo (nombres de reyes, mensajes, duraciones) viven solo en los prototipos, no en i18n. Los textos de temporada son `season.*[id]`.
- **Temporadas**: ver `seasons/TEMPLATE.md`. El servidor elige la temporada por fecha y la pone en `<html data-season>`; cada asset se busca en la temporada y, si no lo declara, en la T0.

## Qué es estático, qué es en tiempo real y qué genera el servidor
**Estático** (build / CDN, caché inmutable)
- Tokens, fuentes, íconos, banderas, marcos, medallas, coronas, tronos, escenarios de los tamaños exportados, sellos, textos i18n, archivos de temporada.
- Toda la interfaz de perfil, reino, editar perfil, login y compartir salvo los datos que la llenan.

**Tiempo real** (Supabase Realtime sobre la fila del trono y la tabla de eventos; el cliente nunca «inventa» estado)
- **Reloj del rey**: el servidor da `reign_started_at`; el cliente cuenta cada 1 s localmente (sin polling). Corregir con la hora del servidor al conectar.
- **Precio**: derivado de precio de entrada + tiempo (−2 %/h, suelo $5). El cliente lo recalcula en local; el valor que se cobra lo fija siempre el servidor en la reserva.
- **Estado de reserva**: `reserved_by / reserved_until` (5:00). Cambia la portada para todos (estado «Reserva ajena») y congela el precio. Expira en el servidor.
- **Feed «Pregones del heraldo»**: inserciones en vivo, arriba, sin animación.
- **Coronación**: evento de «nuevo rey» → todos los clientes que estén mirando reproducen la animación de 1,8 s; quien llega tarde ve el estado final. Nombre, reloj y precio cambian al aterrizar.
- **Logro desbloqueado**: evento por usuario → aviso (solo a quien lo gana).
- También en vivo: el bloque «quién reina ahora» del perfil propio y la línea de sucesión.

**Generado en el servidor**
- **Avatares**: `avatar-lib.js` en un Route Handler (p. ej. `/api/avatar/[username]?season=&crown=`), SVG con caché larga por (nombre, temporada, corona). El retrato enmarcado (marco de rango + avatar) igual.
- **Fotos/logos subidos**: validar tipo y tamaño (PNG/JPG/WebP ≤ 5 MB), guardar el original y la versión pixelada 32×32 (Supabase Storage); el usuario elige cuál se muestra.
- **Tarjetas para compartir** (1200×630 y 1080×1920) y **cabecera del correo** «destronado»: con la escena de la temporada activa (ver `share/SHARE.md`).
- **Moderación** del nombre/link/mensaje antes de cobrar (estado «rechazado» del modal de pago).
- **Correo** «You were dethroned» y enlace mágico de login (15 min).
- Escenas de anchos no exportados, si hicieran falta: portar los generadores (`sceneT0`, `scene1`) de `prototypes/`.

## Prototipos
Abrir `prototypes/<Pantalla>.dc.html` en un navegador (necesita la carpeta completa; carga Google Fonts). Parámetros: `?season=0|1`. En Compartir, `?zones=0` oculta las zonas variables. Los controles de demostración dentro de los prototipos (bucles, selector de rareza, velocidad de coronación, filas numeradas de estados) son de revisión, no de producto.

## Excluido de esta entrega
- Selector flotante de temporada (herramienta de revisión) — eliminado de `prototypes/season-lib.js`.
- `review-audit.js` (auditoría de revisión) y los selectores «Saltar a un estado» (Editar perfil) y «Redes en p1» (Perfil).
- Exploraciones descartadas (2a del sistema base, estilos pixel 3b/3c) y la hoja de comparación de la Temporada 1.

## Pendiente / a verificar
- **Logos de redes** (`assets/icons/social/`) dibujados de memoria: sustituir por los de los kits de marca oficiales.
- **T2 Escarcha**: solo arte provisional de anuncio.
- **«Corona Génesis»** (24 h en la T0): propuesta sin aprobar; no incluida.
- Mini evento de Halloween dentro de la T0: sin arte definido.
- Subida de precio tras una coronación: el prototipo muestra $34 → $38; la regla exacta es de la especificación técnica.
- Punto de corte móvil/escritorio no fijado por el diseño (se diseñó a 390 y 1440): proponemos `lg` (1024 px).
