# Diccionario Vine — webapp de búsqueda

Webapp *mobile first* para consultar el **Diccionario Expositivo de Palabras del Antiguo y del Nuevo Testamento Exhaustivo** (W. E. Vine).

## Funciones

- Búsqueda instantánea mientras escribes, sin importar tildes ni mayúsculas, con corrección de errores («¿Quisiste decir…?»).
- Modos: **Todo**, **Palabra** (lemas), **Texto completo**, **Griego / Hebreo** (escritura original, transliteración o número Strong `G26`, `H7965`) y **Cita bíblica** (`Jn 3:16`, `Romanos 8`).
- Texto completo avanzado: frase exacta `"pan de vida"`, exclusión `-ley`, prefijo `salv*`.
- Filtro por testamento (AT / NT), índice alfabético, palabra al azar.
- Artículos con palabras originales, números Strong, referencias cruzadas y citas bíblicas enlazadas; resaltado de lo buscado.
- Favoritos, historial, tema claro/oscuro, tamaño de letra, compartir y copiar.
- Atajos de teclado, deslizamiento entre artículos en móvil, búsqueda por voz.
- PWA instalable y funciona sin conexión.

## Estructura

```
tools/build-data.js   # extrae los artículos del PDF -> webapp/data/*.json
tools/serve.js        # servidor local de pruebas
webapp/               # la app estática (lo que se publica)
```

## Regenerar los datos

Requiere Node.js y `pdftotext` (poppler):

```bash
node tools/build-data.js diccionario-biblico-vine-vine.pdf
```

## Probar en local

```bash
node tools/serve.js
```

Abre http://localhost:8080. Si `vine.pdf` está junto a la app, cada artículo muestra un enlace a su página del PDF.
