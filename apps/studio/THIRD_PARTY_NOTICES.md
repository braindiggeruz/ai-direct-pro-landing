# Third-party notices — GPTBot.uz Studio

The studio ships these third-party libraries to visitors' browsers. React,
react-dom and scheduler are in the island's entry chunk
(`dist/assets/studio/studio-*.js`); pptxgenjs and jszip are in the lazy
deck-building chunk (`dist/assets/studio/pptxgen.es-*.js`), which loads only
when a visitor saves a presentation. Versions are pinned in `package.json`
and `package-lock.json`.

## React 19.2.7, react-dom 19.2.7, scheduler 0.27.0

- Project: <https://github.com/facebook/react>
- Copyright © Meta Platforms, Inc. and affiliates
- Licence: MIT (full text: `node_modules/react/LICENSE`)
- Used for: the generator form, hydrated over its prerendered markup
  (`src/main.tsx`, `src/tools/presentation/`).

## pptxgenjs 4.0.1

- Project: <https://github.com/gitbrent/PptxGenJS>
- Copyright © 2015-2022 Brent Ely
- Licence: MIT (full text: `node_modules/pptxgenjs/LICENSE`)
- Used for: writing the .pptx file in the browser (`src/pptx/build.ts`).
  Its Node-only paths (`node:fs`, `node:https`, `image-size`) are switched off
  by the package's own `browser` field and are not in the browser build.
  (`npm audit` reports image-size 1.2.1, a denial-of-service in its JXL, HEIF
  and ICNS parsers. It sits on that switched-off Node path, so it is not in
  the browser build and never runs.)

## jszip 3.10.2

- Project: <https://github.com/Stuk/jszip>
- Copyright © 2009-2016 Stuart Knightley, David Duponchel, Franz Buchinger,
  António Afonso
- Licence: dual, MIT or GPLv3 at the user's choice. **This project uses it
  under the MIT licence.** (Full text: `node_modules/jszip/LICENSE.markdown`.)
- Used for: the zip container of the .pptx, as a dependency of pptxgenjs.
- The browser build of jszip (`dist/jszip.min.js`) bundles:
  - pako 1.0.11 — © 2014-2017 Vitaly Puzrin and Andrei Tuputcyn — MIT and Zlib;
  - lie 3.3.0 — © 2014-2018 Calvin Metcalf, Jordan Harband — MIT;
  - immediate 3.0.6 and setimmediate 1.0.5 — © 2012 Barnesandnoble.com, llc,
    Donavon West, Domenic Denicola (and Brian Cavalier) — MIT;
  - readable-stream 2.3.8 (browser shim) and its helpers — MIT.

## Build-time only (not shipped)

Vite 8, @vitejs/plugin-react, Tailwind CSS 4 and @tailwindcss/postcss (MIT),
PostCSS (MIT) and TypeScript (Apache-2.0) build the island; the Tailwind CSS
output carries its own `/*! tailwindcss … MIT */` banner. react-dom/server
renders the form's static markup at build time (`src/tools/presentation/
static.ts`) and is not in the browser build.
