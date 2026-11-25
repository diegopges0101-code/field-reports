# Selector de colores del PDF (v2.12.2)

## Por qué no se aplicaba el cambio anterior

El `sw.js` que te envié para la v2.12.1 incluía en su lista tres ficheros de la v2.11/v2.12 (`js/multi.js`, `js/merge.js` y `js/views/conflicts.js`). Si en tu web todavía no están publicados, el navegador no puede instalar el `sw.js` nuevo y sigue usando la copia guardada de la versión anterior, con el `pdf.js` de siempre. Lo he reproducido: con ese `sw.js`, sobre la v2.10, la actualización no llega a instalarse.

El `sw.js` nuevo ya no se bloquea si faltan esos ficheros. Lo he probado sobre la v2.10 y sobre la v2.12.

## Qué cambia

En el paso final del informe, en la tarjeta **PDF**, hay un selector **«Colores del PDF»** con dos opciones:
- **Original (azul)**
- **Blanco, negro y grises**

La elección se recuerda en cada dispositivo y se aplica a Compartir, Descargar, Vista previa y al PDF que se adjunta al correo. El texto del selector sale en español, inglés o portugués, según el idioma de la app.

## Ficheros y dónde va cada uno

Todos van en la carpeta publicada donde está `index.html`, sustituyendo a los que ya tienes:

| Fichero | Dónde va |
| --- | --- |
| `sw.js` | Junto a `index.html` |
| `js/pdf.js` | Dentro de la carpeta `js/` |
| `js/views/outputs.js` | Dentro de la carpeta `js/views/` |

Funcionan tanto si tienes publicada la v2.10 como la v2.11 o la v2.12. No hay que tocar Apps Script. Si quieres, cambia `APP_VERSION` a `'2.12.2'` en tu `js/config.js` para que se vea la versión.

## Después de subirlos

1. Abre la app con conexión y **ciérrala y vuelve a abrirla una vez**. La primera apertura descarga la versión nueva y la segunda ya la usa.
2. Si en el ordenador sigue viéndose la versión anterior, recarga con Ctrl+Shift+R.
3. Comprueba que en la tarjeta PDF aparece «Colores del PDF». Si no aparece, el navegador todavía está usando la versión anterior.

En `ejemplos/` tienes el mismo informe con las dos paletas y una captura del selector.
