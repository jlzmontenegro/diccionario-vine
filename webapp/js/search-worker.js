/* Motor de búsqueda del Diccionario Vine (se ejecuta en un Web Worker). */
'use strict';

let INDEX = [];      // [{h,t,p,w,n}]
let BODIES = [];     // [string]
let HEADS = [];      // datos normalizados por artículo
let VOCAB = null;    // Map token -> Map(id -> count)
let VOCAB_SORTED = null;
let REFS = null;     // Map "Libro|cap" -> [{id, pos, vs:[a,b]}]
let ready = false;

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ҃-҉֑-ׇ᷀-᷿ʼ-˓˒˓]/g, '')
  .toLowerCase().replace(/ς/g, 'σ');

const TOKEN_RE = /[a-zñ0-9α-ωא-ת]+/g;
function tokens(s) { return norm(s).match(TOKEN_RE) || []; }

const STOP = new Set('a al como con de del e el en es la las lo los o para por que se su sus un una y ya le les ha no mas pero esta este esto son ser fue sin sobre entre tambien cf vease veanse p ej lit'.split(' '));

// ---------------------------------------------------------------------------
// Libros de la Biblia (abreviatura canónica usada en el texto + alias)
// ---------------------------------------------------------------------------
const BOOKS = [
  ['Gn', 'genesis gen gn ge'], ['Éx', 'exodo ex exo'], ['Lv', 'levitico lev lv'], ['Nm', 'numeros num nm'],
  ['Dt', 'deuteronomio deut dt'], ['Jos', 'josue jos'], ['Jue', 'jueces jue jc'], ['Rt', 'rut rt'],
  ['1 S', '1 samuel 1 sam 1 sa 1 s 1samuel 1sam 1s'], ['2 S', '2 samuel 2 sam 2 sa 2 s 2samuel 2sam 2s'],
  ['1 R', '1 reyes 1 re 1 r 1reyes 1r'], ['2 R', '2 reyes 2 re 2 r 2reyes 2r'],
  ['1 Cr', '1 cronicas 1 cr 1cronicas 1cr'], ['2 Cr', '2 cronicas 2 cr 2cronicas 2cr'],
  ['Esd', 'esdras esd'], ['Neh', 'nehemias neh'], ['Est', 'ester est'], ['Job', 'job'],
  ['Sal', 'salmos salmo sal sl ps'], ['Pr', 'proverbios prov pr'], ['Ec', 'eclesiastes ecl ec'],
  ['Cnt', 'cantares cantar cantico cnt cant'], ['Is', 'isaias is isa'], ['Jer', 'jeremias jer'],
  ['Lm', 'lamentaciones lam lm'], ['Ez', 'ezequiel ez eze'], ['Dn', 'daniel dn dan'], ['Os', 'oseas os'],
  ['Jl', 'joel jl'], ['Am', 'amos am'], ['Abd', 'abdias abd'], ['Jon', 'jonas jon'], ['Miq', 'miqueas miq'],
  ['Nah', 'nahum nah'], ['Hab', 'habacuc hab'], ['Sof', 'sofonias sof'], ['Hag', 'hageo hag'],
  ['Zac', 'zacarias zac'], ['Mal', 'malaquias mal'],
  ['Mt', 'mateo mt mat'], ['Mc', 'marcos mc mr mar'], ['Lc', 'lucas lc luc'], ['Jn', 'juan jn'],
  ['Hch', 'hechos hch hech'], ['Ro', 'romanos ro rom'], ['1 Co', '1 corintios 1 co 1 cor 1corintios 1co 1cor'],
  ['2 Co', '2 corintios 2 co 2 cor 2corintios 2co 2cor'], ['Gl', 'galatas gl gal ga'], ['Ef', 'efesios ef'],
  ['Flp', 'filipenses flp fil'], ['Col', 'colosenses col'], ['1 Ts', '1 tesalonicenses 1 ts 1 tes 1ts 1tes'],
  ['2 Ts', '2 tesalonicenses 2 ts 2 tes 2ts 2tes'], ['1 Ti', '1 timoteo 1 ti 1 tim 1ti 1tim'],
  ['2 Ti', '2 timoteo 2 ti 2 tim 2ti 2tim'], ['Tit', 'tito tit'], ['Flm', 'filemon flm'],
  ['Heb', 'hebreos heb'], ['Stg', 'santiago stg sant'], ['1 P', '1 pedro 1 p 1 pe 1pedro 1p 1pe'],
  ['2 P', '2 pedro 2 p 2 pe 2pedro 2p 2pe'], ['1 Jn', '1 juan 1 jn 1juan 1jn'], ['2 Jn', '2 juan 2 jn 2juan 2jn'],
  ['3 Jn', '3 juan 3 jn 3juan 3jn'], ['Jud', 'judas jud'], ['Ap', 'apocalipsis ap apoc'],
];
const BOOK_NAMES = {
  Gn: 'Génesis', 'Éx': 'Éxodo', Lv: 'Levítico', Nm: 'Números', Dt: 'Deuteronomio', Jos: 'Josué', Jue: 'Jueces', Rt: 'Rut',
  '1 S': '1 Samuel', '2 S': '2 Samuel', '1 R': '1 Reyes', '2 R': '2 Reyes', '1 Cr': '1 Crónicas', '2 Cr': '2 Crónicas',
  Esd: 'Esdras', Neh: 'Nehemías', Est: 'Ester', Job: 'Job', Sal: 'Salmos', Pr: 'Proverbios', Ec: 'Eclesiastés',
  Cnt: 'Cantares', Is: 'Isaías', Jer: 'Jeremías', Lm: 'Lamentaciones', Ez: 'Ezequiel', Dn: 'Daniel', Os: 'Oseas',
  Jl: 'Joel', Am: 'Amós', Abd: 'Abdías', Jon: 'Jonás', Miq: 'Miqueas', Nah: 'Nahúm', Hab: 'Habacuc', Sof: 'Sofonías',
  Hag: 'Hageo', Zac: 'Zacarías', Mal: 'Malaquías', Mt: 'Mateo', Mc: 'Marcos', Lc: 'Lucas', Jn: 'Juan', Hch: 'Hechos',
  Ro: 'Romanos', '1 Co': '1 Corintios', '2 Co': '2 Corintios', Gl: 'Gálatas', Ef: 'Efesios', Flp: 'Filipenses',
  Col: 'Colosenses', '1 Ts': '1 Tesalonicenses', '2 Ts': '2 Tesalonicenses', '1 Ti': '1 Timoteo', '2 Ti': '2 Timoteo',
  Tit: 'Tito', Flm: 'Filemón', Heb: 'Hebreos', Stg: 'Santiago', '1 P': '1 Pedro', '2 P': '2 Pedro', '1 Jn': '1 Juan',
  '2 Jn': '2 Juan', '3 Jn': '3 Juan', Jud: 'Judas', Ap: 'Apocalipsis',
};
const ALIAS = new Map();
for (const [abbr, names] of BOOKS) {
  // los alias se separan por grupos "N nombre"
  const parts = names.match(/(?:[123] )?[a-z0-9]+/g);
  for (const p of parts) ALIAS.set(p, abbr);
  ALIAS.set(norm(abbr), abbr);
}
// Variantes del propio texto
const TEXT_BOOK = { 'Ex': 'Éx', 'Éxodo': 'Éx', 'Salmo': 'Sal', 'Juan': 'Jn', 'Amós': 'Am', 'Num': 'Nm', 'Rut': 'Rt', 'Mateo': 'Mt', '1 Cor': '1 Co', '2 Cor': '2 Co', 'Fil': 'Flp' };
const CANON = new Set(BOOKS.map(b => b[0]));

function parseRefQuery(q) {
  const s = norm(q).trim().replace(/\s+/g, ' ');
  const m = s.match(/^([123]\s?)?([a-z]+)\.?(?:\s+(\d{1,3})(?:\s*[:.,]\s*(\d{1,3})(?:\s*-\s*(\d{1,3}))?)?)?$/);
  if (!m) return null;
  const num = m[1] ? m[1].trim() + ' ' : '';
  const book = ALIAS.get(num + m[2]) || ALIAS.get((num + m[2]).replace(' ', ''));
  if (!book) return null;
  return { book, ch: m[3] ? +m[3] : null, v: m[4] ? +m[4] : null, v2: m[5] ? +m[5] : (m[4] ? +m[4] : null) };
}

function buildRefs() {
  REFS = new Map();
  const bookAlt = [...CANON, ...Object.keys(TEXT_BOOK)].sort((a, b) => b.length - a.length)
    .map(b => b.replace(/ /g, '\\s')).join('|');
  const re = new RegExp('(?:(?:^|[\\s(\\[;«“])(' + bookAlt + ')\\s+)?(\\d{1,3})\\.(\\d{1,3}(?:\\s?[-–]\\s?\\d{1,3})?(?:\\s?,\\s?\\d{1,3}(?:\\s?[-–]\\s?\\d{1,3})?)*)', 'g');
  for (let id = 0; id < BODIES.length; id++) {
    const lines = BODIES[id].split('\n');
    let off = 0;
    for (const line of lines) {
      let book = null;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        if (m[1]) book = TEXT_BOOK[m[1].replace(/\s/g, ' ')] || m[1].replace(/\s/g, ' ');
        if (!book) continue;
        // Evita confundir números sueltos sin libro reciente
        const ch = +m[2];
        const vs = [];
        for (const part of m[3].split(',')) {
          const r = part.split(/[-–]/).map(x => +x.trim());
          vs.push([r[0], r[1] || r[0]]);
        }
        const key = book + '|' + ch;
        let arr = REFS.get(key);
        if (!arr) REFS.set(key, (arr = []));
        arr.push({ id, pos: off + m.index + (m[0].length - m[0].trimStart().length), len: m[0].trim().length, vs });
      }
      off += line.length + 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Construcción de índices
// ---------------------------------------------------------------------------
function variantsOf(h) {
  const base = h.replace(/^NOTA ADICIONAL:\s*/, '');
  const out = new Set();
  const full = norm(base.replace(/[()]/g, ' ')).replace(/\s+/g, ' ').trim();
  out.add(full);
  for (const part of base.split(/[,;]/)) {
    const noPar = norm(part.replace(/\([^)]*\)/g, ' ')).replace(/[^a-zñ0-9 /]/g, ' ').replace(/\s+/g, ' ').trim();
    if (noPar) {
      out.add(noPar);
      // «ADÚLTERO/A» -> «adultero»; se ignoran sufijos sueltos como «a»
      if (noPar.includes('/')) noPar.split('/').forEach(x => x.trim().length >= 3 && out.add(x.trim()));
    }
    const withPar = norm(part.replace(/[()]/g, ' ')).replace(/[^a-zñ0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (withPar) out.add(withPar);
  }
  return [...out];
}

function build() {
  HEADS = INDEX.map((e) => ({
    v: variantsOf(e.h),
    w: (e.w || []).map(w => ({ tr: norm(w.tr).replace(/[^a-zñ\- ]/g, ''), o: norm(w.o), s: w.s.toLowerCase(), n: w.s.slice(1) })),
  }));
}

// Índice invertido, construido por tramos para no bloquear el worker
let V_TMP = null, V_POS = 0;
function vocabStep(n) {
  if (!V_TMP) { V_TMP = new Map(); V_POS = 0; }
  const end = Math.min(BODIES.length, V_POS + n);
  for (let id = V_POS; id < end; id++) {
    for (const t of tokens(INDEX[id].h + ' ' + BODIES[id])) {
      let m = V_TMP.get(t);
      if (!m) V_TMP.set(t, (m = new Map()));
      m.set(id, (m.get(id) || 0) + 1);
    }
  }
  V_POS = end;
  if (V_POS >= BODIES.length) { VOCAB = V_TMP; VOCAB_SORTED = [...VOCAB.keys()].sort(); return true; }
  return false;
}
function buildVocab() { while (!vocabStep(500)); }
function buildVocabInBackground() {
  if (VOCAB) return self.postMessage({ type: 'indexed' });
  if (vocabStep(120)) self.postMessage({ type: 'indexed' }); else setTimeout(buildVocabInBackground, 0);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function damerau(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  const d = [];
  for (let i = 0; i <= la; i++) { d[i] = [i]; }
  for (let j = 0; j <= lb; j++) d[0][j] = j;
  for (let i = 1; i <= la; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[la][lb];
}

function prefixRange(prefix) {
  let lo = 0, hi = VOCAB_SORTED.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (VOCAB_SORTED[mid] < prefix) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < VOCAB_SORTED.length && VOCAB_SORTED[i].startsWith(prefix); i++) out.push(VOCAB_SORTED[i]);
  return out;
}

// Mapa de posiciones normalizado -> original para resaltar en el texto real
function normWithMap(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    const n = norm(text[i]);
    for (let k = 0; k < n.length; k++) { out += n[k]; map.push(i); }
  }
  map.push(text.length);
  return { out, map };
}

function makeSnippet(body, ranges, around = 90) {
  // ranges: [[start,end]] en el texto original
  const clean = body.replace(/§/g, ' ');
  if (!ranges.length) return { text: clean.slice(0, 180).replace(/\n/g, ' '), hl: [] };
  ranges.sort((a, b) => a[0] - b[0]);
  const first = ranges[0][0];
  let start = Math.max(0, first - around);
  let end = Math.min(clean.length, first + around * 2);
  if (start > 0) { const sp = clean.indexOf(' ', start); if (sp > -1 && sp < first) start = sp + 1; }
  if (end < clean.length) { const sp = clean.lastIndexOf(' ', end); if (sp > first) end = sp; }
  const text = (start > 0 ? '…' : '') + clean.slice(start, end).replace(/\n/g, ' ') + (end < clean.length ? '…' : '');
  const shift = start > 0 ? 1 : 0;
  const hl = ranges.filter(r => r[0] >= start && r[1] <= end).map(r => [r[0] - start + shift, r[1] - start + shift]);
  return { text, hl };
}

function findRanges(body, terms) {
  // terms: [{re}] sobre texto normalizado
  const { out, map } = normWithMap(body);
  const ranges = [];
  for (const t of terms) {
    t.re.lastIndex = 0;
    let m, n = 0;
    while ((m = t.re.exec(out)) && n < 30) {
      const s = m.index + (m[1] ? m[1].length : 0);
      const e = m.index + m[0].length;
      ranges.push([map[s], map[e]]);
      n++;
      if (m[0].length === 0) t.re.lastIndex++;
    }
  }
  return ranges;
}

const NORM_CACHE = [];
const normText = (id) => NORM_CACHE[id] || (NORM_CACHE[id] = norm(INDEX[id].h + ' ' + BODIES[id]));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const B = '(^|[^a-zñ0-9\\u03b1-\\u03c9\\u05d0-\\u05ea])';

// ---------------------------------------------------------------------------
// Búsquedas
// ---------------------------------------------------------------------------
function searchHeads(q, filter, limit = 200, scope = 'all') {
  const nq = norm(q).replace(/[^a-zñ0-9α-ωא-ת ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!nq) return { items: [] };
  const strong = q.trim().match(/^([GgHh])?\s?(\d{1,5})$/);
  const res = [];
  // Una sola letra: lemas que empiezan por ella, en orden alfabético
  if (nq.length === 1 && !strong) {
    for (let id = 0; id < INDEX.length; id++) {
      const e = INDEX[id];
      if ((filter && e.t !== filter) || e.n) continue;
      if (norm(e.h.replace(/^[^A-Za-zÁÉÍÓÚÑÜ]+/, '')).startsWith(nq)) res.push({ id, score: 50, why: '' });
    }
    return { items: res.slice(0, limit), total: res.length, suggestion: null };
  }
  for (let id = 0; id < INDEX.length; id++) {
    const e = INDEX[id];
    if (filter && e.t !== filter) continue;
    const H = HEADS[id];
    let best = 0, why = '';
    if (strong) {
      for (let k = 0; k < H.w.length; k++) {
        const w = H.w[k];
        if (strong[1] ? w.s === (strong[1].toLowerCase() + strong[2]) : w.n === strong[2]) {
          // el artículo donde la palabra encabeza la lista es el principal
          best = 100 + (k === 0 ? 4 : k < 3 ? 2 : 0); why = w.s.toUpperCase() + ' · ' + e.w[k].tr; break;
        }
      }
    } else {
      const qWords = nq.split(' ');
      if (scope !== 'orig') for (const v of H.v) {
        let s = 0;
        if (v === nq) s = 100;
        else if (v.startsWith(nq)) s = 85 - Math.min(20, (v.length - nq.length) * 0.5);
        else if ((' ' + v).includes(' ' + nq)) s = 60;
        else if (nq.length >= 3 && v.includes(nq)) s = 35;
        else if (qWords.length > 1) {
          // varias palabras: todas deben empezar alguna palabra del lema
          const vw = v.split(' ');
          const hits = qWords.filter(q => vw.some(x => x.startsWith(q))).length;
          if (hits === qWords.length) s = 55;
          else if (hits && vw.some(x => x === qWords[0])) s = 40 + hits * 2;
        }
        if (s > best) best = s;
      }
      if (scope !== 'heads') for (let k = 0; k < H.w.length; k++) {
        const w = H.w[k];
        let s = 0;
        if (w.tr === nq || w.o === nq) s = 92;
        else if (nq.length >= 3 && (w.tr.startsWith(nq) || w.o.startsWith(nq))) s = 70 - Math.min(15, (w.tr.length - nq.length));
        else if (nq.length >= 5 && (w.tr.includes(nq) || w.o.includes(nq))) s = 30;
        if (s) s += k === 0 ? 4 : k < 3 ? 2 : 0;
        if (s > best || (s && s === best && !why)) {
          if (s > best) best = s;
          why = e.w[k].tr + ' · ' + e.w[k].o;
        }
      }
    }
    if (best > 0) res.push({ id, score: best + (e.n ? -5 : 0) + 0.3 * Math.log10(BODIES[id].length + 10), why });
  }
  res.sort((a, b) => b.score - a.score || a.id - b.id);

  // Corrección ortográfica si hay pocos resultados
  let suggestion = null;
  if (!strong && res.filter(r => r.score >= 60).length === 0 && nq.length >= 3) {
    const max = nq.length <= 4 ? 1 : 2;
    const fuzzy = [];
    for (let id = 0; id < INDEX.length; id++) {
      if (filter && INDEX[id].t !== filter) continue;
      let bestD = max + 1, bestV = '';
      if (scope !== 'orig') for (const v of HEADS[id].v) {
        const cmp = v.length > nq.length + 2 ? v.slice(0, nq.length + 1) : v;
        const d = Math.min(damerau(nq, v, max), v.length > nq.length ? damerau(nq, cmp, max) + 0.5 : max + 1);
        if (d < bestD) { bestD = d; bestV = v; }
      }
      if (scope !== 'heads') for (const w of HEADS[id].w) {
        const d = damerau(nq, w.tr, max);
        if (d < bestD) { bestD = d; bestV = w.tr; }
      }
      if (bestD <= max) fuzzy.push({ id, score: 20 - bestD * 5, why: '', d: bestD, v: bestV });
    }
    fuzzy.sort((a, b) => a.d - b.d || BODIES[b.id].length - BODIES[a.id].length);
    const minD = fuzzy.length ? fuzzy[0].d : 0;
    fuzzy.splice(0, fuzzy.length, ...fuzzy.filter((x) => x.d <= Math.max(1, minD)));
    if (fuzzy.length) suggestion = fuzzy[0].v;
    const have = new Set(res.map(r => r.id));
    for (const f of fuzzy) if (!have.has(f.id)) res.push({ id: f.id, score: f.score, why: '≈ ' + f.v, fuzzy: true });
  }
  return { items: res.slice(0, limit), total: res.length, suggestion };
}

function parseTextQuery(q) {
  const terms = [];
  const re = /(-?)"([^"]+)"|(-?)(\S+)/g;
  let m;
  while ((m = re.exec(q))) {
    if (m[2] !== undefined) {
      const words = tokens(m[2]);
      if (words.length) terms.push({ neg: !!m[1], phrase: words });
    } else {
      let w = m[4];
      const prefix = /\*$/.test(w);
      const tk = tokens(w);
      if (!tk.length) continue;
      if (tk.length > 1) { terms.push({ neg: !!m[3], phrase: tk }); continue; }
      terms.push({ neg: !!m[3], word: tk[0], prefix });
    }
  }
  return terms;
}

function expandWord(t, isLast) {
  if (t.prefix) return prefixRange(t.word).slice(0, 400);
  const out = [];
  for (const cand of [t.word, t.word + 's', t.word + 'es', t.word.replace(/es$/, ''), t.word.replace(/s$/, '')]) {
    if (cand.length > 1 && VOCAB.has(cand) && !out.includes(cand)) out.push(cand);
  }
  return out;
}

function searchText(q, filter, limit = 150) {
  if (!VOCAB) buildVocab();
  const terms = parseTextQuery(q);
  const pos = terms.filter(t => !t.neg);
  if (!pos.length) return { items: [], total: 0 };
  const N = INDEX.length;
  let scores = null;
  const hlTerms = [];
  for (const t of pos) {
    const words = t.word ? expandWord(t) : t.phrase;
    const local = new Map();
    if (t.word) {
      for (const w of words) {
        const posting = VOCAB.get(w);
        if (!posting) continue;
        const idf = Math.log(1 + N / posting.size);
        for (const [id, c] of posting) local.set(id, (local.get(id) || 0) + (1 + Math.log(c)) * idf);
      }
      if (words.length) hlTerms.push({ re: new RegExp(B + '(?:' + words.map(esc).join('|') + ')' + (t.prefix ? '[a-zñ0-9]*' : '') + '(?![a-zñ0-9])', 'g') });
    } else {
      // frase: intersección de palabras y verificación posterior
      let cand = null;
      for (const w of t.phrase) {
        const posting = VOCAB.get(w);
        if (!posting) { cand = new Map(); break; }
        if (!cand) cand = new Map([...posting].map(([id, c]) => [id, c]));
        else for (const id of [...cand.keys()]) if (!posting.has(id)) cand.delete(id);
      }
      const phraseRe = new RegExp(B + t.phrase.map(esc).join('[^a-zñ0-9\\u03b1-\\u03c9\\u05d0-\\u05ea]+') + '(?![a-zñ0-9])', 'g');
      for (const [id] of cand || []) {
        const txt = normText(id);
        phraseRe.lastIndex = 0;
        const c = (txt.match(phraseRe) || []).length;
        if (c) local.set(id, (1 + Math.log(c)) * 4);
      }
      hlTerms.push({ re: phraseRe });
    }
    if (scores === null) scores = local;
    else { for (const id of [...scores.keys()]) { if (!local.has(id)) scores.delete(id); else scores.set(id, scores.get(id) + local.get(id)); } }
  }
  for (const t of terms.filter(t => t.neg)) {
    const words = t.word ? expandWord(t) : null;
    for (const id of [...scores.keys()]) {
      const txt = normText(id);
      const hit = words ? words.some(w => VOCAB.get(w) && VOCAB.get(w).has(id)) : txt.includes(t.phrase.join(' '));
      if (hit) scores.delete(id);
    }
  }
  const nqWords = pos.filter(t => t.word).map(t => t.word);
  let items = [];
  for (const [id, s] of scores) {
    if (filter && INDEX[id].t !== filter) continue;
    let sc = s / Math.sqrt(1 + BODIES[id].length / 4000);
    const hv = HEADS[id].v;
    if (nqWords.some(w => hv.some(v => (' ' + v + ' ').includes(' ' + w + ' ')))) sc *= 2.5;
    items.push({ id, score: sc });
  }
  items.sort((a, b) => b.score - a.score);
  // Varias palabras sin comillas: premia los artículos donde aparecen juntas
  if (nqWords.length > 1 && nqWords.length === pos.length) {
    const near = new RegExp(B + nqWords.map(esc).join('[^a-zñ0-9\\u03b1-\\u03c9\\u05d0-\\u05ea]+'), 'g');
    for (const it of items.slice(0, 400)) {
      const c = (normText(it.id).match(near) || []).length;
      if (c) it.score *= 2 + Math.log(1 + c);
    }
    items.sort((a, b) => b.score - a.score);
  }
  const total = items.length;
  items = items.slice(0, limit);
  for (const it of items.slice(0, 60)) {
    const ranges = findRanges(BODIES[it.id], hlTerms);
    it.snip = makeSnippet(BODIES[it.id], ranges);
    it.hits = ranges.length;
  }
  return { items, total, hl: hlTerms.map(t => t.re.source) };
}

function searchRefs(q, filter) {
  const r = parseRefQuery(q);
  if (!r) return null;
  if (!REFS) buildRefs();
  const keys = [];
  if (r.ch) keys.push(r.book + '|' + r.ch);
  else for (const k of REFS.keys()) if (k.startsWith(r.book + '|')) keys.push(k);
  const byId = new Map();
  for (const k of keys) {
    for (const o of REFS.get(k) || []) {
      if (r.v && !o.vs.some(([a, b]) => a <= r.v2 && b >= r.v)) continue;
      if (filter && INDEX[o.id].t !== filter) continue;
      let x = byId.get(o.id);
      if (!x) byId.set(o.id, (x = { id: o.id, score: 0, occ: [] }));
      x.score++;
      x.occ.push([o.pos, o.pos + o.len]);
    }
  }
  const items = [...byId.values()].sort((a, b) => b.score - a.score || a.id - b.id);
  for (const it of items.slice(0, 80)) { it.snip = makeSnippet(BODIES[it.id], it.occ.slice(0, 10)); it.hits = it.occ.length; delete it.occ; }
  const label = (BOOK_NAMES[r.book] || r.book) + (r.ch ? ' ' + r.ch : '') + (r.v ? ':' + r.v + (r.v2 !== r.v ? '-' + r.v2 : '') : '');
  return { items: items.slice(0, 300), total: items.length, ref: { ...r, label } };
}

// Búsqueda "Todo": combina lemas, original y texto completo
function searchAll(q, filter) {
  const ref = /\d/.test(q) && !/^[GgHh]?\s?\d+$/.test(q.trim()) ? searchRefs(q, filter) : null;
  const heads = searchHeads(q, filter, 60);
  const text = q.trim().length >= 3 && !/^[GgHh]?\s?\d+$/.test(q.trim()) ? searchText(q, filter, 100) : { items: [], total: 0 };
  const headIds = new Set(heads.items.filter(i => !i.fuzzy).map(i => i.id));
  text.items = text.items.filter(i => !headIds.has(i.id));
  return { heads, text, ref };
}

function browse(letter, filter) {
  const L = norm(letter);
  const items = [];
  for (let id = 0; id < INDEX.length; id++) {
    const e = INDEX[id];
    if (filter && e.t !== filter) continue;
    if (e.n) { if (L === '~') items.push(id); continue; }
    if (norm(e.h.replace(/^[^A-Za-zÁÉÍÓÚÑÜ]+/, '')[0] || '') === L) items.push(id);
  }
  return items;
}

// Autocompletado ligero (lemas + transliteraciones)
function suggest(q, filter) {
  const r = searchHeads(q, filter, 8);
  return r.items.map(i => ({ id: i.id, why: i.why }));
}

// ---------------------------------------------------------------------------
self.onmessage = async (ev) => {
  const { type, id, q, filter, letter, eid } = ev.data;
  try {
    if (type === 'init') {
      const [ix, bd] = await Promise.all([
        fetch(ev.data.base + 'data/index.json').then(r => r.json()),
        fetch(ev.data.base + 'data/bodies.json').then(r => r.json()),
      ]);
      INDEX = ix; BODIES = bd; build();
      ready = true;
      self.postMessage({ type: 'ready', index: INDEX, stats: { total: INDEX.length, at: INDEX.filter(e => e.t === 'AT').length, nt: INDEX.filter(e => e.t === 'NT').length, words: INDEX.reduce((s, e) => s + (e.w ? e.w.length : 0), 0) } });
      // Precalcula índices pesados en segundo plano
      setTimeout(buildVocabInBackground, 30);
      return;
    }
    if (!ready) return;
    let result;
    switch (type) {
      case 'all': result = searchAll(q, filter); break;
      case 'heads': result = { heads: searchHeads(q, filter, 300, 'heads') }; break;
      case 'text': result = { text: searchText(q, filter, 300) }; break;
      case 'orig': result = { heads: searchHeads(q, filter, 300, 'orig') }; break;
      case 'ref': result = { ref: searchRefs(q, filter) || { items: [], total: 0, invalid: true } }; break;
      case 'browse': result = { list: browse(letter, filter) }; break;
      case 'suggest': result = { sug: suggest(q, filter) }; break;
      case 'body': result = { body: BODIES[eid] }; break;
    }
    self.postMessage({ type: 'result', id, result });
  } catch (err) {
    self.postMessage({ type: 'result', id, error: String(err && err.stack || err) });
  }
};
