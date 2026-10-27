/*
 * プログラミング辞書：計算の部分（画面に依存しない）
 * - 辞書JSONの書き方（ひな形・穴・フィルター・条件・行の並び）と、kind 6種類の組み立て方だけを持つ
 * - 札・エラー・例文ごとの書き方は持たない。中身は全部 dict/ のJSONから読む
 * ブラウザでは window.Engine、Node では require で使う
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================= 基本の道具 ================= */

  const toList = v => Array.isArray(v) ? v.filter(x => x !== '' && x != null)
    : String(v == null ? '' : v).split(/\s*[,、]\s*/).map(s => s.trim()).filter(Boolean);
  const isEmpty = v => Array.isArray(v) ? v.length === 0 : (v == null || String(v).trim() === '');
  const norm = s => String(s).replace(/\s+/g, ' ').trim();
  const squash = s => String(s).replace(/\s+/g, '');
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ind = d => '    '.repeat(d);
  const clone = v => JSON.parse(JSON.stringify(v));

  const FILTERS = {
    table: v => { v = String(v); return v ? v.charAt(0).toLowerCase() + v.slice(1) + 's' : ''; },
    lcfirst: v => { v = String(v); return v.charAt(0).toLowerCase() + v.slice(1); },
    ucfirst: v => { v = String(v); return v.charAt(0).toUpperCase() + v.slice(1); },
    lower: v => String(v).toLowerCase(),
    path: v => String(v).replace(/\./g, '/'),
    quote_list: v => toList(v).map(x => `'${x}'`).join(', '),
    join_dot: v => toList(v).join('・'),
    keys: v => toList(v).map(x => x.split(':')[0]).join(', '),
    concat: v => toList(v).join('')
  };

  function getVal(ctx, name) {
    if (ctx == null) return '';
    if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
    return '';
  }

  /* 穴を埋める。《@名前》 はブロックなので触らない */
  function fill(str, ctx) {
    return String(str).replace(/《([^《》]+)》/g, (m, inner) => {
      if (inner.charAt(0) === '@') return m;
      const [name, ...filters] = inner.split('|');
      let v = getVal(ctx, name);
      for (const f of filters) if (FILTERS[f]) v = FILTERS[f](v);
      if (Array.isArray(v)) v = v.join(', ');
      return v == null ? '' : String(v);
    });
  }

  /* 条件：文字1つか並び（並びは全部満たす） */
  function cond(c, ctx) {
    if (c == null) return true;
    if (Array.isArray(c)) return c.every(x => cond(x, ctx));
    c = String(c);
    let m;
    if ((m = c.match(/^([^!=]+)!=(.*)$/))) return String(getVal(ctx, m[1])) !== m[2];
    if ((m = c.match(/^([^!=]+)=(.*)$/))) return String(getVal(ctx, m[1])) === m[2];
    if (c.charAt(0) === '!') return isEmpty(getVal(ctx, c.slice(1)));
    return !isEmpty(getVal(ctx, c));
  }

  /* 行の並び → 行の配列。blocks は《@名前》の中身 */
  function lines(tpl, ctx, blocks) {
    if (tpl == null) return [];
    const items = Array.isArray(tpl) ? tpl : [tpl];
    const raw = [];
    for (const it of items) {
      if (typeof it === 'string') raw.push(fill(it, ctx));
      else if (it && it.each) {
        for (const one of toList(getVal(ctx, it.each))) {
          const c = Object.assign({}, ctx, { one });
          if (it.split) {
            const k = one.indexOf(it.split);
            c.key = k < 0 ? one : one.slice(0, k);
            c.value = k < 0 ? '' : one.slice(k + it.split.length);
          }
          raw.push(fill(it.t, c));
        }
      } else if (it && 'if' in it) { if (cond(it.if, ctx)) raw.push(fill(it.t, ctx)); }
      else if (it && 't' in it) raw.push(fill(it.t, ctx));
    }
    const out = [];
    for (const r of raw) {
      for (const l of r.split('\n')) {
        const m = l.match(/^(\s*)《@([^《》]+)》\s*$/);
        if (m) {
          const b = blocks && blocks[m[2]];
          const bl = b == null ? [] : (Array.isArray(b) ? b : String(b).split('\n'));
          for (const x of bl) out.push(x === '' ? '' : m[1] + x);
        } else out.push(l);
      }
    }
    return tidy(out);
  }
  /* 空行を2つ続けない・前後の空行を消す */
  function tidy(arr) {
    const out = [];
    for (const l of arr) {
      const e = l.trim() === '';
      if (e && (out.length === 0 || out[out.length - 1] === '')) continue;
      out.push(e ? '' : l);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out;
  }
  /* 訳など：並びはすき間なくつないで1文 */
  function text(tpl, ctx) {
    if (tpl == null) return '';
    if (typeof tpl === 'string') return fill(tpl, ctx);
    return tpl.map(it => {
      if (typeof it === 'string') return fill(it, ctx);
      if (it && 'if' in it) return cond(it.if, ctx) ? fill(it.t, ctx) : '';
      if (it && 't' in it) return fill(it.t, ctx);
      return '';
    }).join('');
  }

  /* ================= 辞書の読み込み ================= */

  const SHELF_FIELDS = {
    tags: ['id', 'name', 'lang', 'kind', 'slots', 'code', 'open', 'close', 'else', 'empty', 'tr', 'keywords', 'note', 'uses', 'arg', 'ends'],
    parts: ['id', 'lang', 'pattern', 'meaning', 'note'],
    method_names: ['id', 'name', 'when', 'guess_from', 'guess_default', 'lang'],
    returns: ['id', 'form', 'code'],
    elements: ['id', 'name', 'lang', 'place', 'slots', 'code', 'tr'],
    pages: ['id', 'kind', 'lang', 'head', 'fields', 'tags_label', 'empty_body', 'code', 'method_page', 'uses', 'uses_from_args', 'outputs', 'elements_label', 'notes'],
    error_sources: ['name', 'marks'],
    errors: ['id', 'source', 'mark', 'extract', 'happened', 'stopped', 'causes', 'steps'],
    headwords: ['word', 'aliases'],
    questions: ['id', 'text', 'type', 'options', 'default', 'show_if'],
    file_steps: ['id', 'kind', 'title', 'cmds', 'where', 'lists', 'code'],
    examples: ['id', 'text', 'words', 'ask', 'rows', 'steps']
  };
  const KINDS = ['line', 'chain', 'chain_head', 'inner', 'if', 'loop'];

  /* JSONとして読めなくなった位置（文字の番号）を探す。読めれば -1 */
  function jsonErrorPos(s) {
    let i = 0;
    const ws = () => { while (i < s.length && /[ \t\r\n]/.test(s[i])) i++; };
    const fail = () => { throw { pos: i }; };
    function str() {
      i++;
      while (i < s.length) {
        const c = s[i];
        if (c === '"') { i++; return; }
        if (c === '\\') { i += 2; continue; }
        if (c < ' ') fail();
        i++;
      }
      fail();
    }
    function val() {
      ws();
      const c = s[i];
      if (c === '{') {
        i++; ws();
        if (s[i] === '}') { i++; return; }
        for (;;) {
          ws(); if (s[i] !== '"') fail(); str(); ws();
          if (s[i] !== ':') fail(); i++; val(); ws();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === '}') { i++; return; }
          fail();
        }
      }
      if (c === '[') {
        i++; ws();
        if (s[i] === ']') { i++; return; }
        for (;;) {
          val(); ws();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === ']') { i++; return; }
          fail();
        }
      }
      if (c === '"') { str(); return; }
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i, i + 64));
      if (m && m[0]) { i += m[0].length; return; }
      for (const w of ['true', 'false', 'null']) if (s.startsWith(w, i)) { i += w.length; return; }
      fail();
    }
    try { val(); ws(); if (i < s.length) fail(); return -1; } catch (e) { if (e && typeof e.pos === 'number') return e.pos; throw e; }
  }
  function jsonErrorLine(s) {
    let p = jsonErrorPos(s);
    if (p < 0) p = s.length;
    return s.slice(0, p).split('\n').length;
  }

  function findById(d, id) {
    for (const shelf of Object.keys(SHELF_FIELDS)) {
      const arr = d[shelf];
      if (!Array.isArray(arr)) continue;
      const it = arr.find(x => x && x.id === id);
      if (it) return { shelf, item: it };
    }
    return null;
  }

  function applyItem(d, it) {
    if (!it || typeof it !== 'object') return { reason: '修正の形が型に無い' };
    if ('add' in it) {
      const shelf = it.add;
      if (!SHELF_FIELDS[shelf] || !Array.isArray(d[shelf])) return { reason: `棚の名前「${shelf}」が型に無い` };
      const v = it.value;
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { reason: '足す中身（value）が項目の形になっていない' };
      const bad = Object.keys(v).filter(k => !SHELF_FIELDS[shelf].includes(k) && k !== 'disabled');
      if (bad.length) return { reason: `欄の名前「${bad.join('・')}」が型に無い` };
      if (v.id && findById(d, v.id)) return { reason: 'この id はもう辞書にある' };
      if (shelf === 'tags') {
        if (d.tags.some(t => t.name === v.name)) return { reason: `札の名前「${v.name}」はもう辞書にある` };
        if (!KINDS.includes(v.kind)) return { reason: `kind「${v.kind}」が6種類のどれでもない` };
        if (!Array.isArray(v.slots) || v.tr == null) return { reason: '札に slots か tr が無い' };
      }
      d[shelf].push(clone(v));
      return null;
    }
    if ('id' in it) {
      const f = findById(d, it.id);
      if (!f) return { reason: '辞書にこの id が無い' };
      if (!('field' in it)) return { reason: '直す欄（field）が無い' };
      if (it.field !== 'disabled' && !SHELF_FIELDS[f.shelf].includes(it.field)) return { reason: `欄の名前「${it.field}」が型に無い` };
      if (it.field === 'id') return { reason: 'id は直せない' };
      if (f.shelf === 'tags' && it.field === 'kind' && !KINDS.includes(it.value)) return { reason: `kind「${it.value}」が6種類のどれでもない` };
      f.item[it.field] = clone(it.value);
      return null;
    }
    return { reason: '修正の形が型に無い（id か add が要る）' };
  }

  /*
   * 本体の文字と、修正ファイル（番号順・抜けた番号の手前まで）の文字から、辞書を作る
   * fixFiles: [{ file: 'fix-001.json', text }]
   */
  function buildDict(entriesText, fixFiles) {
    const base = JSON.parse(entriesText);
    const d = clone(base);
    const skipped = [];
    const applied = [];
    for (const f of fixFiles || []) {
      let j;
      try { j = JSON.parse(f.text); } catch (e) {
        skipped.push({ file: f.file, line: jsonErrorLine(f.text), reason: 'JSONとして読めない' });
        continue;
      }
      if (!j || typeof j !== 'object' || !Array.isArray(j.items)) {
        skipped.push({ file: f.file, line: 1, reason: 'items の並びが無い（修正ファイルの形が型に無い）' });
        continue;
      }
      if (j.format != null && j.format !== d.format) {
        skipped.push({ file: f.file, line: 1, reason: `format ${j.format} が本体の format ${d.format} と違う（作り直しが要る）` });
        continue;
      }
      j.items.forEach((it, i) => {
        const r = applyItem(d, it);
        if (r) skipped.push({ file: f.file, n: i + 1, id: (it && (it.id || (it.value && it.value.id))) || '（id なし）', reason: r.reason });
      });
      applied.push(f.file);
    }
    for (const shelf of Object.keys(SHELF_FIELDS)) if (Array.isArray(d[shelf])) d[shelf] = d[shelf].filter(x => !(x && x.disabled));
    return prepare({ dict: d, skipped, applied });
  }

  /*
   * 本体と修正ファイルを読む。getText(path) は文字を返す（無ければ null）
   * fix-001 から順に読み、番号が無くなったところで止まる
   */
  async function loadAll(getText) {
    const entries = await getText('dict/entries.json');
    if (entries == null) throw new Error('dict/entries.json が読めません');
    const files = [];
    for (let n = 1; n < 1000; n++) {
      const file = `fix-${String(n).padStart(3, '0')}.json`;
      const t = await getText('dict/fixes/' + file);
      if (t == null) break;
      files.push({ file, text: t });
    }
    const res = buildDict(entries, files);
    res.files = files.map(f => f.file);
    return res;
  }

  /* 未登録の一覧に足す（同じものは1回だけ） */
  function addMissing(list, text, kind) {
    const t = String(text || '').trim();
    if (!t || list.some(x => x.text === t)) return false;
    list.push({ text: t, kind: kind || '' });
    return true;
  }

  function prepare(res) {
    const d = res.dict;
    d._tagByName = {};
    for (const t of d.tags || []) d._tagByName[t.name] = t;
    d._elByName = {};
    for (const e of d.elements || []) d._elByName[e.name] = e;
    d._page = k => (d.pages || []).find(p => p.kind === k);
    res.state = {
      tags: (d.tags || []).length,
      errors: (d.errors || []).length,
      examples: (d.examples || []).length,
      last: res.applied.length ? res.applied[res.applied.length - 1].replace(/\.json$/, '') : ''
    };
    return res;
  }

  /* 形の決まり（検品用）：id・札の名前が重複しない、kind が6種類、札は slots と tr を持つ */
  function checkShape(d) {
    const errs = [];
    const ids = new Map();
    for (const shelf of Object.keys(SHELF_FIELDS)) {
      for (const it of d[shelf] || []) {
        if (it && it.id) { if (ids.has(it.id)) errs.push(`id 重複：${it.id}`); ids.set(it.id, shelf); }
      }
    }
    const names = new Set();
    for (const t of d.tags || []) {
      if (names.has(t.name)) errs.push(`札の名前 重複：${t.name}`);
      names.add(t.name);
      if (!KINDS.includes(t.kind)) errs.push(`kind が6種類のどれでもない：${t.id}`);
      if (!Array.isArray(t.slots) || t.tr == null) errs.push(`slots か tr が無い：${t.id}`);
    }
    return errs;
  }

  /* ================= コードを区切る道具 ================= */

  function stripComments(code) {
    return String(code).split('\n').filter(l => !/^\s*(\/\/|#(?!\[))/.test(l)).join('\n');
  }

  /* 文ごとに分ける（; で終わる文・{ } で閉じる文） */
  function splitStatements(code) {
    const s = String(code);
    const out = [];
    let cur = '', p = 0, b = 0, q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { cur += c; if (c === '\\') { cur += s[i + 1] || ''; i++; } else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(' || c === '[') p++;
      else if (c === ')' || c === ']') p--;
      else if (c === '{') b++;
      else if (c === '}') b--;
      cur += c;
      if (p === 0 && b === 0) {
        if (c === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; }
        else if (c === '}') {
          const rest = s.slice(i + 1).replace(/^\s+/, '');
          if (/^(else\b|elseif\b|catch\b|finally\b|;|\)|->)/.test(rest)) continue;
          if (cur.trim()) out.push(cur.trim());
          cur = '';
        }
      }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  function findOpenBrace(s, from) {
    let q = null;
    for (let i = from || 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '{') return i;
    }
    return -1;
  }
  function matchingClose(s, open, oc, cc) {
    let q = null, d = 0;
    for (let i = open; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === oc) d++;
      else if (c === cc) { d--; if (d === 0) return i; }
    }
    return -1;
  }

  /* -> でつないだものを部品に分ける（かっこ・中括弧の中は分けない） */
  function splitChain(s) {
    const out = [];
    let cur = '', p = 0, b = 0, q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { cur += c; if (c === '\\') { cur += s[i + 1] || ''; i++; } else if (c === q) q = null; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(' || c === '[') p++;
      else if (c === ')' || c === ']') p--;
      else if (c === '{') b++;
      else if (c === '}') b--;
      if (p === 0 && b === 0 && c === '-' && s[i + 1] === '>') {
        if (cur.trim()) out.push(cur.trim());
        cur = '->'; i++;
        continue;
      }
      cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  /* ================= ひな形 → 照合の型 ================= */

  const litRe = s => escRe(s).replace(/\s+/g, '\\s*');
  function tplRegex(t, fixed, opts) {
    opts = opts || {};
    let src = opts.noStart ? '' : '^\\s*';
    const names = [];
    let last = 0;
    String(t).replace(/《([^《》]+)》/g, (m, inner, off) => {
      src += litRe(t.slice(last, off));
      const [name, ...filters] = inner.split('|');
      if (fixed && Object.prototype.hasOwnProperty.call(fixed, name)) src += litRe(fill(m, fixed));
      else { src += '([\\s\\S]*?)'; names.push({ name, filters }); }
      last = off + m.length;
      return m;
    });
    src += litRe(t.slice(last));
    if (opts.tail) src += '([\\s\\S]*?)';
    if (!opts.noEnd) src += '\\s*$';
    return { re: new RegExp(src), names };
  }
  const literalCount = t => squash(String(t).replace(/《[^《》]*》/g, '')).length;

  function unfilter(v, filters) {
    v = String(v).trim();
    if (filters.includes('quote_list')) {
      const items = [];
      v.replace(/'([^']*)'|"([^"]*)"/g, (m, a, b) => { items.push(a != null ? a : b); return m; });
      return items.length ? items.join(', ') : v;
    }
    return v;
  }
  function matchTpl(t, s, fixed, opts) {
    const { re, names } = tplRegex(t, fixed, opts);
    const m = re.exec(s);
    if (!m) return null;
    const o = {};
    names.forEach((n, i) => { if (!(n.name in o)) o[n.name] = unfilter(m[i + 1], n.filters); });
    if (opts && opts.tail) o.__tail = m[names.length + 1];
    return o;
  }

  /* 条件から、照合できた時に穴へ戻す値 */
  function condSet(c) {
    const o = {};
    for (const x of (Array.isArray(c) ? c : [c])) {
      let m;
      if (x == null) continue;
      if ((m = String(x).match(/^([^!=]+)!=(.*)$/))) continue;
      if ((m = String(x).match(/^([^!=]+)=(.*)$/))) o[m[1]] = m[2];
      else if (String(x).charAt(0) === '!') o[String(x).slice(1)] = '';
    }
    return o;
  }
  /* 書き分けの一覧（固定の文字が多い順）。each を含むものは照合できない */
  function variants(tpl) {
    if (tpl == null) return [];
    if (typeof tpl === 'string') return [{ t: tpl, set: {}, lit: literalCount(tpl) }];
    if (tpl.some(x => x && typeof x === 'object' && x.each)) return [];
    const conds = tpl.filter(x => x && typeof x === 'object');
    let vs;
    if (!conds.length) vs = [{ t: tpl.join('\n'), set: {} }];
    else if (conds.length === tpl.length) vs = tpl.map(x => ({ t: x.t, set: condSet(x.if) }));
    else vs = conds.map(c => ({ t: tpl.map(x => typeof x === 'string' ? x : (x === c ? x.t : null)).filter(x => x != null).join('\n'), set: condSet(c.if) }));
    vs.forEach(v => { v.lit = literalCount(v.t); });
    return vs.sort((a, b) => b.lit - a.lit);
  }

  const defaults = tag => Object.fromEntries((tag.slots || []).map(s => [s.key, s.default == null ? '' : s.default]));
  const makeNode = (tag, o) => ({ tag: tag.name, o: Object.assign(defaults(tag), o || {}), kids: [] });

  /* ================= 正向き：コード → 札の木 ================= */

  function lineCandidates(d) {
    if (d._lineCands) return d._lineCands;
    const c = [];
    for (const tag of d.tags) {
      if (tag.kind === 'line') for (const v of variants(tag.code)) c.push({ tag, v });
      if (tag.kind === 'chain_head') for (const v of variants(tag.empty)) c.push({ tag, v, empty: true });
    }
    c.sort((a, b) => b.v.lit - a.v.lit);
    return (d._lineCands = c);
  }
  function chainCandidates(d) {
    if (d._chainCands) return d._chainCands;
    const c = [];
    for (const tag of d.tags) if (tag.kind === 'chain') for (const v of variants(tag.code)) c.push({ tag, v });
    c.sort((a, b) => b.v.lit - a.v.lit);
    return (d._chainCands = c);
  }
  function openCandidates(d, kinds) {
    const c = [];
    for (const tag of d.tags) if (kinds.includes(tag.kind)) for (const v of variants(tag.open)) c.push({ tag, v });
    return c.sort((a, b) => b.v.lit - a.v.lit);
  }

  function parseStmts(code, ctx, d) {
    return splitStatements(stripComments(code)).flatMap(s => parseStmt(s, ctx, d));
  }

  function parseStmt(s, ctx, d) {
    s = s.trim();
    if (ctx === 'q' && /^\$q\s*->/.test(s)) {
      const seg = s.replace(/^\$q\s*/, '').replace(/;\s*$/, '');
      const nodes = splitChain(seg).map(g => parseSeg(g, d));
      if (nodes.every(Boolean)) return nodes;
      return [{ unknown: true, raw: s }];
    }
    for (const c of lineCandidates(d)) {
      const o = matchTpl(c.v.t, s);
      if (o) return [makeNode(c.tag, Object.assign({}, c.v.set, o))];
    }
    const blk = parseBlock(s, d);
    if (blk) return [blk];
    for (const c of openCandidates(d, ['chain_head'])) {
      const o = matchTpl(c.v.t, s, null, { tail: true });
      if (!o) continue;
      let rest = o.__tail.trim();
      delete o.__tail;
      if (!/;$/.test(rest)) continue;
      rest = rest.replace(/;$/, '').trim();
      if (!rest) continue;
      const kids = splitChain('->' + rest).map(g => parseSeg(g, d));
      if (!kids.every(Boolean)) continue;
      const n = makeNode(c.tag, Object.assign({}, c.v.set, o));
      n.kids = kids;
      return [n];
    }
    return [{ unknown: true, raw: s }];
  }

  function parseBlock(s, d) {
    const ob = findOpenBrace(s);
    if (ob < 0) return null;
    const header = s.slice(0, ob + 1);
    const cb = matchingClose(s, ob, '{', '}');
    if (cb < 0) return null;
    const body = s.slice(ob + 1, cb);
    const tail = s.slice(cb);
    for (const c of openCandidates(d, ['if', 'loop'])) {
      const o = matchTpl(c.v.t, header);
      if (!o) continue;
      const tag = c.tag;
      let els = null, t2 = tail;
      if (tag.else) {
        const er = tplRegex(tag.else, null, { noEnd: true });
        const em = er.re.exec(tail);
        if (em && em.index === 0 && /\{\s*$/.test(em[0])) {
          const ob2 = em[0].lastIndexOf('{');
          const cb2 = matchingClose(tail, ob2, '{', '}');
          if (cb2 < 0) continue;
          els = parseStmts(tail.slice(ob2 + 1, cb2), 'stmt', d);
          t2 = tail.slice(cb2);
        }
      }
      if (!matchTpl(tag.close, t2.replace(/;\s*$/, ''))) continue;
      const n = makeNode(tag, Object.assign({}, c.v.set, o));
      n.kids = parseStmts(body, 'stmt', d);
      if (els) n.els = els;
      return n;
    }
    return null;
  }

  function parseSeg(g, d) {
    g = g.trim();
    for (const c of chainCandidates(d)) {
      const o = matchTpl(c.v.t, g);
      if (o) return makeNode(c.tag, Object.assign({}, c.v.set, o));
    }
    const ob = findOpenBrace(g);
    if (ob < 0) return null;
    const cb = matchingClose(g, ob, '{', '}');
    if (cb < 0) return null;
    const header = g.slice(0, ob + 1), body = g.slice(ob + 1, cb), tail = g.slice(cb);
    for (const c of openCandidates(d, ['inner'])) {
      const o = matchTpl(c.v.t, header);
      if (!o) continue;
      if (!matchTpl(c.tag.close, tail)) continue;
      const n = makeNode(c.tag, Object.assign({}, c.v.set, o));
      n.kids = parseStmts(body, 'q', d);
      return n;
    }
    return null;
  }

  /* ================= 逆向き：札の木 → コード ================= */

  const tagOf = (d, n) => n && !n.unknown ? d._tagByName[n.tag] : null;
  const trOf = (d, n) => { const t = tagOf(d, n); return t ? text(t.tr, n.o) : ''; };

  function renderNodes(nodes, ctx, dep, d, trs) {
    const L = [];
    for (const n of nodes || []) {
      if (n.unknown) {
        const rl = String(n.raw).split('\n').map(x => x.trim());
        rl.forEach((x, i) => L.push(ind(dep + (i && i < rl.length - 1 ? 1 : 0)) + x));
        if (trs) trs.push({ code: norm(n.raw), tr: null, tag: null, id: null, unknown: true });
        continue;
      }
      const tag = tagOf(d, n);
      if (!tag) {
        L.push(ind(dep) + `// ${n.tag}（辞書にない札）`);
        if (trs) trs.push({ code: `// ${n.tag}（辞書にない札）`, tr: null, tag: n.tag, id: null, unknown: true });
        continue;
      }
      const o = n.o, first = L.length, slot = trs ? trs.length : 0;
      if (trs) trs.push(null);
      const q = arr => {
        if (ctx === 'q' && arr.length) { arr[0] = '$q' + arr[0]; arr[arr.length - 1] += ';'; }
        return arr;
      };
      if (tag.kind === 'chain_head') {
        if (!n.kids || !n.kids.length) lines(tag.empty, o).forEach(x => L.push(ind(dep) + x));
        else {
          const ch = n.kids.map(k => renderNodes([k], 'chain', dep + 1, d, trs));
          const head = text(tag.open, o) + ch[0][0].trim().replace(/^->/, '');
          L.push(ind(dep) + head, ...ch[0].slice(1));
          ch.slice(1).forEach(c => L.push(...c));
          L[L.length - 1] += ';';
        }
      } else if (tag.kind === 'inner') {
        const op = (ctx === 'q' ? '$q' : '') + (lines(tag.open, o)[0] || '');
        const cl = lines(tag.close, o)[0] || '';
        L.push(ind(dep) + op,...renderNodes(n.kids, 'q', dep + 1, d, trs), ind(dep) + (ctx === 'q' ? cl + ';' : cl));
      } else if (tag.kind === 'if' || tag.kind === 'loop') {
        L.push(ind(dep) + (lines(tag.open, o)[0] || ''), ...renderNodes(n.kids, 'stmt', dep + 1, d, trs));
        if (n.els && n.els.length && tag.else) L.push(ind(dep) + lines(tag.else, o)[0], ...renderNodes(n.els, 'stmt', dep + 1, d, trs));
        L.push(ind(dep) + (lines(tag.close, o)[0] || ''));
      } else {
        const cl = lines(tag.code, o);
        if (tag.kind === 'chain') q(cl);
        cl.forEach(x => L.push(ind(dep) + x));
      }
      if (trs) trs[slot] = { code: (L[first] || '').trim(), tr: text(tag.tr, o), tag: tag.name, id: tag.id };
    }
    return L;
  }

  /* ================= メモ ================= */

  function memoTagLines(nodes, dep, d) {
    const out = [];
    for (const n of nodes || []) {
      if (n.unknown) continue;
      const tag = tagOf(d, n);
      const v = tag ? (tag.slots || []).map(s => n.o[s.key] == null ? '' : String(n.o[s.key])) : [];
      while (v.length && v[v.length - 1] === '') v.pop();
      out.push('  '.repeat(dep) + n.tag + '：' + v.join(' / '));
      out.push(...memoTagLines(n.kids, dep + 1, d));
      if (n.els) { out.push('  '.repeat(dep) + 'そうでなければ'); out.push(...memoTagLines(n.els, dep + 1, d)); }
    }
    return out;
  }

  function parseTagLines(lns, d) {
    const root = { kids: [] };
    const stack = [{ n: root, dep: -1, key: 'kids' }];
    for (const raw of lns) {
      if (!raw.trim()) continue;
      const dep = Math.floor(raw.match(/^ */)[0].length / 2);
      const t = raw.trim();
      while (stack.length > 1 && stack[stack.length - 1].dep >= dep) stack.pop();
      const top = stack[stack.length - 1];
      if (t === 'そうでなければ') {
        const arr = top.n[top.key];
        const last = arr[arr.length - 1];
        if (last) { last.els = []; stack.push({ n: last, dep, key: 'els' }); }
        continue;
      }
      const m = t.match(/^([^：:]+)[：:]?\s*(.*)$/);
      const name = m[1].trim();
      const arr = m[2] === '' ? [] : m[2].split(' / ').map(x => x.trim());
      const tag = d._tagByName[name];
      const node = { tag: name, o: tag ? defaults(tag) : {}, kids: [] };
      if (tag) (tag.slots || []).forEach((s, i) => { if (arr[i] !== undefined) node.o[s.key] = arr[i]; });
      top.n[top.key].push(node);
      stack.push({ n: node, dep, key: 'kids' });
    }
    return root.kids;
  }

  /* まとめの文（自由文）→ キーワードで札を拾う。続いた chain は取り出し始めの下に */
  function keywordNodes(v, d) {
    const found = d.tags.map((t, i) => ({ t, i, pos: Math.min(...(t.keywords || []).map(k => { const p = v.indexOf(k); return p < 0 ? Infinity : p; }), Infinity) }))
      .filter(x => x.pos < Infinity).sort((a, b) => a.pos - b.pos || a.i - b.i).map(x => x.t);
    const head = d.tags.find(t => t.kind === 'chain_head');
    const out = [];
    let chain = null;
    for (const t of found) {
      if (t.kind === 'chain' && head) {
        if (!chain) { chain = makeNode(head); out.push(chain); }
        chain.kids.push(makeNode(t));
      } else { chain = null; out.push(makeNode(t)); }
    }
    return out;
  }

  function flat(nodes) {
    return (nodes || []).flatMap(n => [n, ...flat(n.kids), ...flat(n.els)]);
  }
  function flatPaths(nodes, p) {
    p = p || '';
    return (nodes || []).flatMap((n, i) => [{ n, path: p + i, depth: (p.match(/[-e]/g) || []).length, inElse: /e/.test(p) }, ...flatPaths(n.kids, p + i + '-'), ...flatPaths(n.els, p + i + 'e')]);
  }

  /* ================= メソッド ================= */

  function methodWhen(d, name) {
    const mn = d.method_names || [];
    let hit = mn.find(m => m.name === name);
    if (!hit) hit = mn.find(m => m.name.length > 1 && m.name.endsWith('*') && name.startsWith(m.name.slice(0, -1)));
    if (!hit) hit = mn.find(m => m.name === '*');
    return hit ? { text: fill(hit.when, { name }), id: hit.id } : { text: `${name}が呼ばれた時`, id: null };
  }
  function guessName(d, nodes) {
    const used = new Set(flat(nodes).map(n => n.tag));
    const mn = d.method_names || [];
    for (const m of mn) if ((m.guess_from || []).some(t => used.has(t))) return m.name;
    const def = mn.find(m => m.guess_default);
    return def ? def.name : 'index';
  }
  function guessArg(d, nodes) {
    const a = [];
    for (const n of flat(nodes)) { const t = tagOf(d, n); if (t && t.arg && !a.includes(t.arg)) a.push(t.arg); }
    return a.join(', ');
  }

  /* return の1行 → 戻り値の書き方 */
  function returnForm(d, line) {
    const L = norm(line);
    for (const r of d.returns || []) {
      const m = /《([^《》|]+)[^《》]*》/.exec(r.code);
      if (!m) { if (squash(L) === squash(r.code)) return { form: fill(r.form, {}), id: r.id }; continue; }
      const pre = squash(r.code.slice(0, m.index));
      const after = r.code.slice(m.index + m[0].length);
      const delim = after.charAt(0);
      const S = squash(L);
      if (!S.startsWith(pre)) continue;
      const rest = S.slice(pre.length);
      const end = delim ? rest.indexOf(delim) : rest.length;
      if (end <= 0) continue;
      return { form: fill(r.form, { [m[1]]: rest.slice(0, end) }), id: r.id };
    }
    return null;
  }
  /* 戻り値の書き方 → return の1行 */
  function returnLine(d, ret) {
    if (!ret) return '';
    for (const r of d.returns || []) {
      const o = matchTpl(r.form, ret);
      if (o) return fill(r.code, o);
    }
    return '';
  }

  function hasEnds(d, nodes) { return flat(nodes).some(n => { const t = tagOf(d, n); return t && t.ends; }); }

  function methodLines(d, m, trs) {
    const page = d._page('method');
    const body = renderNodes(m.nodes, 'stmt', 0, d, trs);
    if (!hasEnds(d, m.nodes)) { const r = returnLine(d, m.ret); if (r) body.push(r); }
    if (!body.length && page.empty_body) body.push(page.empty_body);
    return lines(page.code, { [page.head.key]: m.name, arg: m.arg, ret: m.ret, sum: m.sum }, { body });
  }

  /* コード1つ分の関数を読む */
  function parseMethodAt(code, start, d) {
    const s = code.slice(start);
    let m = /function\s+(\w+)\s*\(/.exec(s);
    let name, argOpen;
    if (m) { name = m[1]; argOpen = m.index + m[0].length - 1; }
    else if ((m = /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/.exec(s))) { name = m[1]; argOpen = m.index + m[0].length - 1; }
    else return null;
    const argClose = matchingClose(s, argOpen, '(', ')');
    if (argClose < 0) return null;
    const arg = norm(s.slice(argOpen + 1, argClose));
    const ob = findOpenBrace(s, argClose);
    if (ob < 0) return null;
    const cb = matchingClose(s, ob, '{', '}');
    if (cb < 0) return null;
    const body = s.slice(ob + 1, cb);
    return { name, arg, body, end: start + cb + 1, nodes: parseStmts(body, 'stmt', d) };
  }

  /* 流れ・まとめ・前提の条件 */
  function describe(d, n) {
    if (n.unknown) return `（辞書にない処理：${norm(n.raw)}）`;
    const t = tagOf(d, n);
    if (!t) return `（辞書にない札：${n.tag}）`;
    const first = t.slots && t.slots[0] ? n.o[t.slots[0].key] : '';
    const kids = (n.kids || []).map(k => describe(d, k)).join('、');
    if (t.kind === 'if') {
      let s = `もし ${first} なら、${kids}`;
      if (n.els && n.els.length) s += `。そうでなければ、${n.els.map(k => describe(d, k)).join('、')}`;
      return s;
    }
    if (t.kind === 'loop') return `${first} を1件ずつ取り出して、${kids}`;
    if (t.kind === 'inner' || t.kind === 'chain_head') return kids ? `${trOf(d, n)}（${kids}）` : trOf(d, n);
    return trOf(d, n);
  }
  function mergedTr(d, group) {
    const t = tagOf(d, group[0]);
    const o = {};
    for (const s of t.slots || []) {
      const vals = [];
      group.forEach(n => { const v = n.o[s.key]; if (!vals.includes(v)) vals.push(v); });
      o[s.key] = vals.join(' と ');
    }
    return text(t.tr, o);
  }
  function flowSteps(d, nodes) {
    const steps = [];
    let i = 0;
    while (i < nodes.length) {
      const n = nodes[i];
      let j = i + 1;
      if (!n.unknown) while (j < nodes.length && !nodes[j].unknown && nodes[j].tag === n.tag) j++;
      const group = nodes.slice(i, j);
      const t = tagOf(d, n);
      if (group.length >= 2 && t) {
        if (t.kind === 'chain' || t.kind === 'inner') steps.push(`「${t.name}」を${group.length}個重ねる：${group.map(g => describe(d, g)).join('、')}`);
        else if (group.every(g => !(g.kids && g.kids.length) && !g.els)) steps.push(mergedTr(d, group));
        else group.forEach(g => steps.push(describe(d, g)));
      } else if (t && t.kind === 'chain_head' && n.kids && n.kids.length) {
        steps.push(trOf(d, n));
        steps.push(...flowSteps(d, n.kids));
      } else steps.push(describe(d, n));
      i = j;
    }
    return steps;
  }
  function joinFlow(steps) {
    if (!steps.length) return '';
    if (steps.length === 1) return steps[0] + '。';
    if (steps.length === 2) return `まず、${steps[0]}。最後に、${steps[1]}。`;
    return steps.map((s, i) => (i === 0 ? 'まず、' : i === steps.length - 1 ? '最後に、' : '次に、') + s + '。').join('');
  }
  function summaryTags(nodes) {
    const names = [];
    for (const n of nodes) if (!n.unknown && !names.includes(n.tag)) names.push(n.tag);
    return names.slice(0, 3).join('、');
  }

  function methodForward(code, d) {
    const m = parseMethodAt(code, 0, d);
    if (!m) return null;
    return methodInfo(d, m);
  }
  function methodInfo(d, m) {
    const when = methodWhen(d, m.name);
    const all = flat(m.nodes);
    let ret = null;
    for (const n of all) {
      const t = tagOf(d, n);
      if (t && t.ends) { ret = returnForm(d, renderNodes([n], 'stmt', 0, d)[0] || ''); if (ret) break; }
    }
    if (!ret) for (const n of all) if (n.unknown && /^return\b/.test(n.raw)) { ret = returnForm(d, n.raw); if (ret) break; }
    const sum = summaryTags(m.nodes);
    const conds = all.filter(n => { const t = tagOf(d, n); return t && (t.slots || []).some(s => s.key === 'cond'); })
      .map(n => ({ text: describe(d, n), id: tagOf(d, n).id }));
    const notes = [];
    for (const n of all) { const t = tagOf(d, n); if (t && t.note && !notes.some(x => x.id === t.id)) notes.push({ text: t.note, id: t.id }); }
    const trs = [];
    renderNodes(m.nodes, 'stmt', 0, d, trs);
    const page = d._page('method');
    const memo = [`【${page.head.label}】${m.name}`];
    const fv = { arg: m.arg, ret: ret ? ret.form : '', sum };
    for (const f of page.fields) memo.push(`${f.label}：${fv[f.key] == null ? '' : fv[f.key]}`);
    memo.push(`${page.tags_label}：`, ...memoTagLines(m.nodes, 0, d));
    return {
      name: m.name, arg: m.arg, when, sum, ret, conds, notes, trs,
      flow: joinFlow(flowSteps(d, m.nodes)),
      memo: memo.join('\n'),
      nodes: m.nodes,
      unknown: all.filter(n => n.unknown).map(n => norm(n.raw))
    };
  }

  /* ================= メモを読む ================= */

  function memoField(text, label) {
    const m = new RegExp('【' + escRe(label) + '】[ \\t]*([^\\n]*)').exec(text);
    return m ? m[1].trim() : null;
  }
  function parseMethodMemos(v, d) {
    const page = d._page('method');
    const re = new RegExp('^\\s*【' + escRe(page.head.label) + '】', 'm');
    const parts = v.split(new RegExp('^\\s*(?=【' + escRe(page.head.label) + '】)', 'm')).filter(b => re.test(b));
    return parts.map(b => {
      b = b.replace(re, '');
      const ls = b.split('\n');
      const out = { name: ls[0].trim() || page.head.default || 'index' };
      for (const f of page.fields) {
        const m = new RegExp('^\\s*' + escRe(f.label) + '[：:][ \\t]*(.*)$', 'm').exec(b);
        out[f.key] = m ? m[1].trim() : (f.default || '');
      }
      const ti = ls.findIndex(l => new RegExp('^\\s*' + escRe(page.tags_label) + '[：:]\\s*$').test(l));
      if (ti < 0) {
        out.nodes = keywordNodes(out.sum || '', d);
        out.fromSummary = true;
      } else {
        const tl = [];
        for (const l of ls.slice(ti + 1)) { if (/^\s*【/.test(l)) break; tl.push(l); }
        out.nodes = parseTagLines(tl, d);
      }
      return out;
    });
  }

  /* ================= ページ（バックエンド） ================= */

  function backForward(code, d) {
    const page = d._page('back');
    const mpage = d._page('method');
    const cm = /class\s+(\w+)/.exec(code);
    const controller = cm ? cm[1] : '';
    const models = [];
    code.replace(/use\s+App\\Models\\(\w+)\s*;/g, (m, x) => { models.push(x); return m; });
    const auth = /Auth::|auth\(\)/.test(code) ? 'いる' : 'いらない';
    const methods = [];
    const re = /function\s+\w+\s*\(/g;
    let mm, from = 0;
    while ((mm = re.exec(code))) {
      if (mm.index < from) continue;
      const m = parseMethodAt(code, mm.index, d);
      if (!m) break;
      methods.push(methodInfo(d, m));
      from = m.end;
      re.lastIndex = m.end;
    }
    const role = `${controller.replace(/Controller$/, '')}の${methods.map(m => m.name).join('・')}をする係`;
    const vals = { controller, models: models.join(', '), auth, route: '' };
    const memo = [`【${page.head.label}】${role}`];
    for (const f of page.fields) memo.push(`【${f.label}】${vals[f.key] == null ? '' : vals[f.key]}`);
    const L = [...memo];
    for (const m of methods) L.push(m.memo);
    const read = [
      { text: `【${page.head.label}】${role}：class の名前 ${controller} と、メソッドの名前 ${methods.map(m => m.name).join('・')} から` },
      { text: `【${field(page, 'controller')}】class の名前から` },
      { text: `【${field(page, 'models')}】${models.length ? 'use App\\Models\\ の行から' : 'use App\\Models\\ の行が無いので空欄'}` },
      { text: `【${field(page, 'auth')}】${auth}：${auth === 'いる' ? 'Auth:: か auth() を使っているため' : 'Auth:: も auth() も使っていないため'}` },
      { text: `【${field(page, 'route')}】このファイルだけでは分からないので空欄。routes/web.php の1行を見て埋める` }
    ];
    const trs = methods.flatMap(m => m.trs);
    const unknown = methods.flatMap(m => m.unknown);
    return { memo: L.join('\n'), read, trs, unknown, methods, id: page.id, mpageId: mpage.id };
  }
  function field(page, key) { const f = page.fields.find(x => x.key === key); return f ? f.label : key; }

  function splitVals(f, v) {
    const o = {};
    if (f.split) {
      const p = String(v || '').trim().split(/\s+/);
      f.split.forEach((k, i) => { o[`${f.key}.${k}`] = i < f.split.length - 1 ? (p[i] || '') : p.slice(i).join(' '); });
    }
    return o;
  }
  function pageCtx(page, vals) {
    const ctx = {};
    for (const f of page.fields) { ctx[f.key] = vals[f.key] == null ? '' : vals[f.key]; Object.assign(ctx, splitVals(f, ctx[f.key])); }
    return ctx;
  }

  function parseBackMemo(v, d) {
    const page = d._page('back');
    const vals = { [page.head.key]: memoField(v, page.head.label) || page.head.default || '' };
    for (const f of page.fields) { const x = memoField(v, f.label); vals[f.key] = x == null ? (f.default || '') : x; }
    return { vals, methods: parseMethodMemos(v, d) };
  }
  function backRender(d, vals, methods) {
    const page = d._page('back');
    const ctx = pageCtx(page, vals);
    ctx.first_method = methods[0] ? methods[0].name : '';
    const trs = [];
    const ml = methods.map(m => methodLines(d, m, trs));
    const methodsBlock = [];
    ml.forEach((l, i) => { if (i) methodsBlock.push(''); methodsBlock.push(...l); });
    const uses = [];
    const push = x => { if (x && !uses.includes(x)) uses.push(x); };
    lines(page.uses, ctx).forEach(push);
    for (const u of page.uses_from_args || []) if (methods.some(m => String(m.arg || '').includes(u.has))) push(fill(u.t, ctx));
    for (const m of methods) for (const n of flat(m.nodes)) { const t = tagOf(d, n); if (t && t.uses) t.uses.forEach(push); }
    const outputs = (page.outputs || []).map(o => {
      if (o.need && !cond(o.need, ctx)) return { title: fill(o.title, ctx), missing: o.missing };
      return { title: fill(o.title, ctx), code: lines(o.code, ctx, { uses, methods: methodsBlock }).join('\n') };
    });
    return { outputs, trs };
  }

  /* ================= ページ（フロントエンド） ================= */

  function elementSeq(el, pctx) {
    const seq = [];
    for (const it of el.code || []) {
      let t, c = null;
      if (typeof it === 'string') t = it;
      else { t = it.t; c = it.if == null ? null : (Array.isArray(it.if) ? it.if : [it.if]); }
      if (c) {
        const pc = c.filter(x => /^!?page\./.test(x));
        if (!cond(pc, pctx)) continue;
        c = c.filter(x => !/^!?page\./.test(x));
      }
      if (!t.trim()) continue;
      seq.push({ t: t.trim(), optional: !!(c && c.length), set: c ? condSet(c) : {} });
    }
    return seq;
  }
  function frontForward(code, d) {
    const page = d._page('front');
    const layoutM = /@extends\(\s*['"]([^'"]+)['"]\s*\)/.exec(code);
    const counts = new Map();
    code.replace(/class="([^"]*)"/g, (m, c) => {
      c.split(/\s+/).forEach(x => { const i = x.indexOf('__'); if (i > 0) { const b = x.slice(0, i); counts.set(b, (counts.get(b) || 0) + 1); } });
      return m;
    });
    let blk = '', best = 0;
    for (const [k, v] of counts) if (v > best) { blk = k; best = v; }
    const fm = /<form\b[^>]*>/i.exec(code);
    let send = '';
    if (fm) {
      const a = /action="([^"]*)"/i.exec(fm[0]), mt = /method="([^"]*)"/i.exec(fm[0]);
      if (a) send = `${(mt ? mt[1] : 'GET').toUpperCase()} ${a[1]}`;
    }
    const old = /old\(/.test(code) ? 'する' : 'しない';
    const err = /@error\(/.test(code) ? 'する' : 'しない';
    const pctx = { 'page.blk': blk, 'page.old': old, 'page.err': err, 'page.layout': layoutM ? layoutM[1] : '' };
    const ls = code.split('\n').map(x => x.trim()).filter(Boolean);
    const found = [];
    const seqs = (d.elements || []).map(el => ({ el, seq: elementSeq(el, pctx) }));
    let i = 0;
    while (i < ls.length) {
      let hit = null;
      for (const { el, seq } of seqs) {
        let j = i, o = {}, ok = true;
        for (const it of seq) {
          const m = j < ls.length ? matchTpl(it.t, ls[j], pctx) : null;
          if (m) { for (const k in m) if (!(k in o)) o[k] = m[k]; Object.assign(o, Object.assign({}, it.set, o)); j++; }
          else if (!it.optional) { ok = false; break; }
        }
        if (ok && j > i) { hit = { el, o, next: j }; break; }
      }
      if (hit) {
        const o = Object.fromEntries((hit.el.slots || []).map(s => [s.key, hit.o[s.key] == null ? (s.default || '') : hit.o[s.key]]));
        found.push({ el: hit.el, o });
        i = hit.next;
      } else i++;
    }
    const top = found.find(f => f.el.place === 'top' && (f.el.slots || []).some(s => s.key === 'text'));
    const screen = top ? `${top.o.text}画面` : blk;
    const vals = { file: '', layout: layoutM ? layoutM[1] : '', blk, send, old, err };
    const memo = [`【${page.head.label}】${screen}`];
    for (const f of page.fields) memo.push(`【${f.label}】${vals[f.key] == null ? '' : vals[f.key]}`);
    memo.push(`【${page.elements_label}】`);
    for (const f of found) {
      const v = (f.el.slots || []).map(s => f.o[s.key] || '');
      while (v.length && v[v.length - 1] === '') v.pop();
      memo.push(`${f.el.name}：${v.join(' / ')}`);
    }
    const read = [
      { text: `【${field(page, 'file')}】中身からは分からないので空欄` },
      { text: `【${field(page, 'layout')}】${vals.layout ? `@extends('${vals.layout}') から` : '@extends が無いので空欄'}` },
      { text: `【${field(page, 'blk')}】__ の前で一番多い名前 ${blk || '（なし）'} をブロック名として読む（BEM）` },
      { text: `【${field(page, 'send')}】${send ? `form の method と action から ${send}` : 'form が無いので空欄'}` },
      { text: `【${field(page, 'old')}】${old}：${old === 'する' ? 'old() がある（パスワードの欄は残さない）' : 'old() が無い'}` },
      { text: `【${field(page, 'err')}】${err}：${err === 'する' ? '@error がある' : '@error が無い'}` }
    ];
    const trs = found.map(f => ({ tr: text(f.el.tr, f.o), id: f.el.id, tag: f.el.name }));
    return { memo: memo.join('\n'), read, trs, id: page.id };
  }

  function parseFrontMemo(v, d) {
    const page = d._page('front');
    const vals = { [page.head.key]: memoField(v, page.head.label) || '' };
    for (const f of page.fields) { const x = memoField(v, f.label); vals[f.key] = x == null ? (f.default || '') : x; }
    const ls = v.split('\n');
    const i0 = ls.findIndex(l => l.trim() === `【${page.elements_label}】`);
    const els = (i0 < 0 ? [] : ls.slice(i0 + 1)).filter(l => l.trim() && !/^\s*【/.test(l)).map(l => {
      const m = l.trim().match(/^([^：:]+)[：:]\s*(.*)$/);
      if (!m) return null;
      const el = d._elByName[m[1].trim()];
      const a = m[2].split(' / ').map(x => x.trim());
      if (!el) return { name: m[1].trim(), raw: m[2], o: {} };
      return { name: el.name, o: Object.fromEntries((el.slots || []).map((s, i) => [s.key, a[i] != null && a[i] !== '' ? a[i] : (i < a.length ? '' : (s.default || ''))])) };
    }).filter(Boolean);
    return { vals, els };
  }
  function frontRender(d, vals, els) {
    const page = d._page('front');
    const ctx = pageCtx(page, vals);
    const pctx = {};
    for (const f of page.fields) pctx[`page.${f.key}`] = ctx[f.key];
    const blocks = { top: [], form: [], bottom: [] };
    for (const e of els) {
      const el = d._elByName[e.name];
      let L, place;
      if (!el) { L = [`{{-- ${e.name}：${e.raw}（辞書にない要素） --}}`]; place = 'bottom'; }
      else { L = lines(el.code, Object.assign({}, e.o, pctx)); place = el.place; }
      const b = blocks[place] || blocks.bottom;
      if (b.length) b.push('');
      b.push(...L);
    }
    const outputs = (page.outputs || []).map(o => ({ title: fill(o.title, ctx), code: lines(o.code, ctx, blocks).join('\n') }));
    const notes = (page.notes || []).filter(n => cond(n.if, ctx)).map(n => ({ code: n.code, tr: n.tr }));
    const trs = els.map(e => {
      const el = d._elByName[e.name];
      return el ? { tr: text(el.tr, e.o), id: el.id, tag: el.name } : { tr: `${e.name}（辞書にない要素）`, id: null, tag: e.name, unknown: true };
    });
    return { outputs, notes, trs };
  }

  /* ================= 1行 ================= */

  function partsOf(s, d) {
    const out = [];
    for (const p of d.parts || []) {
      const { re, names } = tplRegex(p.pattern, null, { noStart: true, noEnd: true });
      const m = re.exec(s);
      if (!m) continue;
      const o = {};
      names.forEach((n, i) => { if (!(n.name in o)) o[n.name] = unfilter(m[i + 1], n.filters); });
      out.push({ code: m[0].trim(), meaning: fill(p.meaning, o), id: p.id, note: p.note || '' });
    }
    return out;
  }
  function lineForward(code, d) {
    const stmts = splitStatements(stripComments(code));
    const rows = [];
    const parts = [];
    for (const s of stmts) {
      const nodes = parseStmt(s, 'stmt', d);
      const n = nodes[0];
      const ps = partsOf(s, d);
      ps.forEach(p => { if (!parts.some(x => x.id === p.id)) parts.push(p); });
      if (n.unknown) rows.push({ code: s, miss: !ps.length, tr: ps.length ? `（辞書にない：${norm(s)}）` : null });
      else {
        const t = tagOf(d, n);
        rows.push({ code: s, tr: describe(d, n), id: t.id, tag: t.name, note: t.note || '' });
      }
    }
    return { rows, parts };
  }

  function rlineCandidates(v, d) {
    return d.tags.map((t, i) => ({ t, i, n: (t.keywords || []).filter(k => v.includes(k)).length }))
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 5).map(x => x.t);
  }
  function renderOne(d, tag, o) {
    const n = makeNode(tag, o);
    const trs = [];
    const ctx = tag.kind === 'chain' || tag.kind === 'inner' ? 'chain' : 'stmt';
    const L = renderNodes([n], ctx, 0, d, trs);
    return { code: L.join('\n'), tr: text(tag.tr, n.o), id: tag.id };
  }

  /* ================= 判定 ================= */

  function detectCode(v, d) {
    if (/^\s*【/m.test(v)) {
      const heads = ['back', 'front'].map(k => d._page(k)).filter(Boolean).map(p => `【${p.head.label}】`);
      return heads.some(h => v.includes(h)) ? 'rpage' : 'rmethod';
    }
    const codeLike = /[;{}$<>]|->|=>|::|^\s*(php|npm|git|docker|cd)\b/m.test(v);
    if (!codeLike) {
      const n = d.tags.filter(t => (t.keywords || []).some(k => v.includes(k))).length;
      return n >= 2 ? 'rmethod' : 'rline';
    }
    if (/<\?php|\bclass\s+\w+/.test(v)) return 'back';
    if (/@extends|@section|\{\{|export default|return\s*\(\s*</.test(v)) return 'front';
    if (/function\s+\w+\s*\(|=>\s*\{/.test(v)) return 'method';
    return 'line';
  }

  /* ================= エラー ================= */

  function errorFind(v, d, forced) {
    const ls = String(v).split('\n');
    for (const line of ls) {
      if (!line.trim()) continue;
      const e = (d.errors || []).find(x => line.includes(x.mark) && (!forced || x.source === forced || x.source === 'どこでも'));
      const src = (d.error_sources || []).map(s => ({ s, mark: (s.marks || []).find(m => line.includes(m)) })).find(x => x.mark);
      if (e) {
        const s = (d.error_sources || []).find(x => x.name === e.source);
        const mark = (s && (s.marks || []).find(m => line.includes(m))) || e.mark;
        return { error: e, line, source: forced || e.source, mark };
      }
      if (src) return { error: null, line, source: forced || src.s.name, mark: src.mark };
    }
    if (forced) return { error: null, line: ls.find(l => l.trim()) || '', source: forced, mark: null };
    return null;
  }
  function errorView(found) {
    const e = found.error;
    let vars = {};
    if (e.extract) { try { const m = new RegExp(e.extract).exec(found.line); if (m && m.groups) vars = Object.assign({}, m.groups); } catch (x) { /* 抜き出せない時は空のまま */ } }
    const F = s => fill(s, vars);
    return {
      id: e.id, vars,
      happened: (e.happened || []).map(F),
      stopped: e.stopped ? { at: e.stopped.at, where: F(e.stopped.where || ''), ok: F(e.stopped.ok || '') } : null,
      causes: (e.causes || []).slice(0, 3).map(F),
      steps: (e.steps || []).map(s => ({
        cmd: F(s.cmd), desc: F(s.desc || ''),
        branches: (s.branches || []).map(b => ({
          text: F(b.label) + ' → ' + (b.go === 'step' ? `手順${b.step}へ` : b.go === 'cause' ? `確定：${F(b.text || '')}（候補${b.cause}）` : '辞書の外。未登録の一覧へ'),
          when: b.when, go: b.go
        }))
      }))
    };
  }
  function branchHit(when, txt, emptyPressed, vars) {
    const t = String(txt || '');
    if (!t.trim() && !emptyPressed) return false;
    const low = t.toLowerCase();
    const F = s => fill(s, vars || {}).toLowerCase();
    if (!when) return false;
    if (when.empty) return !!emptyPressed && !t.trim();
    if (when.line_has) { const ws = when.line_has.map(F); return t.split('\n').some(l => ws.every(w => l.toLowerCase().includes(w))); }
    if (when.has != null) return low.includes(F(when.has));
    if (when.not_has != null) return !!t.trim() && !low.includes(F(when.not_has));
    return false;
  }

  /* ================= 機能解説 ================= */

  function featHits(v, d) {
    return (d.headwords || []).filter(h => [h.word, ...(h.aliases || [])].some(w => w && v.includes(w))).map(h => h.word);
  }
  function featRank(v, d) {
    const hits = featHits(v, d);
    const ranked = (d.examples || []).map((e, i) => ({ e, i, n: (e.words || []).filter(w => hits.includes(w)).length }))
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i).slice(0, 5);
    return { hits, ranked };
  }
  function featDefaultSelection(ranked) {
    return ranked.filter(x => x.n >= 2).sort((a, b) => a.i - b.i).map(x => x.e.id);
  }
  function featQuestions(d, selected, answers) {
    const ask = new Set();
    for (const id of selected) { const e = (d.examples || []).find(x => x.id === id); if (e) (e.ask || []).forEach(a => ask.add(a)); }
    const ctx = featAnswers(d, answers);
    return (d.questions || []).filter(q => ask.has(q.id) && cond(q.show_if, ctx));
  }
  function featAnswers(d, answers) {
    const ctx = {};
    for (const q of d.questions || []) ctx[q.id] = q.default == null ? '' : q.default;
    for (const k in answers || {}) if (answers[k] != null) ctx[k] = answers[k];
    return ctx;
  }
  function featResult(v, d, selected, answers) {
    const ctx = featAnswers(d, answers);
    const order = d.step_order || [];
    const frags = String(v).split(/[。、\n]/).map(x => x.trim()).filter(Boolean);
    const aliasOf = w => { const h = (d.headwords || []).find(x => x.word === w); return h ? [h.word, ...(h.aliases || [])] : [w]; };
    const exs = selected.map(id => (d.examples || []).find(x => x.id === id)).filter(Boolean);
    const rows = [];
    let seq = 0;
    for (const e of exs) for (const r of e.rows || []) {
      if (!cond(r.if, ctx)) continue;
      let txt, pos = Infinity;
      if (r.fixed != null) txt = r.fixed;
      else {
        let best = -1, bi = -1;
        frags.forEach((f, i) => { const c = (r.words || []).filter(w => aliasOf(w).some(a => f.includes(a))).length; if (c > best) { best = c; bi = i; } });
        if (best > 0) { txt = frags[bi]; pos = bi; } else txt = `（${(r.words || []).join('・')}）`;
      }
      const key = `${txt}|${r.action}|${r.files}`;
      if (rows.some(x => x.key === key)) continue;
      const ks = String(r.files || '').split(/[・,、]/).map(x => order.indexOf(x.trim())).filter(x => x >= 0);
      rows.push({ key, text: txt, action: fill(r.action, ctx), files: r.files, k1: ks.length ? Math.min(...ks) : order.length, k2: pos, k3: seq++, ex: e.id });
    }
    rows.sort((a, b) => a.k1 - b.k1 || a.k2 - b.k2 || a.k3 - b.k3);
    const items = [];
    const boxes = {};
    for (const e of exs) for (const s of e.steps || []) {
      if (!cond(s.if, ctx)) continue;
      if (s.to) {
        const fs = (d.file_steps || []).find(x => x.id === s.to);
        if (!fs) continue;
        if (!boxes[fs.id]) { boxes[fs.id] = { fs, lists: {}, kind: fs.kind, seq: items.length, from: [] }; items.push(boxes[fs.id]); }
        const b = boxes[fs.id];
        if (!b.from.includes(e.id)) b.from.push(e.id);
        for (const k of Object.keys(s.add || {})) {
          b.lists[k] = b.lists[k] || [];
          for (const x of s.add[k]) if (!b.lists[k].includes(x)) b.lists[k].push(x);
        }
      } else items.push({ own: s, kind: s.kind, seq: items.length, from: [e.id] });
    }
    const idx = k => { const i = order.indexOf(k); return i < 0 ? order.length : i; };
    items.sort((a, b) => idx(a.kind) - idx(b.kind) || a.seq - b.seq);
    const steps = items.map(it => {
      if (it.own) {
        const s = it.own;
        return { title: fill(s.title || '', ctx), cmds: (s.cmds || []).map(c => ({ cmd: fill(c.cmd, ctx), desc: fill(c.desc || '', ctx) })), where: s.where ? fill(s.where, ctx) : '', code: s.code ? lines(s.code, ctx).join('\n') : '', from: it.from };
      }
      const fs = it.fs;
      const c = Object.assign({}, ctx);
      for (const k of fs.lists || []) c[k] = it.lists[k] || [];
      const blocks = {};
      for (const k of fs.lists || []) blocks[k] = it.lists[k] || [];
      return { title: fill(fs.title || '', c), cmds: (fs.cmds || []).map(x => ({ cmd: fill(x.cmd, c), desc: fill(x.desc || '', c) })), where: fs.where ? fill(fs.where, c) : '', code: fs.code ? lines(fs.code, c, blocks).join('\n') : '', id: fs.id, from: it.from };
    });
    return { rows, steps };
  }

  /* ================= 未登録の一覧の引き直し ================= */

  function resolvable(entry, kind, d) {
    const k = kind || '';
    const tries = {
      line: () => { const st = splitStatements(entry); return st.length > 0 && st.every(s => !parseStmt(s, 'stmt', d)[0].unknown); },
      rline: () => rlineCandidates(entry, d).length > 0,
      rmethod: () => keywordNodes(entry, d).length > 0,
      feat: () => featRank(entry, d).ranked.length > 0,
      err: () => { const m = /^\[([^\]]+)\]\s*(.*)$/.exec(entry); const f = errorFind(m ? m[2] : entry, d, m ? m[1] : null); return !!(f && f.error); },
      tag: () => !!d._tagByName[entry.replace(/^札[：:]\s*/, '')],
      element: () => !!d._elByName[entry.replace(/^画面の要素[：:]\s*/, '').split(/[：:]/)[0]]
    };
    if (tries[k]) return tries[k]();
    return false;
  }

  return {
    toList, fill, cond, lines, text, tidy, norm, squash,
    buildDict, loadAll, addMissing, checkShape, jsonErrorLine, SHELF_FIELDS, KINDS,
    splitStatements, splitChain, parseStmts, parseStmt, renderNodes, memoTagLines, parseTagLines, keywordNodes,
    flat, flatPaths, makeNode, defaults,
    methodForward, methodInfo, methodLines, parseMethodMemos, guessName, guessArg, returnLine, methodWhen,
    backForward, parseBackMemo, backRender, frontForward, parseFrontMemo, frontRender,
    lineForward, partsOf, rlineCandidates, renderOne, detectCode,
    errorFind, errorView, branchHit,
    featHits, featRank, featDefaultSelection, featQuestions, featAnswers, featResult,
    resolvable
  };
});
