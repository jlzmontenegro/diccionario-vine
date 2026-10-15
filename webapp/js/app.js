/* Diccionario Vine — interfaz */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const listPane = $('#listPane');
  const reader = $('#reader');
  const input = $('#q');

  // ---------------------------------------------------------------------------
  // Utilidades
  // ---------------------------------------------------------------------------
  const escHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ҃-҉֑-ׇ᷀-᷿ʼ-˓˒˓]/g, '').toLowerCase().replace(/ς/g, 'σ');
  const store = {
    get(k, d) { try { const v = localStorage.getItem('vine.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('vine.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
  };
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const toast = (msg) => {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 1800);
  };
  const plural = (n, s, p) => n.toLocaleString('es') + ' ' + (n === 1 ? s : p);
  const strongCode = (s, t) => /^[GH]/.test(s) ? s : (t === 'AT' ? 'H' : 'G') + s;

  // ---------------------------------------------------------------------------
  // Estado
  // ---------------------------------------------------------------------------
  const state = {
    mode: 'all', filter: '', q: '',
    index: null, stats: null, slugToId: new Map(), xref: new Map(),
    favs: store.get('favs', []), hist: store.get('hist', []),
    lastList: '#/', hlWords: [], pdf: false, currentId: null, kbd: -1,
  };
  const slugOf = (id) => { const e = state.index[id]; return e.t.toLowerCase() + '/' + encodeURIComponent(norm(e.h).replace(/\s+/g, '-')); };

  // ---------------------------------------------------------------------------
  // Worker
  // ---------------------------------------------------------------------------
  const base = location.pathname.replace(/[^/]*$/, '');
  const worker = new Worker('js/search-worker.js');
  let reqId = 0;
  const pending = new Map();
  const call = (type, payload = {}) => new Promise((res, rej) => {
    const id = ++reqId; pending.set(id, { res, rej });
    worker.postMessage({ type, id, filter: state.filter, ...payload });
  });
  let readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  worker.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === 'ready') {
      state.index = m.index; state.stats = m.stats;
      m.index.forEach((e, i) => {
        state.slugToId.set(slugOf(i), i);
        if (e.n) return;
        for (const part of [e.h, ...e.h.split(/[,;]/)]) {
          const k = norm(part.replace(/\([^)]*\)/g, '')).replace(/[^a-zñ ]/g, ' ').replace(/\s+/g, ' ').trim();
          if (!k) continue;
          const arr = state.xref.get(k) || [];
          if (!arr.includes(i)) arr.push(i);
          state.xref.set(k, arr);
        }
      });
      readyResolve();
      return;
    }
    if (m.type === 'indexed') return;
    const p = pending.get(m.id); if (!p) return;
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error)) : p.res(m.result);
  };
  worker.postMessage({ type: 'init', base });

  // PDF opcional (vine.pdf junto a la app)
  fetch('vine.pdf', { method: 'HEAD' }).then((r) => { state.pdf = r.ok && /pdf/.test(r.headers.get('content-type') || ''); }).catch(() => {});

  // ---------------------------------------------------------------------------
  // Formato del cuerpo de un artículo
  // ---------------------------------------------------------------------------
  const BOOKS_TXT = ['1 Cr', '2 Cr', '1 Co', '2 Co', '1 Ts', '2 Ts', '1 Ti', '2 Ti', '1 Jn', '2 Jn', '3 Jn', '1 S', '2 S', '1 R', '2 R', '1 P', '2 P',
    'Gn', 'Éx', 'Ex', 'Lv', 'Nm', 'Dt', 'Jos', 'Jue', 'Rt', 'Esd', 'Neh', 'Est', 'Job', 'Sal', 'Pr', 'Ec', 'Cnt', 'Is', 'Jer', 'Lm', 'Ez', 'Dn',
    'Os', 'Jl', 'Am', 'Abd', 'Jon', 'Miq', 'Nah', 'Hab', 'Sof', 'Hag', 'Zac', 'Mal', 'Mt', 'Mc', 'Lc', 'Jn', 'Hch', 'Ro', 'Gl', 'Ef', 'Flp',
    'Col', 'Tit', 'Flm', 'Heb', 'Stg', 'Jud', 'Ap'];
  const BOOK_ALT = BOOKS_TXT.sort((a, b) => b.length - a.length).map((b) => b.replace(' ', '\\s')).join('|');
  const UPW = 'A-ZÁÉÍÓÚÑÜ';
  const INLINE = new RegExp([
    // 1 transliteración + (original, Strong)
    `(?:([^\\s(),«»;:\\[\\]]+) )?\\(([^()]*?[\\u0370-\\u03FF\\u1F00-\\u1FFF\\u0590-\\u05FF][^()]*?), (H?\\d+)\\)`,
    // 4 glosa «…»
    `«([^«»]*)»`,
    // 5 libro, 6 capítulo.versículos
    `(?<![\\wÁÉÍÓÚáéíóúñ])(?:(${BOOK_ALT})\\s)?(\\d{1,3}\\.\\d{1,3}(?:\\s?[-–]\\s?\\d{1,3})?(?:,\\s?\\d{1,3}(?:\\s?[-–]\\s?\\d{1,3})?)*)(?![\\d])`,
    // 7 referencia cruzada en mayúsculas
    `(?<![\\w${UPW}áéíóúñ])([${UPW}]{3,}(?: [${UPW}]{2,})*)(?![\\w${UPW}áéíóúñ])`,
    // 8 marca ¶
    `(¶)`,
  ].join('|'), 'g');

  function linkXref(word, t) {
    const k = norm(word);
    let ids = state.xref.get(k);
    if (!ids) { const first = k.split(' ')[0]; ids = first.length >= 3 ? state.xref.get(first) : null; }
    if (!ids && k.length >= 6) {
      const stem = k.slice(0, -1);
      for (const [key, v] of state.xref) if (key.startsWith(stem)) { ids = v; break; }
    }
    if (!ids) return null;
    const id = ids.find((i) => state.index[i].t === t) ?? ids[0];
    return id === state.currentId ? null : id;
  }

  function inline(text, t, ctx) {
    let out = '', last = 0, m;
    const re = new RegExp(INLINE.source, 'g');
    while ((m = re.exec(text))) {
      out += escHtml(text.slice(last, m.index));
      last = re.lastIndex;
      if (m[2] !== undefined) {
        const code = strongCode(m[3], t);
        const lang = /[֐-׿]/.test(m[2]) ? 'he' : 'grc';
        out += (m[1] ? `<span class="tr">${escHtml(m[1])}</span> ` : '') +
          `(<span class="orig" lang="${lang}"${lang === 'he' ? ' dir="rtl"' : ''}>${escHtml(m[2])}</span> <a class="strong" href="#/buscar?m=orig&q=${code}" title="Buscar Strong ${code}">${code}</a>)`;
      } else if (m[4] !== undefined) {
        out += `<span class="gloss">«${inline(m[4], t, ctx)}»</span>`;
      } else if (m[6] !== undefined) {
        if (m[5]) ctx.book = m[5].replace(/\s/g, ' ');
        if (!ctx.book) { out += escHtml(m[0]); continue; }
        const book = ctx.book;
        const q = `${book} ${m[6].split(/[,\s-–]/)[0].replace('.', ':')}`;
        out += `<a class="bref" href="#/buscar?m=ref&q=${encodeURIComponent(q)}" title="Otros artículos que citan ${escHtml(q)}">${escHtml(m[0])}</a>`;
      } else if (m[7] !== undefined) {
        const id = linkXref(m[7], t);
        out += id != null ? `<a class="xref" href="#/e/${slugOf(id)}">${escHtml(m[7])}</a>` : escHtml(m[7]);
      } else if (m[8]) {
        out += '<span class="pil" title="Se mencionan todas las apariciones de la palabra">¶</span>';
      }
    }
    return out + escHtml(text.slice(last));
  }

  function formatBody(body, t) {
    const html = [];
    for (const line of body.split('\n')) {
      const ctx = { book: null };
      if (line[0] === '§') { html.push(`<h3>${escHtml(line.slice(1))}</h3>`); continue; }
      const num = line.match(/^(\d{1,2})\.\s+(.*)$/);
      if (num) { html.push(`<p class="item"><span class="num">${num[1]}</span>${inline(num[2], t, ctx)}</p>`); continue; }
      if (/^Notas?\s?(\(\d+\))?:/.test(line)) { html.push(`<p class="note">${inline(line, t, ctx)}</p>`); continue; }
      html.push(`<p>${inline(line, t, ctx)}</p>`);
    }
    return html.join('');
  }

  // Resalta palabras (normalizadas) dentro de un elemento
  function highlight(el, patterns) {
    if (!patterns.length) return 0;
    const re = new RegExp(patterns.join('|'), 'g');
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    let count = 0;
    for (const node of nodes) {
      const text = node.nodeValue;
      let normed = '', map = [];
      for (let i = 0; i < text.length; i++) { const c = norm(text[i]); for (let k = 0; k < c.length; k++) { normed += c[k]; map.push(i); } }
      map.push(text.length);
      re.lastIndex = 0;
      const ranges = []; let m;
      while ((m = re.exec(normed))) {
        const pre = m[1] ? m[1].length : 0;
        if (m[0].length - pre > 0) ranges.push([map[m.index + pre], map[m.index + m[0].length]]);
        if (!m[0].length) re.lastIndex++;
      }
      if (!ranges.length) continue;
      const frag = document.createDocumentFragment(); let pos = 0;
      for (const [s, e] of ranges) {
        if (s < pos) continue;
        frag.append(text.slice(pos, s));
        const mk = document.createElement('mark'); mk.textContent = text.slice(s, e); frag.append(mk);
        pos = e; count++;
      }
      frag.append(text.slice(pos));
      node.replaceWith(frag);
    }
    return count;
  }

  function snippetHtml(snip) {
    if (!snip) return '';
    let out = '', pos = 0;
    for (const [s, e] of snip.hl) {
      if (s < pos) continue;
      out += escHtml(snip.text.slice(pos, s)) + '<mark>' + escHtml(snip.text.slice(s, e)) + '</mark>'; pos = e;
    }
    return out + escHtml(snip.text.slice(pos));
  }

  // ---------------------------------------------------------------------------
  // Componentes
  // ---------------------------------------------------------------------------
  function card(id, extra = {}) {
    const e = state.index[id];
    const active = id === state.currentId ? ' active' : '';
    const why = extra.why ? `<div class="card-why">${escHtml(extra.why)}</div>` : '';
    const words = !extra.why && !extra.snip && e.w ? `<div class="card-why">${e.w.slice(0, 3).map((w) => escHtml(w.tr + ' · ' + w.o)).join('  ·  ')}</div>` : '';
    const snip = extra.snip ? `<div class="card-snip">${snippetHtml(extra.snip)}</div>` : '';
    const meta = extra.meta ? `<div class="card-meta">${escHtml(extra.meta)}</div>` : '';
    return `<li><a class="card${active}" href="#/e/${slugOf(id)}" data-id="${id}">
      <div class="card-head"><span class="card-title">${escHtml(e.h)}</span><span class="badge ${e.t}">${e.t}</span></div>${why}${words}${snip}${meta}</a></li>`;
  }

  function list(items, max, mapFn) {
    const first = items.slice(0, max);
    let html = `<ul class="results">${first.map(mapFn).join('')}</ul>`;
    if (items.length > max) html += `<button class="more-btn" data-more="${max}">Ver ${plural(items.length - max, 'resultado más', 'resultados más')}</button>`;
    return html;
  }

  function bindMore(container, items, max, mapFn) {
    const btn = container.querySelector('[data-more]');
    if (!btn) return;
    btn.onclick = () => {
      const ul = btn.previousElementSibling;
      const next = items.slice(max, max + 100);
      ul.insertAdjacentHTML('beforeend', next.map(mapFn).join(''));
      max += 100;
      if (max >= items.length) btn.remove(); else btn.textContent = `Ver ${plural(items.length - max, 'resultado más', 'resultados más')}`;
    };
  }

  function skeleton() { listPane.innerHTML = '<div class="results">' + '<div class="sk"></div>'.repeat(6) + '</div>'; }

  // ---------------------------------------------------------------------------
  // Vistas
  // ---------------------------------------------------------------------------
  const EXAMPLES = [
    ['gracia', 'all'], ['ágape', 'orig'], ['λόγος', 'orig'], ['shalom', 'orig'], ['G26', 'orig'],
    ['Jn 3:16', 'ref'], ['"nuevo nacimiento"', 'text'], ['redención -esclavo', 'text'], ['justific*', 'text'],
  ];

  async function viewHome() {
    setNav('home');
    if (!state.index) { listPane.innerHTML = $('#tplLoading').innerHTML; await ready; }
    const s = state.stats;
    const hist = state.hist.map((sl) => state.slugToId.get(sl)).filter((x) => x != null).slice(0, 8);
    const letters = lettersAvailable();
    listPane.innerHTML = `
      <div class="hero">
        <h1>Diccionario Expositivo Vine</h1>
        <p>Palabras del Antiguo y Nuevo Testamento con sus términos hebreos y griegos.</p>
        <div class="stats">
          <div class="stat"><b>${s.total.toLocaleString('es')}</b><span>artículos</span></div>
          <div class="stat"><b>${s.at.toLocaleString('es')}</b><span>Antiguo Test.</span></div>
          <div class="stat"><b>${s.nt.toLocaleString('es')}</b><span>Nuevo Test.</span></div>
        </div>
      </div>
      ${hist.length ? `<div class="section-title">Vistos recientemente <button class="linkbtn" id="clearHist">Borrar</button></div>
        <div class="chipline">${hist.map((id) => `<a href="#/e/${slugOf(id)}">${escHtml(state.index[id].h.split(',')[0])}</a>`).join('')}</div>` : ''}
      <div class="section-title">Explorar por letra</div>
      <div class="letters">${letters.map((l) => `<a href="#/indice/${l}">${l}</a>`).join('')}<a href="#/indice/~" title="Notas adicionales">✦</a></div>
      <div class="section-title">Prueba buscar</div>
      <div class="chipline">${EXAMPLES.map(([q, m]) => `<button data-try="${escHtml(q)}" data-m="${m}">${escHtml(q)}</button>`).join('')}</div>
      <div class="section-title">Búsqueda avanzada</div>
      <div class="tips">
        <div class="tip">🔤<div>Escribe sin tildes: <code>espiritu</code> encuentra «ESPÍRITU». Se toleran errores de escritura.</div></div>
        <div class="tip">α<div>Busca por <b>griego, hebreo o transliteración</b> (<code>agape</code>, <code>ἀγάπη</code>) o por <b>número Strong</b> (<code>G26</code>, <code>H7965</code>).</div></div>
        <div class="tip">📖<div><b>Cita bíblica</b>: <code>Jn 3:16</code>, <code>Romanos 8</code>, <code>1 Co 13</code> muestra los artículos que la comentan.</div></div>
        <div class="tip">🔎<div><b>Texto completo</b>: frase exacta <code>"pan de vida"</code>, excluir <code>-ley</code>, prefijo <code>salv*</code>.</div></div>
        <div class="tip">⌨️<div>Atajos: <code>/</code> buscar, <code>↑ ↓</code> moverse, <code>Enter</code> abrir, <code>← →</code> artículo anterior/siguiente, <code>Esc</code> volver.</div></div>
      </div>
      <p class="footer-note">Fuente: W. E. Vine, <i>Diccionario Expositivo de Palabras del Antiguo y del Nuevo Testamento Exhaustivo</i>, Editorial Caribe, 1999. Texto extraído automáticamente del PDF; puede contener errores de conversión.</p>`;
    const ch = $('#clearHist'); if (ch) ch.onclick = () => { state.hist = []; store.set('hist', []); viewHome(); };
    $$('[data-try]', listPane).forEach((b) => b.onclick = () => { setMode(b.dataset.m); input.value = b.dataset.try; runSearch(true); });
  }

  function lettersAvailable() {
    const set = new Set();
    state.index.forEach((e) => { if (!e.n && (!state.filter || e.t === state.filter)) set.add(norm(e.h.replace(/^[^A-Za-zÁÉÍÓÚÑÜ]+/, '')[0] || '').toUpperCase()); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }

  async function viewIndex(letter) {
    setNav('index');
    await ready;
    const L = letter || 'A';
    const r = await call('browse', { letter: L });
    const letters = lettersAvailable();
    const map = (id) => card(id);
    listPane.innerHTML = `
      <div class="letter-bar">${letters.map((l) => `<a href="#/indice/${l}" class="${l === L ? 'on' : ''}">${l}</a>`).join('')}<a href="#/indice/~" class="${L === '~' ? 'on' : ''}" title="Notas adicionales">✦</a></div>
      <div class="section-title">${L === '~' ? 'Notas adicionales' : 'Letra ' + L}<span class="count">${plural(r.list.length, 'artículo', 'artículos')}</span></div>
      <div class="compact">${list(r.list, 150, map)}</div>`;
    bindMore(listPane, r.list, 150, map);
    const on = $('.letter-bar .on', listPane); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  function viewSaved() {
    setNav('saved');
    const favs = state.favs.map((s) => state.slugToId.get(s)).filter((x) => x != null);
    const hist = state.hist.map((s) => state.slugToId.get(s)).filter((x) => x != null);
    const fontPx = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--reader-size')) || 18;
    listPane.innerHTML = `
      <div class="section-title">Favoritos <span class="count">${favs.length}</span></div>
      ${favs.length ? `<ul class="results compact">${favs.map((id) => card(id)).join('')}</ul>` : '<p class="empty">Toca la ★ en un artículo para guardarlo aquí.</p>'}
      <div class="section-title">Historial <span class="count">${hist.length}</span>${hist.length ? '<button class="linkbtn" id="clearHist2">Borrar</button>' : ''}</div>
      ${hist.length ? `<ul class="results compact">${hist.slice(0, 50).map((id) => card(id)).join('')}</ul>` : '<p class="empty">Aún no has abierto artículos.</p>'}
      <div class="section-title">Preferencias</div>
      <div class="tips">
        <div class="settings-row"><span>Tamaño del texto</span><span><button class="btn" data-font="-1">A−</button> <b>${fontPx}px</b> <button class="btn" data-font="1">A+</button></span></div>
        <div class="settings-row"><span>Tema</span><span class="seg" id="themeSeg">${['auto', 'light', 'dark'].map((t) => `<button role="radio" data-theme="${t}" aria-checked="${(store.get('theme', 'auto')) === t}">${{ auto: 'Auto', light: 'Claro', dark: 'Oscuro' }[t]}</button>`).join('')}</span></div>
      </div>`;
    const ch = $('#clearHist2'); if (ch) ch.onclick = () => { state.hist = []; store.set('hist', []); viewSaved(); };
    $$('[data-font]', listPane).forEach((b) => b.onclick = () => { changeFont(+b.dataset.font); viewSaved(); });
    $$('#themeSeg button', listPane).forEach((b) => b.onclick = () => { applyTheme(b.dataset.theme); viewSaved(); });
  }

  // ---------------------------------------------------------------------------
  // Búsqueda
  // ---------------------------------------------------------------------------
  let searchSeq = 0;
  async function runSearch(push = false) {
    const q = input.value.trim();
    state.q = q;
    $('#btnClear').hidden = !q;
    const hash = q ? `#/buscar?q=${encodeURIComponent(q)}&m=${state.mode}${state.filter ? '&f=' + state.filter : ''}` : '#/buscar';
    if (location.hash !== hash) history[push ? 'pushState' : 'replaceState'](null, '', hash);
    state.lastList = hash;
    document.body.classList.remove('reading');
    setNav('search');
    await renderSearch();
  }

  async function renderSearch() {
    const q = state.q;
    const seq = ++searchSeq;
    state.kbd = -1;
    if (!q) {
      listPane.innerHTML = `<div class="empty"><p>Escribe una palabra en español, un término griego o hebreo, un número Strong o una cita bíblica.</p></div>`;
      return;
    }
    if (!state.index) { skeleton(); await ready; }
    let r;
    try { r = await call(state.mode, { q }); } catch (err) { console.error(err); return; }
    if (seq !== searchSeq) return;
    const parts = [];
    const binds = [];
    let total = 0;
    state.hlWords = (r.text && r.text.hl) || [];
    if (!state.hlWords.length && state.mode !== 'ref') {
      const w = norm(q).match(/[a-zñα-ωא-ת]{3,}/g) || [];
      state.hlWords = w.map((x) => '(^|[^a-zñ])' + x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-zñ]*');
    }

    if (r.ref && r.ref.items && (r.ref.items.length || state.mode === 'ref')) {
      const R = r.ref;
      total += R.total;
      state.hlWords = [];
      if (R.invalid) {
        parts.push(`<div class="empty">No reconozco «<b>${escHtml(q)}</b>» como cita. Prueba: <code>Jn 3:16</code>, <code>Romanos 8</code>, <code>1 Co 13:4</code>.</div>`);
      } else {
        parts.push(`<div class="ref-banner"><span>📖</span><div><strong>${escHtml(R.ref.label)}</strong><div class="card-meta">${plural(R.total, 'artículo la cita', 'artículos la citan')}</div></div></div>`);
        const map = (it) => card(it.id, { snip: it.snip, meta: it.hits > 1 ? `${it.hits} menciones` : '' });
        parts.push(`<div data-g="ref">${list(R.items, 40, map)}</div>`);
        binds.push(['ref', R.items, 40, map]);
      }
    }
    if (r.heads) {
      const H = r.heads;
      total += H.items.length;
      if (H.suggestion && !H.items.some((i) => !i.fuzzy)) {
        parts.push(`<div class="suggest">¿Quisiste decir <button data-sug="${escHtml(H.suggestion)}">${escHtml(H.suggestion)}</button>?</div>`);
      }
      if (H.items.length) {
        const title = state.mode === 'orig' ? 'Palabras originales' : 'Artículos';
        const map = (it) => card(it.id, { why: it.why });
        parts.push(`<div class="section-title">${title}<span class="count">${plural(H.total, 'coincidencia', 'coincidencias')}</span></div><div data-g="heads">${list(H.items, state.mode === 'all' ? 12 : 60, map)}</div>`);
        binds.push(['heads', H.items, state.mode === 'all' ? 12 : 60, map]);
      }
    }
    if (r.text && r.text.items.length) {
      const T = r.text;
      total += T.items.length;
      const map = (it) => card(it.id, { snip: it.snip, meta: it.hits ? plural(it.hits, 'coincidencia', 'coincidencias') : '' });
      parts.push(`<div class="section-title">${state.mode === 'all' ? 'Mencionado en el texto' : 'Resultados en el texto'}<span class="count">${plural(T.total, 'artículo', 'artículos')}</span></div><div data-g="text">${list(T.items, 25, map)}</div>`);
      binds.push(['text', T.items, 25, map]);
    }
    if (!total && !parts.length) {
      const hint = state.mode !== 'all' ? ` <button class="linkbtn" id="tryAll">Buscar en «Todo»</button>` : (state.filter ? ` <button class="linkbtn" id="tryAllT">Buscar en ambos testamentos</button>` : '');
      parts.push(`<div class="empty">Sin resultados para «<b>${escHtml(q)}</b>».${hint}</div>`);
    }
    listPane.innerHTML = parts.join('');
    for (const [g, items, max, map] of binds) bindMore($(`[data-g="${g}"]`, listPane), items, max, map);
    const sug = $('[data-sug]', listPane); if (sug) sug.onclick = () => { input.value = sug.dataset.sug; runSearch(true); };
    const ta = $('#tryAll', listPane); if (ta) ta.onclick = () => { setMode('all'); runSearch(true); };
    const tt = $('#tryAllT', listPane); if (tt) tt.onclick = () => { setFilter(''); runSearch(true); };
  }

  const liveSearch = debounce(() => runSearch(false), 140);

  function setMode(m) {
    state.mode = m;
    $$('#modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    const ph = { all: 'Buscar palabra, griego, hebreo, Strong o cita…', heads: 'Palabra en español (p. ej. gracia)', text: 'Buscar en todo el texto ("frase", -excluir, pref*)',
      orig: 'Griego, hebreo, transliteración o Strong (G26)', ref: 'Cita bíblica (p. ej. Jn 3:16, Ro 8)' }[m];
    input.placeholder = ph;
    const sel = $(`#modes [data-mode="${m}"]`); if (sel) sel.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
  function setFilter(f) {
    state.filter = f;
    $$('#testament button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === f)));
  }

  // ---------------------------------------------------------------------------
  // Lector de artículos
  // ---------------------------------------------------------------------------
  async function viewEntry(slug) {
    await ready;
    const id = state.slugToId.get(slug);
    document.body.classList.add('reading');
    if (id == null) {
      reader.innerHTML = `<div class="entry"><p class="empty">Artículo no encontrado. <a href="#/">Volver al inicio</a></p></div>`;
      return;
    }
    state.currentId = id;
    const e = state.index[id];
    document.title = `${e.h} — Diccionario Vine`;
    const { body } = await call('body', { eid: id });
    const fav = state.favs.includes(slug);
    const prev = id > 0 ? id - 1 : null;
    const next = id < state.index.length - 1 ? id + 1 : null;
    const words = (e.w || []).slice(0, 14).map((w) => {
      const code = strongCode(w.s, e.t);
      return `<button class="word" data-strong="${code}" title="Buscar ${code}"><span class="o" lang="${e.t === 'AT' ? 'he' : 'grc'}">${escHtml(w.o)}</span><span>${escHtml(w.tr)}</span><span class="s">${code}</span></button>`;
    }).join('');
    reader.innerHTML = `
      <div class="reader-toolbar">
        <button class="icon-btn reader-back" id="rBack" aria-label="Volver"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span class="spacer"></span>
        <button class="icon-btn" id="rFontDown" aria-label="Reducir texto" title="Reducir texto"><svg viewBox="0 0 24 24"><path d="M4 18 9 6l5 12M5.8 14h6.4M16 12h5"/></svg></button>
        <button class="icon-btn" id="rFontUp" aria-label="Aumentar texto" title="Aumentar texto"><svg viewBox="0 0 24 24"><path d="M3 18 8 6l5 12M4.8 14h6.4M15 12h6M18 9v6"/></svg></button>
        <button class="icon-btn" id="rCopy" aria-label="Copiar artículo" title="Copiar artículo"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg></button>
        <button class="icon-btn" id="rShare" aria-label="Compartir" title="Compartir"><svg viewBox="0 0 24 24"><path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/></svg></button>
        <button class="icon-btn" id="rFav" aria-pressed="${fav}" aria-label="Guardar en favoritos" title="Favorito"><svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg></button>
      </div>
      <div class="entry">
        <header class="entry-head">
          <span class="badge ${e.t}">${e.t === 'AT' ? 'Antiguo Testamento' : 'Nuevo Testamento'}</span>
          <h2>${escHtml(e.h)}</h2>
          <div class="entry-meta"><span>Página ${e.p} del PDF</span>${state.pdf ? `<a href="vine.pdf#page=${e.p}" target="_blank" rel="noopener">Ver en PDF ↗</a>` : ''}<span id="hlInfo"></span></div>
          ${words ? `<div class="words">${words}</div>` : ''}
        </header>
        <div class="body" id="entryBody">${formatBody(body, e.t)}</div>
      </div>
      <div id="otherT"></div>
      <nav class="pager">
        ${prev != null ? `<a class="prev" href="#/e/${slugOf(prev)}"><span>← Anterior</span><b>${escHtml(state.index[prev].h)}</b></a>` : '<span></span>'}
        ${next != null ? `<a class="next" href="#/e/${slugOf(next)}"><span>Siguiente →</span><b>${escHtml(state.index[next].h)}</b></a>` : ''}
      </nav>`;

    // Misma palabra en el otro testamento
    const other = state.index.findIndex((x, i) => i !== id && x.h === e.h);
    if (other > -1) $('#otherT').innerHTML = `<div class="section-title">También en el ${state.index[other].t === 'AT' ? 'Antiguo' : 'Nuevo'} Testamento</div><ul class="results">${card(other)}</ul>`;

    // Resaltado de la búsqueda
    if (state.q && state.hlWords.length) {
      const n = highlight($('#entryBody'), state.hlWords);
      if (n) {
        $('#hlInfo').innerHTML = `<button class="linkbtn" id="nextHl">${plural(n, 'coincidencia', 'coincidencias')} ↓</button>`;
        let k = 0;
        $('#nextHl').onclick = () => { const ms = $$('#entryBody mark'); ms[k % ms.length].scrollIntoView({ block: 'center', behavior: 'smooth' }); k++; };
      }
    }

    $('#rBack').onclick = () => { if (history.length > 1 && state.cameFromApp) history.back(); else location.hash = state.lastList || '#/'; };
    $('#rFav').onclick = (ev) => toggleFav(slug, ev.currentTarget);
    $('#rFontUp').onclick = () => changeFont(1);
    $('#rFontDown').onclick = () => changeFont(-1);
    $('#rShare').onclick = () => share(e);
    $('#rCopy').onclick = () => copyEntry(e, body);
    $$('.word', reader).forEach((b) => b.onclick = () => { setMode('orig'); input.value = b.dataset.strong; runSearch(true); });

    // Historial
    state.hist = [slug, ...state.hist.filter((s) => s !== slug)].slice(0, 100);
    store.set('hist', state.hist);
    $$('.card.active', listPane).forEach((c) => c.classList.remove('active'));
    const c = $(`.card[data-id="${id}"]`, listPane); if (c) { c.classList.add('active'); c.scrollIntoView({ block: 'nearest' }); }
    if (window.matchMedia('(min-width: 1000px)').matches) reader.scrollTop = 0; else window.scrollTo(0, 0);
    if (!listPane.innerHTML.trim()) viewHome();
  }

  function toggleFav(slug, btn) {
    const on = !state.favs.includes(slug);
    state.favs = on ? [slug, ...state.favs] : state.favs.filter((s) => s !== slug);
    store.set('favs', state.favs);
    btn.setAttribute('aria-pressed', String(on));
    toast(on ? 'Guardado en favoritos' : 'Quitado de favoritos');
  }
  function changeFont(d) {
    const cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--reader-size')) || 18;
    const v = Math.max(14, Math.min(28, cur + d));
    document.documentElement.style.setProperty('--reader-size', v + 'px');
    try { localStorage.setItem('vine.font', v); } catch (e) { /* */ }
  }
  async function share(e) {
    const url = location.href;
    if (navigator.share) { try { await navigator.share({ title: e.h + ' — Diccionario Vine', url }); } catch (err) { /* cancelado */ } return; }
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch (err) { toast(url); }
  }
  async function copyEntry(e, body) {
    const txt = `${e.h} (${e.t})\n\n${body.replace(/^§/gm, '').trim()}\n\n— Diccionario Expositivo Vine`;
    try { await navigator.clipboard.writeText(txt); toast('Artículo copiado'); } catch (err) { toast('No se pudo copiar'); }
  }

  // ---------------------------------------------------------------------------
  // Router
  // ---------------------------------------------------------------------------
  function setNav(k) { $$('.bottomnav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === k)); }

  function emptyReader() {
    reader.innerHTML = `<div class="reader-empty"><div><p style="font-size:40px;margin:0">📜</p><p>Selecciona un artículo para leerlo aquí.</p></div></div>`;
  }

  async function route() {
    const h = location.hash || '#/';
    const [path, qs] = h.slice(1).split('?');
    const params = new URLSearchParams(qs || '');
    if (path.startsWith('/e/')) {
      state.cameFromApp = !!state.routedOnce;
      state.routedOnce = true;
      return viewEntry(path.slice(3));
    }
    state.routedOnce = true;
    document.body.classList.remove('reading');
    state.currentId = null;
    document.title = 'Diccionario Vine';
    emptyReader();
    if (path.startsWith('/buscar')) {
      if (params.has('m')) setMode(params.get('m'));
      setFilter(params.get('f') || state.filter);
      if (params.has('q')) input.value = params.get('q');
      state.q = input.value.trim();
      $('#btnClear').hidden = !state.q;
      state.lastList = h;
      setNav('search');
      if (!params.has('q') && !state.q) { input.focus(); }
      return renderSearch();
    }
    if (path.startsWith('/indice')) { state.lastList = h; return viewIndex(decodeURIComponent(path.split('/')[2] || 'A')); }
    if (path.startsWith('/guardados')) { state.lastList = h; return viewSaved(); }
    state.lastList = '#/';
    return viewHome();
  }
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------------------
  // Eventos
  // ---------------------------------------------------------------------------
  input.addEventListener('input', liveSearch);
  input.addEventListener('focus', () => { if (document.body.classList.contains('reading') && !window.matchMedia('(min-width: 1000px)').matches) document.body.classList.remove('reading'); });
  $('#searchForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const first = $('.card.kbd', listPane) || $('.card', listPane);
    if (state.kbd >= 0 && first) { location.hash = first.getAttribute('href'); return; }
    runSearch(true);
    input.blur();
  });
  $('#btnClear').onclick = () => { input.value = ''; input.focus(); runSearch(false); };
  $('#modes').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    setMode(b.dataset.mode);
    if (input.value.trim()) runSearch(false); else input.focus();
  });
  $('#testament').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    setFilter(b.dataset.f);
    const h = location.hash;
    if (h.startsWith('#/indice')) viewIndex(decodeURIComponent(h.split('/')[2] || 'A'));
    else if (input.value.trim()) runSearch(false);
    else if (!h.startsWith('#/e/')) route();
  });
  $('#btnRandom').onclick = async () => {
    await ready;
    const pool = state.index.map((e, i) => i).filter((i) => (!state.filter || state.index[i].t === state.filter) && !state.index[i].n);
    location.hash = '#/e/' + slugOf(pool[Math.floor(Math.random() * pool.length)]);
  };

  function applyTheme(t) {
    store.set('theme', t);
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  }
  $('#btnTheme').onclick = () => {
    const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(dark ? 'light' : 'dark');
  };

  // Teclado
  document.addEventListener('keydown', (ev) => {
    const typing = ev.target === input;
    if (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); input.focus(); input.select(); return; }
    if (ev.key === 'Escape') {
      if (document.body.classList.contains('reading') && !window.matchMedia('(min-width: 1000px)').matches) { location.hash = state.lastList || '#/'; return; }
      if (typing && input.value) { input.value = ''; runSearch(false); }
      return;
    }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      const cards = $$('.card', listPane);
      if (!cards.length || (!typing && document.activeElement !== document.body)) return;
      ev.preventDefault();
      state.kbd = Math.max(0, Math.min(cards.length - 1, state.kbd + (ev.key === 'ArrowDown' ? 1 : -1)));
      cards.forEach((c, i) => c.classList.toggle('kbd', i === state.kbd));
      cards[state.kbd].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (!typing && state.currentId != null && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      const a = $(ev.key === 'ArrowLeft' ? '.pager .prev' : '.pager .next', reader);
      if (a) location.hash = a.getAttribute('href');
    }
  });

  // Deslizar entre artículos (móvil)
  let tx = null, ty = 0;
  reader.addEventListener('touchstart', (ev) => { if (ev.touches.length === 1 && !window.getSelection().toString()) { tx = ev.touches[0].clientX; ty = ev.touches[0].clientY; } }, { passive: true });
  reader.addEventListener('touchend', (ev) => {
    if (tx == null) return;
    const dx = ev.changedTouches[0].clientX - tx, dy = ev.changedTouches[0].clientY - ty;
    tx = null;
    if (Math.abs(dx) > 90 && Math.abs(dy) < 50) {
      const a = $(dx < 0 ? '.pager .next' : '.pager .prev', reader);
      if (a) location.hash = a.getAttribute('href');
    }
  }, { passive: true });

  // Búsqueda por voz
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) {
    const mic = $('#btnMic'); mic.hidden = false;
    mic.onclick = () => {
      const rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = false;
      mic.classList.add('btn-mic-on');
      rec.onresult = (e) => { input.value = e.results[0][0].transcript.replace(/[.?!]$/, ''); runSearch(true); };
      rec.onend = () => mic.classList.remove('btn-mic-on');
      rec.onerror = () => { mic.classList.remove('btn-mic-on'); toast('No se pudo usar el micrófono'); };
      rec.start();
    };
  }

  // Altura de la barra superior (para elementos fijos)
  const setTop = () => document.documentElement.style.setProperty('--top-h', $('.topbar').offsetHeight + 'px');
  new ResizeObserver(setTop).observe($('.topbar'));
  setTop();

  // Clic en enlaces internos: cuando venimos de una lista, recordar
  listPane.addEventListener('click', (ev) => { const a = ev.target.closest('a.card'); if (a) state.cameFromApp = true; });

  // PWA
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  route();
})();
