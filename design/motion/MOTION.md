# Movimiento

Reglas generales
- El arte pixel se anima **en la cuadrícula de la escena**: posiciones redondeadas al píxel de arte (×4 móvil, ×6 escritorio). Nada de subpíxel, rotación, desenfoque ni alfa sobre el arte. Fundidos del arte = tramado.
- La interfaz se mueve en **pasos de 4 px** cuando se desplaza (misma rejilla que el relieve).
- `prefers-reduced-motion: reduce` activa siempre la versión reducida. Sin toggle propio en producción (los de los prototipos son de revisión).
- Todo lo que anuncia un cambio de estado (coronación, logro, error) se anuncia también por `aria-live="polite"`.

Curvas usadas: `easeOutCubic(u) = 1 − (1−u)³` · `easeInQuad(u) = u²` · `easeInOutSine(u) = 0,5 − 0,5·cos(πu)` · `steps(1, end)`.

---

## 1. Coronación · 1,8 s (prototipo: `Coronacion.dc.html`)
Se reproduce para **todos** los que miran la portada cuando alguien paga. Se dibuja en un `<canvas>` del tamaño de la escena (98×72 / 240×84) escalado con `image-rendering: pixelated`. Base: escena `bare` (cojín sin corona).

| t (ms) | Qué pasa | Curva |
|---|---|---|
| 0–350 | Rey anterior (marco + avatar, con la corona puesta) sale a la izquierda hasta x = −14 (móvil) / 14 (escritorio); el nuevo entra desde la derecha (x = W) hasta el hueco del retrato | easeOutCubic |
| 350–500 | La corona se eleva 6 px sobre la cabeza del rey anterior | easeOutCubic |
| 500–1150 | Vuelo en parábola hasta la cabeza del nuevo rey; altura extra 9 px (móvil) / 22 px (escritorio) | x: easeInOutSine; y: parábola 4u(1−u) |
| 560–1270 | Estela: 2 chispas de 1 px a 60 ms (#F7D57F) y 120 ms (#C9962C) de retraso | — |
| 1150–1260 | Baja y se pasa 1 px | easeInQuad |
| 1260–1300 | Rebote: 1 px abajo → posición final | — |
| **1300** | **Aterriza.** Nombre, reloj (vuelve a 0) y precio (sube) cambian en este instante | — |
| 1300–1380 | Destello: la corona pasa a su rampa clara (b→#F7D57F, s1→#F2C14E, o→#C9962C) | — |
| 1300–1520 | 6 rayos de 1 px hacia arriba y a los lados (nunca hacia la cara), de 3 a 12 px, #F7D57F/#F2C14E | lineal |
| 1300–1800 | Confeti: 24 (móvil) / 34 (escritorio) partículas de 1–2 px, colores #F2C14E #F7D57F #B3263B #F3EDE2 #4A90E2 #C9962C; vx ±45/±70 px/s, vy −30…−80 / −40…−110 px/s, gravedad 240/300 px/s², vida 300–500 ms, aleteo cada ~70 ms | física |
| 1300–1800 | El rey anterior se disuelve con tramado Bayer 4×4 (sin alfa) | lineal |

Reducido: **fundido de 400 ms** de la escena final sobre la inicial (única excepción al «sin alfa»: es un fundido de pantalla completa). Los datos cambian a los 200 ms.

## 2. Logro desbloqueado · aviso (prototipo: `Logro Desbloqueado.dc.html`)
Móvil: abajo a lo ancho. Escritorio: abajo a la derecha, 400 px. Solo aparece cuando el usuario **gana** una medalla. Cola: si llegan varios, uno detrás de otro con 700 ms entre ellos.

| t (ms) | Qué pasa |
|---|---|
| 0–200 | Sube 24 px en 6 pasos de 4 px (uno cada 33 ms); opacidad del contenedor 0→1 en 150 ms |
| 160 / 220 / 280 / 380 | Medalla ×1 → ×2 → ×4 → ×3 (solo escalas enteras; se queda en ×3) |
| 280–460 | 4 chispas (diagonales) en 3 pasos de 60 ms; radio 36 + 6·paso px; color de rareza, el último paso en #F3EDE2 |
| 220–360 | Texto: opacidad 0→1 y entra 12 px desde la derecha en pasos de 4 px |
| hasta 6000 | Permanece 6 s. Barra de 20 tramos que se vacía. **Pausa** con hover o foco |
| 6000–6200 | Sale: baja 24 px en pasos de 4 px + opacidad 1→0 |

Reducido: fundido de 200 ms de entrada y de salida, medalla ya a ×3, sin rebote, sin chispas, sin desplazamiento.

## 3. Portada
- **Reloj del rey**: cambia cada 1 s (sin animación de dígitos). Mismo comportamiento en reducido.
- **Flecha de bajada de precio** (junto a «Dropping 2% every hour»): `translateY 0 → 2 → 4 → 0 px`, 2,4 s, `steps(1, end)`, infinito. Reducido: estática.
- **Precio**: cambia sin animación cuando baja (cada hora) o sube (coronación).
- **Reserva ajena**: la corona tiembla 1 px de escena a cada lado cada 70 ms en ráfagas de ~0,5 s, con pausa de 1,4 s. Reducido: sin temblor. La barra de 20 tramos (15 s cada uno) se vacía de golpe, tramo a tramo, igual en reducido.
- **Feed «Pregones del heraldo»**: las entradas nuevas aparecen arriba sin animación de entrada (evita movimiento continuo en la pantalla más vista).
- **Precio mínimo**: la flecha se queda quieta tocando la línea.

## 4. Formularios y estados
- **Modal de pago**: aparece sin animación (o fundido 150 ms). Procesando: botón con texto de carga, ~1,1 s en el prototipo (el real depende del pago). Rechazo: el aviso rubí aparece en su sitio sin desplazar el botón.
- **Inicio de sesión**: carga en el propio botón con **3 puntos pixel** que se encienden en secuencia cada 250 ms. Reducido: los 3 puntos fijos. «Reenviar» se habilita a los 30 s (cuenta atrás visible).
- **Editar perfil**: guardar → «Guardando…» → «Guardado» (esmeralda, ícono) o error (rubí, ícono, reintentar). Sin animaciones más allá del cambio de estado.
- **Hover/pulsado de botones**: instantáneos (sin `transition`). Pulsado = relieve invertido + `padding-top: 4px` (el texto baja 4 px).
- **Foco**: anillo 2 px #F3EDE2, instantáneo.

## 5. Tiempos del prototipo que NO son de producto
`PRE = 700 ms` y `HOLD = 1700 ms` de la coronación, los bucles de demo y los selectores de velocidad/modo son solo de revisión.
