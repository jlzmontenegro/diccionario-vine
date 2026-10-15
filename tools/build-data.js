#!/usr/bin/env node
/*
 * Construye los datos de la webapp a partir del PDF del Diccionario Vine.
 *
 * Uso:
 *   node tools/build-data.js [ruta-al-pdf | ruta-al-txt]
 *
 * Requiere `pdftotext` (poppler) en el PATH si se pasa el PDF.
 * Genera:
 *   webapp/data/index.json   -> lemas, testamento, página y palabras originales
 *   webapp/data/bodies.json  -> texto de cada artículo
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const input = process.argv[2] || path.join(ROOT, 'diccionario-biblico-vine-vine.pdf');
const outDir = path.join(ROOT, 'webapp', 'data');

function loadText(file) {
  if (/\.txt$/i.test(file)) return fs.readFileSync(file, 'utf8');
  const tmp = path.join(os.tmpdir(), 'vine-raw-' + process.pid + '.txt');
  execFileSync('pdftotext', ['-enc', 'UTF-8', file, tmp]);
  const t = fs.readFileSync(tmp, 'utf8');
  fs.unlinkSync(tmp);
  return t;
}

// ---------------------------------------------------------------------------
// Limpieza de líneas
// ---------------------------------------------------------------------------

// Notas al pie con abreviaturas de versiones bíblicas que se repiten por página.
const VERSION_NAMES = [
  'Biblia de Jerusalén \\(1967\\)', 'La Biblia de las Américas \\(1986\\)', 'Biblia Latinoamericana \\(1972\\)',
  'Reina Valera Actualizada \\(1989\\)', 'Nueva Reina Valera \\(1990\\)', 'La Biblia Versión Popular \\(1979\\)',
  'Reina Valera \\(1995\\)', 'Reina Valera Revisada \\(1960\\)', 'Biblia Nácar-Colunga \\(1958\\)',
  'Reina Valera \\(revisión de 1909\\)', 'Reina Valera \\(revisión de 1977\\)', 'La Biblia al día(?:<\\$IDía>)? \\(1979\\)',
  'Nueva Versión Internacional \\(1995\\)', 'Santa Biblia \\(Paulinas\\)', 'King James Version \\(1945\\)',
  'Biblia Bover-Cantera \\(1953\\)', 'Sagrada Biblia \\(Herder \\(1963\\)\\)?', 'Versión Moderna de H\\.B\\. Pratt \\(revisión de 1923\\)',
  'Versión Hispanoamericana', 'Nueva Biblia Española \\(Cristiandad; 1975\\)', 'Textus Receptus', 'Septuaginta', 'Dios Habla Hoy[^)]*?\\(\\d{4}\\)',
];
const FOOT_RE = new RegExp('(?:^|\\s)(?:\\S{1,8} )?(?:' + VERSION_NAMES.join('|') + ')', 'g');
const MARK_NOTES = [
  /¶ ¶ Indica que en ese artículo o subdivisión de artículo están mencionadas todas las veces que aparece la palabra griega bajo consideración\.?/g,
  /† † Indica que la palabra bajo consideración \(preposición, conjunción o partícula\) no se define en el diccionario\.?/g,
];

function isFootnote(line) {
  if (!line) return false;
  let r = line;
  for (const re of MARK_NOTES) r = r.replace(re, ' ');
  if (r === line && !/[A-Z]/.test(line)) return false;
  r = r.replace(FOOT_RE, ' ');
  return r.trim() === '' && r !== line;
}

// Hebreo extraído con marcas bidi: "(5800 ,‫)עַַזַב‬" -> "(עזב, 5800)"
function fixHebrew(s) {
  return s
    .replace(/\((\d+) ?,([^)]{0,4})\)([֐-׿יִ-ﭏ‪-‮ ]*[֐-׿יִ-ﭏ])[‪-‮]?(?=(.?))/g, (_, n, x, w, next) => {
      x = x.replace(/[‪-‮\s]/g, '');
      const marks = x.replace(/[^֑-ׇ]/g, '');
      const rest = x.replace(/[֑-ׇ]/g, '');
      const word = (w + marks).replace(/[‪-‮\s]/g, '');
      return '(' + word + ', H' + n + ')' + (rest ? ' ' + rest : '') + (/[\wñ«˒˓]/.test(next) && !rest ? ' ' : '');
    })
    .replace(/[‪-‮‎‏]/g, '')
    // signos vocálicos duplicados por la extracción
    .replace(/([ְ-ׇ])\1+/g, '$1');
}

// ---------------------------------------------------------------------------
// Detección de estructura
// ---------------------------------------------------------------------------
const UP = 'A-ZÁÉÍÓÚÑÜ';
const HEAD_RE = new RegExp(`^[${UP}¡¿][${UP}0-9 ,;()\\-'’.¡!¿?/]*[${UP})!?]$`);
const SUB_RE = /^(?:[A-H]\. )?(?:Nombres?|Verbos?|Adjetivos?|Adverbios?|Participios?|Pronombres?|Preposiciones?|Conjunci[óo]n(?:es)?|Part[íi]culas?|Interjecci[óo]n(?:es)?|Expresi[óo]n(?:es)?|Frases?|Sustantivos?|Otros?)(?:[ ,y]+(?:Nombres?|Verbos?|Adjetivos?|Adverbios?|Participios?|Pronombres?|Preposiciones?|nombres?|verbos?|adjetivos?|adverbios?|participios?|y|o|e))*\.?$/;
const SUB2_RE = /^[A-H]\. [A-ZÁÉÍÓÚ][a-záéíóúñ]+(?: [a-záéíóúñ]+){0,4}\.?$/;
const LETTER_RE = new RegExp(`^[${UP}]$`);

function isHeadword(line) {
  if (line.length < 2 || line.length > 90) return false;
  if (!HEAD_RE.test(line)) return false;
  const letters = line.replace(new RegExp(`[^${UP}]`, 'g'), '');
  return letters.length >= 2;
}

// Línea de referencia cruzada completa: "Véanse SANAR, SANIDAD, SANO"
const XREF_END = /^(?:V[eé][aá]n?se)\b.*[A-ZÁÉÍÓÚÑÜ)]$/;
// La línea siguiente parece el comienzo de un artículo
function looksLikeStart(l) {
  return SUB_RE.test(l) || SUB2_RE.test(l) || /^V[eé][aá]n?se /.test(l) || /^Notas?(?: \(\d\))?:/.test(l) ||
    /^\d{1,2}\. \S+(?: o \S+)? \(/.test(l) || /^[^\s(]+(?: o [^\s(]+)? \([^)]*[Ͱ-Ͽἀ-῿֐-׿]/.test(l);
}
const END_OK =/[.»)¶!?:\]”;"'’†\d]$/;

function parse(text) {
  const pages = text.replace(/\r/g, '').split('\f');
  const entries = [];
  let section = null; // 'AT' | 'NT' | null
  let cur = null;
  let prevContent = '';
  let started = { AT: false, NT: false };

  const flush = () => {
    if (cur && !cur.lines.length && !cur.note) cur.lines.push('(El original no incluye texto para este término.)');
    if (cur) entries.push(cur);
    cur = null;
  };

  // Primera pasada: líneas limpias con su página
  const items = [];
  for (let pi = 0; pi < pages.length; pi++) {
    for (const raw of pages[pi].split('\n')) {
      let line = raw.trim();
      if (!line || isFootnote(line)) continue;
      line = fixHebrew(line);
      for (const re of MARK_NOTES) line = line.replace(re, '').trim();
      if (line) items.push({ line, pi });
    }
  }

  for (let k = 0; k < items.length; k++) {
    {
      const { line, pi } = items[k];
      const next = items[k + 1] ? items[k + 1].line : '';

      // Secciones
      if (section === null && line === 'ABANDONAR, DEJAR') { section = 'AT'; }
      if (line === 'Santiago Escuain.' || (section === 'AT' && (line === 'PREFACIO DE LOS EDITORES' || line.startsWith('DICCIONARIO EXPOSITIVO DE PALABRAS DEL NUEVO')))) { flush(); section = 'NT-pre'; continue; }
      if (section === 'NT-pre' && line === 'ABAJO') { section = 'NT'; }
      if (section === 'NT' && line === 'Notas Adicionales') { flush(); section = 'NOTAS'; prevContent = ''; continue; }
      if (section === null || section === 'NT-pre') continue;

      if (section === 'NOTAS') {
        if (/^Acerca de (la|las) /.test(line)) {
          flush();
          const m = line.match(/^Acerca de (?:la|las) (Partícula|Preposición|Preposiciones) (.+?)\.?$/);
          const name = m ? m[2].replace(/\s*\([^)]*\)/g, '').replace(/,\s*$/, '').trim() : line;
          cur = { h: 'NOTA ADICIONAL: ' + (m ? m[1].toUpperCase() + ' ' : '') + name.toUpperCase(), t: 'NT', p: pi + 1, lines: [line], note: true };
          continue;
        }
        if (/^\d?Vine, W\. 2000/.test(line)) continue;
        if (cur) cur.lines.push(line);
        continue;
      }

      if (LETTER_RE.test(line)) { prevContent = line; continue; }

      if (isHeadword(line) && (!cur || cur.lines.length === 0 || END_OK.test(prevContent) || LETTER_RE.test(prevContent) || XREF_END.test(prevContent) || looksLikeStart(next))) {
        flush();
        cur = { h: line, t: section, p: pi + 1, lines: [] };
        prevContent = line;
        continue;
      }
      if (!cur) continue;

      if (SUB_RE.test(line) || SUB2_RE.test(line)) {
        cur.lines.push('§' + line.replace(/\.$/, ''));
      } else {
        const last = cur.lines[cur.lines.length - 1];
        // Une líneas cortadas a mitad de frase (saltos de página / columna)
        if (last && last[0] !== '§' && !END_OK.test(last) && /^[a-záéíóúñü(«“0-9]/.test(line)) {
          cur.lines[cur.lines.length - 1] = last + ' ' + line;
        } else if (last && last[0] !== '§' && /-$/.test(last) && /^[a-záéíóúñ]/.test(line)) {
          cur.lines[cur.lines.length - 1] = last.slice(0, -1) + line;
        } else {
          cur.lines.push(line);
        }
      }
      prevContent = line;
    }
  }
  flush();
  return entries;
}

// ---------------------------------------------------------------------------
// Post-proceso
// ---------------------------------------------------------------------------
const HEB = /[֐-׿]/;
const GRK = /[Ͱ-Ͽἀ-῿]/;

function extractWords(lines, testament) {
  const words = [];
  const seen = new Set();
  for (const l of lines) {
    if (l[0] === '§') continue;
    let m;
    // AT:  ˓azab (עזב, H5800), «dejar...
    const reH = /([^\s(),.«»;:\[\]]{1,25}) \(([^,()]+), H(\d+)\)/g;
    while ((m = reH.exec(l))) {
      const k = 'H' + m[3] + m[1];
      if (!seen.has(k)) { seen.add(k); words.push({ tr: m[1], o: m[2].trim(), s: 'H' + m[3] }); }
    }
    // NT:  1. apothesis (ἀπόθεσις, 595), ...
    const reG = /([A-Za-zñ][\wñ\-]*) \(([\u0370-\u03FF\u1F00-\u1FFF][^,()]*?), (\d+)\)/g;
    while ((m = reG.exec(l))) {
      const k = 'G' + m[3] + m[1];
      if (!seen.has(k)) { seen.add(k); words.push({ tr: m[1], o: m[2].trim(), s: 'G' + m[3] }); }
    }
  }
  return words;
}

function detectTestament(e) {
  const txt = e.lines.join(' ');
  const h = (txt.match(/[֐-׿]/g) || []).length;
  const g = (txt.match(/[Ͱ-Ͽἀ-῿]/g) || []).length;
  if (/\(\S[^()]*, H\d+\)/.test(txt) && h > g) return 'AT';
  if (/\([Ͱ-Ͽἀ-῿][^()]*, \d+\)/.test(txt) && g > h) return 'NT';
  return e.t;
}

function main() {
  console.log('Leyendo', input);
  const text = loadText(input);
  let entries = parse(text);
  for (const e of entries) e.t = detectTestament(e);

  // Fusiona duplicados contiguos (páginas desordenadas o lemas partidos)
  const merged = [];
  const byKey = new Map();
  for (const e of entries) {
    const key = e.t + '|' + e.h;
    const prev = byKey.get(key);
    if (prev) {
      const a = prev.lines.join('\n');
      const b = e.lines.join('\n');
      if (a.includes(b)) continue;
      if (b.includes(a)) { prev.lines = e.lines; continue; }
      prev.lines.push(...e.lines);
      continue;
    }
    byKey.set(key, e);
    merged.push(e);
  }

  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  merged.sort((a, b) => collator.compare(a.h.replace(/^NOTA ADICIONAL: /, '~'), b.h.replace(/^NOTA ADICIONAL: /, '~')) || (a.t < b.t ? -1 : 1));

  const index = [];
  const bodies = [];
  merged.forEach((e, i) => {
    // Separa ítems numerados que quedaron en la misma línea: "… 1. caris (χάρις, 5485)"
    e.lines = e.lines.flatMap((l) => l[0] === '§' ? [l] : l.split(/ (?=\d{1,2}\. [A-Za-zñ˒˓]+(?: o [A-Za-zñ]+)? \((?:[Ͱ-Ͽἀ-῿]|[֐-׿]))/));
    const w = extractWords(e.lines, e.t);
    const item = { h: e.h, t: e.t, p: e.p };
    if (w.length) item.w = w;
    if (e.note) item.n = 1;
    index.push(item);
    bodies.push(e.lines.join('\n'));
  });

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(outDir, 'bodies.json'), JSON.stringify(bodies));

  const at = index.filter(x => x.t === 'AT').length;
  const nt = index.filter(x => x.t === 'NT').length;
  const nw = index.reduce((s, x) => s + (x.w ? x.w.length : 0), 0);
  console.log(`Artículos: ${index.length} (AT ${at}, NT ${nt}); palabras originales: ${nw}`);
  console.log('index.json', (fs.statSync(path.join(outDir, 'index.json')).size / 1024).toFixed(0) + ' KB',
    '| bodies.json', (fs.statSync(path.join(outDir, 'bodies.json')).size / 1024).toFixed(0) + ' KB');
}

main();
