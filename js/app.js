/*
 * プログラミング辞書：画面の部分
 * 見た目と操作はモック（mock/dictionary-mock.html）どおり。中身は全部 dict/ のJSONから読む
 */
(function () {
  'use strict';
  const E = window.Engine;
  const $ = s => document.querySelector(s);
  const inp = $('#in'), out = $('#out'), judge = $('#judge'), steps = $('#featSteps');

  let R = null, D = null;            // 読み込んだ辞書
  let tab = 'code', override = 'auto', errForced = null;
  let featSel = null, featAns = {};
  let missing = [];

  /* ---------- 小さな部品 ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const idb = s => s ? `<span class="id">${esc(s)}</span>` : '';
  const codeBlock = c => `<div class="codeb"><button class="copy cc" data-cmd="${esc(c)}">コピー</button><pre>${esc(c)}</pre></div>`;
  const cmdRow = (c, d) => `<div class="cmd"><span class="cmd-t"><code>${esc(c)}</code> ：${esc(d)}</span><button class="copy cc" data-cmd="${esc(c)}">コピー</button></div>`;
  const missNote = '<p class="note">未登録の一覧に残しました。</p>';

  /* ---------- 未登録の一覧（ブラウザに残す） ---------- */
  function loadMissing() {
    let list = [], kinds = {};
    try { list = JSON.parse(localStorage.getItem('dict-missing') || '[]'); } catch (e) { list = []; }
    try { kinds = JSON.parse(localStorage.getItem('dict-missing-kind') || '{}'); } catch (e) { kinds = {}; }
    missing = (Array.isArray(list) ? list : []).filter(x => typeof x === 'string').map(t => ({ text: t, kind: kinds[t] || '' }));
  }
  function saveMissing() {
    try {
      localStorage.setItem('dict-missing', JSON.stringify(missing.map(m => m.text)));
      localStorage.setItem('dict-missing-kind', JSON.stringify(Object.fromEntries(missing.map(m => [m.text, m.kind]))));
    } catch (e) { /* 残せなくても翻訳には関係ない */ }
  }
  function addMissing(t, kind) { if (E.addMissing(missing, t, kind)) { saveMissing(); renderMissing(); } }
  function renderMissing() {
    $('#missN').textContent = missing.length;
    $('#missList').innerHTML = missing.map(m => `<li><code>${esc(m.text)}</code></li>`).join('') || '<li style="color:var(--sub)">まだありません</li>';
  }
  /* 開いた時に引き直し、引けるようになったものを外す */
  function recheckMissing() {
    const before = missing.length;
    missing = missing.filter(m => {
      if (m.kind) return !E.resolvable(m.text, m.kind, D);
      return !['line', 'rline', 'feat', 'err', 'tag'].some(k => E.resolvable(m.text, k, D));
    });
    if (missing.length !== before) saveMissing();
    renderMissing();
  }

  /* ---------- 辞書の読み込み ---------- */
  async function getText(p) {
    try {
      const r = await fetch(p, { cache: 'no-store' });
      if (!r.ok) return null;
      return await r.text();
    } catch (e) { return null; }
  }
  function renderDictErr() {
    const box = $('#dictErr');
    if (!R || !R.skipped.length) { box.classList.add('hide'); box.innerHTML = ''; return; }
    box.innerHTML = '<b>修正ファイルの中に、読み込めなかったものがあります（その分は飛ばしました）</b><ul>' +
      R.skipped.map(s => `<li>${esc(s.n != null ? `${s.file}・${s.n}件目・${s.id}・${s.reason}` : `${s.file}・${s.line}行目・${s.reason}`)}</li>`).join('') + '</ul>';
    box.classList.remove('hide');
  }
  function renderState() {
    if (!R) return;
    const fx = R.files || [];
    $('#stateSum').textContent = `札 ${R.state.tags}・修正 ${R.state.last || 'なし'}`;
    $('#stateList').innerHTML = [
      `読み込んだファイル：entries.json${fx.length ? '、' + fx.join('、') : ''}`,
      `修正ファイル：${fx.length ? fx.join('、') : 'なし'}`,
      `札の数：${R.state.tags}`,
      `エラーの数：${R.state.errors}`,
      `機能解説の例文の数：${R.state.examples}`,
      `最後に足した修正の番号：${R.state.last || 'なし'}`
    ].map(t => `<li>${esc(t)}</li>`).join('');
  }

  /* ---------- 全体の流れ ---------- */
  function setTab(t) {
    tab = t; override = 'auto'; errForced = null; featSel = null;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    run();
  }
  function run() {
    const v = inp.value.trim();
    steps.classList.toggle('hide', tab !== 'feat' || !v || !D);
    if (!D) { judge.innerHTML = ''; out.innerHTML = '<div class="empty">辞書を読み込んでいます</div>'; return; }
    if (!v) { judge.innerHTML = ''; out.innerHTML = '<div class="empty">まだ何も貼られていません</div>'; return; }
    if (tab === 'code') runCode(v); else if (tab === 'err') runErr(v); else runFeat(v);
  }

  /* ---------- コードの読み取り ---------- */
  const MODE = { line: '1行', method: 'メソッド', back: 'ページ（バックエンド）', front: 'ページ（フロントエンド）', rline: '1行（逆向き）', rmethod: 'メソッド（逆向き）', rpage: 'ページ（逆向き）' };
  function runCode(v) {
    const auto = E.detectCode(v, D), m = override === 'auto' ? auto : override;
    const lang = m.startsWith('r') ? '日本語' : (m === 'front' ? 'Blade' : 'PHP');
    judge.innerHTML = `<span><b>${lang}・${MODE[m]}</b>として読みました${override === 'auto' ? '' : '（手で変更）'}</span>
 <span>読み方を変える <select id="ov"><option value="auto">自動（${MODE[auto]}）</option>${Object.keys(MODE).map(k => `<option value="${k}">${MODE[k]}</option>`).join('')}</select></span>`;
    $('#ov').value = override;
    $('#ov').onchange = e => { override = e.target.value; run(); };
    ({ line: lineView, method: methodView, back: backView, front: frontView, rline: rlineView, rmethod: rmethodView, rpage: rpageView })[m](v);
  }
  function missLines(v) {
    const ls = v.split('\n').filter(l => l.trim());
    ls.forEach(l => addMissing(l.trim(), 'line'));
    out.innerHTML = ls.map(l => `<pre>${esc(l)}\n ↑ <span class="miss">この行は辞書にありません</span></pre>`).join('') + missNote;
  }

  function lineView(v) {
    const r = E.lineForward(v, D);
    if (!r.rows.length || (r.rows.every(x => x.miss) && !r.parts.length)) return missLines(v);
    let h = '', missed = false;
    for (const row of r.rows) {
      if (row.miss) { addMissing(E.norm(row.code), 'line'); missed = true; h += `<pre>${esc(row.code)}\n ↑ <span class="miss">この行は辞書にありません</span></pre>`; }
      else if (!row.id) { addMissing(E.norm(row.code), 'line'); missed = true; h += `<pre>${esc(row.code)}\n ↑ <span class="miss">${esc(row.tr)}</span></pre>`; }
      else h += `<pre>${esc(row.code)}\n ↑ ${esc(row.tr)}${idb(row.id)}</pre>`;
    }
    if (r.parts.length) h += `<h3>部品ごとの意味</h3><ul>${r.parts.map(p => `<li><code>${esc(p.code)}</code> → ${esc(p.meaning)}${p.note ? '。' + esc(p.note) : ''}${idb(p.id)}</li>`).join('')}</ul>`;
    out.innerHTML = h + (missed ? missNote : '');
  }

  const trItems = trs => trs.map(t => t.unknown
    ? `<li><code>${esc(t.code)}</code> → <span class="miss">この行は辞書にありません</span></li>`
    : `<li><code>${esc(t.code)}</code> → ${esc(t.tr)}【${esc(t.tag)}】${idb(t.id)}</li>`).join('');

  function methodView(v) {
    const mf = E.methodForward(v, D);
    if (!mf) return missLines(v);
    mf.unknown.forEach(u => addMissing(u, 'line'));
    let h = `<h3>まとめ</h3><p>${esc(mf.when.text)}に動く処理。${esc(mf.sum)}。${idb(mf.when.id)}</p>
<table class="kv"><tr><th>引数</th><td>${mf.arg ? `<code>${esc(mf.arg)}</code>` : '（なし）'}</td></tr>
<tr><th>戻り値</th><td>${mf.ret ? esc(mf.ret.form) + idb(mf.ret.id) : '（分からない）'}</td></tr></table>`;
    if (mf.conds.length) h += `<h3>前提の条件</h3><ul>${mf.conds.map(c => `<li>${esc(c.text)}${idb(c.id)}</li>`).join('')}</ul>`;
    h += `<h3>流れ</h3><p>${esc(mf.flow)}</p>`;
    if (mf.notes.length) h += `<h3>押さえる点</h3><ul>${mf.notes.map(n => `<li>${esc(n.text)}${idb(n.id)}</li>`).join('')}</ul>`;
    h += `<details class="inner"><summary>1行ごとの対応</summary><ul style="font-size:13px">${trItems(mf.trs)}</ul></details>`;
    h += `<h3>メモ（逆向きに貼ると、このメソッドに戻る）</h3>${codeBlock(mf.memo)}`;
    if (mf.unknown.length) h += missNote;
    out.innerHTML = h;
  }

  function backView(v) {
    const r = E.backForward(v, D);
    if (!r.methods.length) return missLines(v);
    r.unknown.forEach(u => addMissing(u, 'line'));
    out.innerHTML = `<p class="note" style="margin:0">バックエンドのページ${idb(r.id)}</p>
<h3>メモ（逆向きに貼ると、このファイルに戻る）</h3>${codeBlock(r.memo)}
<h3>読み方</h3><ul class="trl">${r.read.map(x => `<li>${esc(x.text)}</li>`).join('')}${trItems(r.trs)}</ul>${r.unknown.length ? missNote : ''}`;
  }

  function frontView(v) {
    const r = E.frontForward(v, D);
    out.innerHTML = `<p class="note" style="margin:0">フロントエンドのページ${idb(r.id)}</p>
<h3>メモ（逆向きに貼ると、このファイルに戻る）</h3>${codeBlock(r.memo)}
<h3>読み方</h3><ul class="trl">${r.read.map(x => `<li>${esc(x.text)}</li>`).join('')}${r.trs.map(t => `<li>${esc(t.tr)}${idb(t.id)}</li>`).join('')}</ul>`;
  }

  /* ---- 逆向き ---- */
  function slotHtml(slots, o, pre) {
    return `<div class="slots">${slots.map(s => `<label class="slot"><span>${esc(s.label)}${s.options ? '（' + esc(s.options.join('／')) + '）' : ''}</span><input data-k="${pre}${esc(s.key)}" value="${esc(o[s.key])}"></label>`).join('')}</div>`;
  }
  function readInto(root, o, pre) {
    root.querySelectorAll('input[data-k]').forEach(i => { if (i.dataset.k.startsWith(pre)) { const k = i.dataset.k.slice(pre.length); if (!k.includes('.') && k in o) o[k] = i.value.trim(); } });
  }

  function rlineView(v) {
    const c = E.rlineCandidates(v, D);
    if (!c.length) { addMissing(v, 'rline'); out.innerHTML = '<p><span class="miss">近いコードの形がありません</span></p>' + missNote; return; }
    out.innerHTML = `<h3>近い形（一致が多い順）</h3><div class="cand">${c.map((t, i) => `<label><input type="radio" name="rc" value="${i}" ${i ? '' : 'checked'}> ${esc(t.name)}${idb(t.id)}<small>${esc(E.renderOne(D, t, {}).code.replace(/\s*\n\s*/g, ' '))}</small></label>`).join('')}</div>
<h3>穴を埋める</h3><div id="rvf"></div><h3>完成</h3><div id="rvo"></div>`;
    const draw = () => {
      const t = c[+out.querySelector('input[name=rc]:checked').value];
      const o = E.defaults(t);
      out.querySelector('#rvf').innerHTML = slotHtml(t.slots || [], o, '');
      const upd = () => {
        readInto(out.querySelector('#rvf'), o, '');
        const r = E.renderOne(D, t, o);
        out.querySelector('#rvo').innerHTML = codeBlock(r.code) + `<p class="tr">↑ ${esc(r.tr)}${idb(r.id)}</p>`;
      };
      out.querySelectorAll('#rvf input').forEach(i => { i.oninput = upd; });
      upd();
    };
    out.querySelectorAll('input[name=rc]').forEach(r => { r.onchange = draw; });
    draw();
  }

  function retHint() {
    return (D.returns || []).map(r => r.form.replace(/《[^《》]*》/g, '…')).join('／');
  }
  function methodsUI(ms, wrap, headHtml) {
    const page = D.pages.find(p => p.kind === 'method');
    const all = ms.map((m, mi) => ({ m, fp: E.flatPaths(m.nodes) }));
    all.forEach(({ fp }) => fp.forEach(({ n }) => { if (!D.tags.some(t => t.name === n.tag)) addMissing('札：' + n.tag, 'tag'); }));
    const fieldLabel = f => f.key === 'ret' ? `${f.label}（${retHint()}）` : f.label;
    const html = (headHtml || '') + all.map(({ m, fp }, mi) => `<div class="mbox"><div class="slots">
<label class="slot"><span>${esc(page.head.label)}の名前</span><input data-k="m${mi}.${esc(page.head.key)}" value="${esc(m.name)}"></label>
${page.fields.filter(f => f.key !== 'sum').map(f => `<label class="slot"><span>${esc(fieldLabel(f))}</span><input data-k="m${mi}.${esc(f.key)}" value="${esc(m[f.key])}"></label>`).join('')}</div>
${fp.map(({ n, path, depth, inElse }) => {
      const t = D.tags.find(x => x.name === n.tag);
      if (!t) return `<div class="tagbox" style="margin-left:${depth * 14}px"><span class="miss">${esc(n.tag)}（辞書にない札）</span></div>`;
      return `<div class="tagbox" style="margin-left:${depth * 14}px"><div class="vh">${inElse ? 'そうでなければ → ' : ''}${esc(n.tag)}${idb(t.id)}</div>${slotHtml(t.slots || [], n.o, `n${mi}_${path}.`)}</div>`;
    }).join('')}</div>`).join('') + `<h3>完成</h3><div id="rmo"></div>`;
    const upd = () => {
      all.forEach(({ m, fp }, mi) => {
        out.querySelectorAll(`input[data-k^="m${mi}."]`).forEach(i => { const k = i.dataset.k.slice(`m${mi}.`.length); m[k === page.head.key ? 'name' : k] = i.value.trim(); });
        if (!m.name) m.name = page.head.default || 'index';
        fp.forEach(({ n, path }) => readInto(out, n.o, `n${mi}_${path}.`));
      });
      out.querySelector('#rmo').innerHTML = wrap(ms);
    };
    return { html, bind: () => { out.querySelectorAll('.slots input').forEach(i => { i.oninput = upd; }); upd(); } };
  }
  const trList = trs => `<h3>1行ごとの訳</h3><ul class="trl">${trItems(trs)}</ul>`;

  function rmethodView(v) {
    const page = D.pages.find(p => p.kind === 'method');
    let ms;
    if (new RegExp('^\\s*【' + page.head.label + '】', 'm').test(v)) ms = E.parseMethodMemos(v, D);
    else {
      const nodes = E.keywordNodes(v, D);
      if (!nodes.length) { addMissing(v, 'rmethod'); out.innerHTML = '<p><span class="miss">役割の札が見つかりません</span></p>' + missNote; return; }
      ms = [{ name: E.guessName(D, nodes), arg: E.guessArg(D, nodes), ret: '', sum: v, nodes }];
    }
    const chips = ms.flatMap(m => E.flat(m.nodes)).map(n => `<span class="chip">${esc(n.tag)}</span>`).join('');
    const ui = methodsUI(ms, ms2 => {
      const trs = [];
      const code = ms2.map(m => E.methodLines(D, m, trs).join('\n')).join('\n\n');
      return codeBlock(code) + trList(trs);
    }, `<h3>拾った役割の札</h3>${chips}<h3>穴を埋める</h3>`);
    out.innerHTML = ui.html;
    ui.bind();
  }

  function pageFieldsHtml(page, vals, pre) {
    const eachKeys = (page.uses || []).filter(u => u.each).map(u => u.each);
    return `<div class="tagbox"><div class="vh">ページ全体${idb(page.id)}</div><div class="slots">${page.fields.map(f => {
      const hint = f.options ? `（${f.options.join('／')}）` : f.split ? '（送り方 URL）' : eachKeys.includes(f.key) ? '（,で区切る）' : '';
      return `<label class="slot"><span>${esc(f.label + hint)}</span><input data-k="${pre}${esc(f.key)}" value="${esc(vals[f.key])}"></label>`;
    }).join('')}</div></div>`;
  }
  function rpageView(v) {
    const front = D.pages.find(p => p.kind === 'front');
    if (front && v.includes(`【${front.head.label}】`)) return rfrontView(v, front);
    const page = D.pages.find(p => p.kind === 'back');
    const p = E.parseBackMemo(v, D);
    const ui = methodsUI(p.methods, ms => {
      out.querySelectorAll('input[data-k^="p."]').forEach(i => { p.vals[i.dataset.k.slice(2)] = i.value.trim(); });
      const r = E.backRender(D, p.vals, ms);
      return r.outputs.map(o => `<h3>${esc(o.title)}</h3>` + (o.missing ? `<p><span class="miss">${esc(o.missing)}</span></p>` : codeBlock(o.code))).join('') + trList(r.trs);
    }, `<p class="note" style="margin:0">バックエンドの完成コード${idb(page.id)}</p><h3>穴を埋める</h3>` + pageFieldsHtml(page, p.vals, 'p.'));
    out.innerHTML = ui.html;
    ui.bind();
  }
  function rfrontView(v, page) {
    const p = E.parseFrontMemo(v, D);
    p.els.forEach(e => { if (!D.elements.some(x => x.name === e.name)) addMissing('画面の要素：' + e.name, 'element'); });
    const elBoxes = p.els.map((e, j) => {
      const el = D.elements.find(x => x.name === e.name);
      if (!el) return `<div class="tagbox"><span class="miss">${esc(e.name)}：${esc(e.raw)}（辞書にない要素）</span></div>`;
      return `<div class="tagbox"><div class="vh">${esc(el.name)}${idb(el.id)}</div>${slotHtml(el.slots || [], e.o, `e${j}.`)}</div>`;
    }).join('');
    out.innerHTML = `<p class="note" style="margin:0">フロントエンドの完成コード${idb(page.id)}</p><h3>穴を埋める</h3>${pageFieldsHtml(page, p.vals, 'g.')}${elBoxes}<h3>完成</h3><div id="rfo"></div>`;
    const gen = () => {
      out.querySelectorAll('input[data-k^="g."]').forEach(i => { p.vals[i.dataset.k.slice(2)] = i.value.trim(); });
      p.els.forEach((e, j) => readInto(out, e.o, `e${j}.`));
      const r = E.frontRender(D, p.vals, p.els);
      out.querySelector('#rfo').innerHTML = r.outputs.map(o => `<h3>${esc(o.title)}</h3>${codeBlock(o.code)}`).join('') +
        `<h3>1行ごとの訳</h3><ul class="trl">${r.notes.map(n => `<li><code>${esc(n.code)}</code> → ${esc(n.tr)}</li>`).join('')}${r.trs.map(t => `<li>${t.unknown ? `<span class="miss">${esc(t.tr)}</span>` : esc(t.tr)}${idb(t.id)}</li>`).join('')}</ul>`;
    };
    out.querySelectorAll('.slots input').forEach(i => { i.oninput = gen; });
    gen();
  }

  /* ---------- エラー ---------- */
  const srcName = n => n === 'どこでも' ? 'どこでも出るエラー' : `${n}のエラー`;
  function runErr(v) {
    const f = E.errorFind(v, D, errForced);
    if (!f) {
      const names = (D.error_sources || []).map(s => s.name).filter(n => n !== 'どこでも');
      judge.innerHTML = `<div class="ask">出どころが判定できませんでした。どこで出ましたか？<br>${names.map(n => `<button data-s="${esc(n)}">${esc(n)}</button>`).join('')}</div>`;
      judge.querySelectorAll('button').forEach(b => { b.onclick = () => { errForced = b.dataset.s; run(); }; });
      out.innerHTML = '<div class="empty">出どころを選ぶと結果が出ます</div>';
      return;
    }
    const how = errForced ? '（手で選択）' : `（<code>${esc(f.mark)}</code> で判定）`;
    const opts = (D.error_sources || []).map(s => s.name);
    judge.innerHTML = `<span><b>${esc(srcName(f.source))}</b>として読みました${how}</span>
  <span>読み方を変える <select id="ov">${opts.map(n => `<option${n === f.source ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></span>`;
    $('#ov').onchange = e => { errForced = e.target.value; run(); };
    if (!f.error) {
      addMissing(`[${f.source}] ${f.line.trim()}`, 'err');
      out.innerHTML = `<pre>${esc(f.line.trim())}</pre><p><span class="miss">このエラーは辞書にありません</span></p>${missNote}`;
      return;
    }
    const ev = E.errorView(f);
    const circ = n => '①②③④⑤⑥⑦⑧⑨⑩'.charAt(n - 1) || n;
    out.innerHTML = `<p style="margin:0 0 6px">出どころ：${esc(srcName(f.source))}${idb(ev.id)}</p>
<h3>何が起きたか</h3><ol>${ev.happened.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
${ev.stopped ? `<p><b>止まった工程：</b>${circ(ev.stopped.at)}（${esc(ev.stopped.where)}）。${esc(ev.stopped.ok)}</p>` : ''}
<h3>原因の候補（可能性が高い順）</h3><ol>${ev.causes.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
<h3>確かめる手順</h3><p class="note">コマンドを実行して、出た結果を下の欄に貼ると、当てはまる行き先が光ります。</p>
${ev.steps.map((s, i) => `<div class="vstep" data-i="${i}"><div class="vh">手順${i + 1}</div>${cmdRow(s.cmd, s.desc)}
<div class="vres"><textarea class="res" rows="3" placeholder="結果をここに貼る" aria-label="手順${i + 1}の結果"></textarea><button class="copy none">何も出なかった</button></div>
${s.branches.map((b, j) => `<div class="branch" data-j="${j}">${esc(b.text)}</div>`).join('')}</div>`).join('')}`;
    out.querySelectorAll('.vstep').forEach(el => {
      const s = ev.steps[+el.dataset.i], ta = el.querySelector('.res');
      const judgeStep = empty => {
        el.querySelectorAll('.branch').forEach((b, j) => {
          const hit = E.branchHit(s.branches[j].when, ta.value, empty, ev.vars);
          b.classList.toggle('hit', hit);
          if (hit && s.branches[j].go === 'outside') addMissing(`[${f.source}] ${f.line.trim()}（手順${+el.dataset.i + 1} の結果が辞書の外）`, 'outside');
        });
      };
      ta.addEventListener('input', () => judgeStep(false));
      ta.addEventListener('paste', () => setTimeout(() => judgeStep(false), 0));
      el.querySelector('.none').onclick = () => { ta.value = ''; judgeStep(true); };
    });
  }

  /* ---------- 機能解説 ---------- */
  function runFeat(v) {
    const { hits, ranked } = E.featRank(v, D);
    judge.innerHTML = `<span><b>機能解説</b>として読みました（キーワード ${hits.length}個）</span>`;
    if (!ranked.length) { addMissing(v, 'feat'); steps.innerHTML = ''; steps.classList.add('hide'); out.innerHTML = '<p><span class="miss">近い例文がありません</span></p><p class="note">入力文を未登録の一覧に残しました。</p>'; return; }
    if (!featSel) featSel = E.featDefaultSelection(ranked);
    featSel = featSel.filter(id => ranked.some(x => x.e.id === id));
    const ans = E.featAnswers(D, featAns);
    const qs = E.featQuestions(D, featSel, featAns);
    steps.innerHTML = `<div class="step"><div class="lbl">① 拾ったキーワード</div>${hits.map(h => `<span class="chip">${esc(h)}</span>`).join('')}</div>
<div class="step cand"><div class="lbl">② 候補の例文（一致が多い順・複数選べる）</div>${ranked.map(x => `<label><input type="checkbox" data-id="${esc(x.e.id)}" ${featSel.includes(x.e.id) ? 'checked' : ''}> ${esc(x.e.text)}<small>一致${x.n}</small>${idb(x.e.id)}</label>`).join('')}</div>
<div class="step"><div class="lbl">③ 前提の質問（選んだ例文に付いているもの）</div>
${qs.length ? qs.map(q => q.type === 'text'
      ? `<div class="q">${esc(q.text)} <input data-q="${esc(q.id)}" value="${esc(ans[q.id])}"></div>`
      : `<div class="q">${esc(q.text)} <span class="seg" data-k="${esc(q.id)}">${(q.options || []).map(o => `<button data-v="${esc(o.v)}" class="${ans[q.id] === o.v ? 'on' : ''}">${esc(o.v)}.${esc(o.label)}</button>`).join('')}</span></div>`).join('') : '<div class="note">質問はありません</div>'}
</div>`;
    steps.querySelectorAll('input[type=checkbox]').forEach(c => {
      c.onchange = () => {
        const id = c.dataset.id;
        featSel = featSel.filter(x => x !== id);
        if (c.checked) featSel.push(id);
        runFeat(v);
      };
    });
    steps.querySelectorAll('.seg').forEach(s => s.querySelectorAll('button').forEach(b => { b.onclick = () => { featAns[s.dataset.k] = b.dataset.v; runFeat(v); }; }));
    steps.querySelectorAll('input[data-q]').forEach(i => {
      i.oninput = () => {
        const q = D.questions.find(x => x.id === i.dataset.q);
        featAns[i.dataset.q] = i.value.trim() || (q && q.default) || '';
        renderFeatOut(v);
      };
    });
    renderFeatOut(v);
  }
  function renderFeatOut(v) {
    if (!featSel.length) { out.innerHTML = '<div class="empty">候補の例文を選ぶと結果が出ます</div>'; return; }
    const r = E.featResult(v, D, featSel, featAns);
    out.innerHTML = `<h3>対応表</h3><div class="tblwrap"><table><tr><th>例え話の文</th><th>動作の種類</th><th>どのファイルに足すか</th></tr>${r.rows.map(x => `<tr><td>${esc(x.text)}</td><td>${esc(x.action)}${idb(x.ex)}</td><td>${esc(x.files)}</td></tr>`).join('')}</table></div>
<h3>指示書（上から順にやる）</h3>
${r.steps.map((s, i) => `<div class="vstep"><div class="vh">手順${i + 1}${idb(s.id || s.from.join(' '))}</div><p class="sh">${esc(s.title)}</p>${s.cmds.map(c => cmdRow(c.cmd, c.desc)).join('')}${s.where ? `<p class="note">${esc(s.where)}</p>` : ''}${s.code ? codeBlock(s.code) : ''}</div>`).join('') || '<div class="note">この組み合わせで足す手順はありません</div>'}`;
  }

  /* ---------- 操作 ---------- */
  let toastTimer = null;
  function toast(t) { const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('on'), 1000); }
  function copyText(t) {
    (navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(t) : Promise.reject())
      .then(() => toast('コピーしました'), () => {
        const r = document.createRange(); r.selectNodeContents(out);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        toast('選択しました。Ctrl+Cでコピー');
      });
  }
  function copyAll() { if (!inp.value.trim()) return; copyText('```\n' + out.innerText.trim() + '\n```'); }
  function clearAll() { inp.value = ''; errForced = null; override = 'auto'; featSel = null; run(); inp.focus(); }

  out.addEventListener('click', e => { const b = e.target.closest('.cc'); if (b) copyText(b.dataset.cmd); });
  inp.addEventListener('paste', () => { errForced = null; override = 'auto'; featSel = null; setTimeout(run, 0); });
  inp.addEventListener('input', () => { if (!inp.value.trim()) run(); });
  $('#clear').onclick = clearAll;
  $('#edit').onclick = () => { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); };
  $('#copy').onclick = copyAll;
  $('#missCopy').onclick = () => copyText('次のものを辞書に足してください。\n' + missing.map(m => '- ' + m.text.replace(/\n/g, '\n  ')).join('\n'));
  document.querySelectorAll('.tab').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); clearAll(); }
    else if (e.ctrlKey && e.shiftKey && e.key === 'Enter') { e.preventDefault(); copyAll(); }
    else if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); featSel = null; run(); }
    else if (e.altKey && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); setTab(['code', 'feat', 'err'][+e.key - 1]); }
  });

  /* ---------- 開いた時 ---------- */
  loadMissing();
  renderMissing();
  run();
  E.loadAll(getText).then(res => {
    R = res; D = res.dict;
    renderDictErr();
    renderState();
    recheckMissing();
    let h = '';
    try { h = decodeURIComponent(location.hash.slice(1)); } catch (e) { h = ''; }
    if (h) {
      const m = h.match(/^(code|feat|err):([\s\S]*)$/);
      if (m) { tab = m[1]; inp.value = m[2]; } else inp.value = h;
      setTab(tab);
    } else run();
  }).catch(err => {
    const box = $('#dictErr');
    box.innerHTML = `<b>辞書を読み込めませんでした</b><ul><li>${esc(err.message || err)}</li></ul>`;
    box.classList.remove('hide');
    $('#stateSum').textContent = '読み込めませんでした';
  });
})();
