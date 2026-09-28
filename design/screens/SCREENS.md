# Pantallas y estados

Todas diseñadas a **390 px (móvil, prioritario)** y **1440 px (escritorio)**, EN/ES, T0/T1. Los prototipos (`prototypes/*.dc.html`) se abren directamente en el navegador; el conmutador EN/ES funciona; `?season=1` cambia a la T1. En cada archivo, el texto en español de cabecera y los rótulos numerados son anotaciones de diseño, no producto.

Reglas comunes
- Barra superior: «Crown» (Pixelify 28/700) + pastilla de temporada (#14111C, alto 28, 14 px #A89FB8) · conmutador EN/ES segmentado (activo Pergamino sobre #2A2438 con `inset-segment-on`, nunca oro) · «Sign in» secundario. Alto 72 (escritorio) / 56 (móvil), fondo #1E1A29, `bar-bottom`.
- Un único botón dorado por pantalla, y solo para acciones de corona (tomarla, recuperarla). Iniciar sesión, guardar, compartir: secundarios o Pergamino.
- Errores y estados: siempre ícono + texto; rubí para error, esmeralda para éxito. Los errores dicen qué pasó, por qué y cómo corregirlo; en pagos, «no se ha cobrado».
- Zona táctil ≥ 44 px (pseudo-elemento si el control es menor). Foco visible en todo.
- Todo ancho fijo se mide con el texto en español (el más largo).

---

## 1. Portada — `Portada.dc.html`
Salón del trono. Orden en móvil: **nombre del rey → reloj → precio + botón → mensaje**. En móvil, la acción cabe siempre en el primer pantallazo (390×664).
- Héroe: escena del trono a sangre (98×72 ×4 / 240×84 ×6) con el rey en el hueco del retrato (avatar + marco de rango + corona).
- Rey: nombre, bandera, pastilla de rango con muestra del material. Reloj «Reigning for» (Pixelify; celdas con `clock-cell` en escritorio). Precio Pixelify oro + «↓ Dropping 2% every hour» + «Floor price $5». Botón «Take the crown for $X». Mensaje del rey (80 car.) + link + botón discreto «Report message».
- Debajo: línea de sucesión, salón de la fama (más largo/más corto), feed **«Pregones del heraldo»** (una línea: bandera+nombre | frase corta | duración Pixelify | hace; móvil sin «hace», cabecera «Last 24 hours»).
- Pie en franja de piedra (`stone-band` de la temporada, 2 tonos) + sello del reino 20×20. Enlaces legales.
- Reyes pasados se muestran **sin corona**.

## 2. Portada · estados — `Portada Estados.dc.html`
Solo cambia el héroe; el resto de la portada sigue igual.
1. **Reserva ajena** — alguien está pagando: el precio se congela 5:00; el botón se sustituye por un aviso con cuenta atrás y barra de 20 tramos (15 s c/u). La corona tiembla (ver MOTION). Si el pago falla o vence, vuelve a normal.
2. **Trono vacío** (inicio de temporada) — escena `empty-spot`: salón oscurecido con tramado y foco sobre el trono; la corona en el cojín. Titular en lugar del nombre; reloj a 0 en escritorio; precio $5; botón «Be the first…».
3. **Precio mínimo** — tras ~95 h, $5: etiqueta dorada junto al precio; la flecha deja de bajar y choca con la línea.
4. **Error de pago** — al volver de un pago fallido: aviso rubí (ícono + texto) en lugar del indicador de precio; el botón no se mueve; «no se ha cobrado».
5. **Reserva expirada** — tu reserva venció y otro tomó la corona: cambia el rey, reloj casi a 0, precio nuevo; aviso de una línea; botón con el precio nuevo.

## 3. Modal de pago — `Modal de Pago.dc.html`
Hoja inferior en móvil / modal en escritorio (`shadow-modal`).
1. **Formulario** — el precio queda reservado 5:00 desde que se abre (barra de 20 tramos). Campos: nombre visible (máx. 24; cambia el avatar generado en vivo), país (detectado y editable; 20 banderas + pastilla), link (máx. 80), mensaje (máx. 80, contador). Vista previa en vivo del trono. Todo rey nuevo entra como **Plebeyo** (marco de madera). Nota: «Payments are final. You're paying for visibility, not a prize.»
2. **Rechazado por moderación** — antes de cobrar. Aviso rubí con qué pasó / por qué / cómo corregirlo / sin cargo; campo afectado con `inset-field-error` y línea de ayuda. La reserva sigue; el botón vuelve a estar activo. Reglas del prototipo (la real es del servidor): acortadores en el link (bit.ly, tinyurl, t.co, goo.gl, ow.ly, is.gd, cutt.ly, rb.gy) → rechazo de link; URLs o dominios dentro del mensaje → rechazo de mensaje.
3. **Pago completado** — ya reinas y el reloj corre; ahora se pide la sesión (ver 9). Saltarlo no quita el reinado. La portada reproduce la coronación para todos.

## 4. Coronación — `Coronacion.dc.html`
Animación de 1,8 s en canvas sobre la escena (reducido: fundido 0,4 s). Detalle en `motion/MOTION.md`. Nombre, reloj y precio cambian al aterrizar la corona.

## 5. Logro desbloqueado — `Logro Desbloqueado.dc.html`
Aviso: móvil abajo a lo ancho; escritorio abajo-derecha, 400 px. Medalla con rebote ×1→×2→×4→×3, título, rareza, descripción, «Share» (copia el enlace → «Link copied»), cerrar. 6 s con barra de 20 tramos, pausa con hover/foco, cola si hay varios. Sin oro salvo la rareza legendaria. `aria-live`. La fila «por rareza» es ilustrativa: en producto solo aparece al **ganar** una medalla.

## 6. Perfil público — `Perfil.dc.html`
- **p1 · veterano (Duque, priya_ships), vista pública**: busto ×3 móvil / ×5 escritorio con marco de rango; barra de rango en Pergamino (no oro); **Hazañas** (cifras Pixelify grandes, número + unidad); **Crónica de reinados** (numeral romano, frase, duración); rival; vitrina de 3 medallas + colección on/off; redes sociales (fila de íconos 44×44: bajo el link en móvil, sobre el link en escritorio; 0–5 redes).
- **p2 · nuevo (maru.jpg, 11 s), vista propia**: en vez de ceros, lo que sí ganó (Fundador, Rey de un minuto), un rival con marcador 0:1 y **«Within reach»**: 3 metas con progreso. Bloque de arriba con gancho de vuelta: quién reina, precio en vivo, botón dorado. Sin redes → «Edit profile».
- Coleccionables de otras temporadas se muestran con su arte de origen.

## 7. Editar perfil — `Editar Perfil.dc.html`
Móvil: una columna con barra de guardar fija abajo. Escritorio: menú de secciones a la izquierda, formulario, vista previa en vivo y panel de guardar a la derecha.
- **Avatar**: pixel por capas (flechas por capa, Aleatorio, Restablecer) o **foto/logo** (PNG/JPG/WebP, ≤ 5 MB) mostrado **pixelado a 32×32** o **tal cual**, siempre en la caja 44×44 del marco.
- **Nombre** 3–24, letras/números/`. _ -`, «ocupado». **País**: select nativo + bandera. **Link** con moderación → rechazado. **Redes** (X, Instagram, GitHub, LinkedIn, YouTube): admiten usuario o enlace pegado; validación en `prototypes/social-lib.js`. **Vitrina** 3 medallas. **Privacidad**. **Avisos** (destronado, precio por debajo de $X, 5–999). **Idioma**.
- **Guardar** (Pergamino, sin oro): sin cambios (deshabilitado) · con cambios («N unsaved changes») · guardando · guardado (esmeralda) · error (rubí + reintentar) · inválido («N fields to fix», salta al primero).
- ⚠ Logos de redes dibujados de memoria: verificar contra los kits de marca oficiales antes de producción.

## 8. Reino — `Reino.dc.html` (pestañas funcionales)
1. **Historia del reino** (`#h`) — línea de tiempo de más reciente a más antiguo, separadores por día. Tamaño según duración: < 3 h ×1 en una línea; ≥ 3 h ×2; ≥ 10 h ×3 (×4 escritorio) sobre superficie. Solo el rey actual lleva corona y nodo dorado. Mensajes en el idioma original.
2. **Salón de la fama** (`#f`) — 4 pestañas + filtro Temporada / Todos los tiempos. Podio pixel (pedestales de piedra con ribete oro/plata/bronce y número; ×2 móvil / ×3 escritorio). En Países, bandera en vez de avatar. Hasta la T1, «All time» = T0 y se indica.
3. **Fin de temporada** (`#e`) — retrato-estandarte del Rey de la Temporada (marco + corona, ×4/×6; etiqueta «King of the Season» en oro), podio, cifras de la temporada, anuncio de la siguiente con su arte (T0→T1 real; con `?season=1`, T1→T2 provisional), «Remind me», compartir. Todos los reyes de la T0 conservan Fundador y el marco Genesis.

## 9. Inicio de sesión — `Inicio de Sesion.dc.html`
Hoja inferior en móvil / modal 440 en escritorio. Sin contraseña, un paso, sin «registrarse» aparte. Sello pequeño sobre los botones.
1. **Interactivo** — Google, X (secundarios del mismo peso) · «or» · correo + «Email me a magic link». Carga en el botón con 3 puntos pixel. Correo inválido: rubí + ícono.
2. **Tras pagar** — kicker «Just crowned · you're reigning» (único oro), avatar, contexto. «Not now» cierra; el reinado cuenta igual; no vuelve a salir hasta que te destronen.
3. **Enlace enviado** — aviso esmeralda, correo, «Use a different email», reenviar a los 30 s. El enlace dura 15 min.

## 10. Compartir y correo — `Compartir y Correo.dc.html`
Ver `share/SHARE.md`.

## Estados vacíos y errores (resumen)
| Dónde | Estado |
|---|---|
| Portada | Trono vacío (inicio de temporada), precio mínimo, reserva ajena, reserva expirada, error de pago |
| Pago | Rechazo por moderación (link / mensaje), procesando, completado |
| Perfil | Jugador nuevo (sin ceros; metas «Within reach»), sin redes → «Edit profile» |
| Editar perfil | Nombre corto/caracteres/ocupado, imagen de tipo o tamaño inválido, link rechazado, red inválida, precio fuera de 5–999, guardado fallido |
| Login | Correo inválido, enlace enviado, reenviar bloqueado 30 s |
| Reino | «All time» igual a la temporada (antes de la T1) |

## Sistema base — `Sistema Base.dc.html`
Hoja de componentes 2b (la elegida): paleta, tipografía, botones con sus 4 estados, campos, etiquetas de rango y país, tarjeta base, conmutador de idioma. Decisión acordada: base 2b **con las etiquetas (rango, país, rareza) de la 2a**; la hoja solo muestra la 2b, así que para las etiquetas manda lo que se ve en las pantallas (p. ej. Perfil, Reino).
