# Temporadas como datos

Cada temporada es un JSON en esta carpeta. **La T0 es la base**: define todos los assets por defecto. Las demás temporadas **solo declaran lo que reemplazan o añaden**; todo lo demás se hereda de la T0.

- `t0-genesis.json` — base (final). 32 colores.
- `t1-dia-de-muertos.json` — final. 31/32 colores.
- `t2-escarcha.json` — **provisional**: solo el arte de anuncio (escena T0 con paleta cambiada). Lista `todo` con lo que falta.
- `_template.json` — plantilla para crear una temporada nueva.

## Qué puede cambiar una temporada (y qué no)
| Cambia (arte) | No cambia nunca |
|---|---|
| Escena del trono (muro, suelo, decoración) | Interfaz: tokens, tipografía, componentes, textos |
| Trono (misma geometría 64×68, mismo hueco del retrato) | Paleta núcleo del arte (`pixel-art/palette-core.json`) |
| Corona del avatar y del cojín (opcional) | Pieles, peinados, colores de pelo, expresiones, accesorios |
| 5 fondos de avatar y 5 colores de capa | Marcos de rango (6) y las 13 medallas permanentes |
| Piedra (`stone`): sello, franja del pie, pedestales | Banderas, pastilla de país, íconos |
| Estandarte (`banner`) del retrato de fin de temporada | Reglas de precio y de juego |
| Color de temporada (`color`, token `--crown-season`) | |
| **Añade**: 1 marco exclusivo + 1 medalla «De temporada» | |

Las medallas y marcos exclusivos **no cambian después**: una medalla de la T0 se ve siempre con el aro verdín, aunque estemos en la T1. Un perfil puede mostrar coleccionables de varias temporadas a la vez.

## Cómo se aplica en la app
1. El servidor decide la temporada activa por fecha (`window.start/end`) y la escribe en `<html data-season="N">` (activa `--crown-season` de `tokens.css`).
2. Los componentes piden assets por clave, p. ej. `sceneSrc(season, '240x84', 'seat')` → `assets/scenes/t{season}/240x84-seat.svg`, con *fallback* a la T0 si la temporada no lo declara.
3. `avatar-lib.js` recibe `season` y cambia fondos, colores de capa y corona (`SEASON_AVATAR`). Añadir una temporada = añadir su entrada en `SEASON_AVATAR`.
4. Textos: `i18n/*.json → season.name[N]`, `season.dates[N]`, `season.nextDesc[N]`, `season.frame[N]`, `season.crown[N]`.

## Crear una temporada nueva (checklist)
1. Copia `_template.json` → `tN-clave.json`. Rellena `id`, `key`, `name`, `window`, `color`.
2. **Paleta**: máx. 32 colores propios, en rampas `o/s1/b(/h)` en hex. Comprueba que no repite tonos del núcleo con otro uso. Documenta el uso de cada color (`role`).
3. **Escena**: mismo contrato que T0 (`(W, H, opt) → colores[]`, `opt.frame` 44×44 en el hueco, `opt.bare`, `opt.spot`). Exporta 98×72, 240×84, 100×90, 120×84 en variantes `seat`, `empty`, `empty-spot` (y `bare` para 98×72 y 240×84).
4. **Trono**: 64×68, respaldo que enmarca el retrato en (10, 6) relativo al trono; exporta `thrones/tN.svg` y `tN-seat.svg` (66×74 con 1 px de margen).
5. **Corona** (opcional): capa 32×32 para el avatar (`crowns/avatar-tN-*.svg`) + sprite para cojín/perfil y su versión bloqueada.
6. **Marco exclusivo** 44×44 (banda de 6 px) + versión bloqueada. **Medalla** «De temporada» 24×24 on/off, aro con `color`.
7. **Avatar**: 5 fondos + 5 colores de capa (rampa `o/s1/b`); entrada en `SEASON_AVATAR` de `lib/avatar-lib.js`.
8. **Piedra** y **estandarte**: rampas `stone` (`o,s1,b,h,hh`) y `banner` (`o,s1,b,h`). Regenera sello y franja.
9. **Textos** en `en.json` y `es.json` (mismas claves).
10. Revisión: pasa la guía de `pixel-art/STYLE.md` y compara Portada, Perfil, Compartir y Reino con `?season=N` en `prototypes/`.
