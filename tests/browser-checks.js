/*
 * 検品表の「画面で操作」の項目を、ヘッドレスのブラウザで確かめる
 * 使い方：node tests/browser-checks.js
 * 必要なもの：playwright-core と Chromium（検品の道具。アプリ本体は使わない）
 *   PW_CORE … playwright-core の場所（既定はこの作業環境の場所）
 *   CHROME  … Chromium の実行ファイル
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const S = require('./samples.js');

const PW_CORE = process.env.PW_CORE || '/home/claude/.npm-global/lib/node_modules/@playwright/mcp/node_modules/playwright-core';
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const { chromium } = require(PW_CORE);
const ROOT = path.join(__dirname, '..');
const FIX1 = fs.readFileSync(path.join(ROOT, 'samples/fix-001.json'), 'utf8');
const sq = s => String(s).replace(/\s+/g, '');

/* ---------- 置き場所ごとにサイトを写して配る ---------- */
function site(fixes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dict-site-'));
  for (const f of ['index.html', 'css/style.css', 'js/engine.js', 'js/app.js', 'dict/entries.json']) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.mkdirSync(path.join(dir, 'dict/fixes'), { recursive: true });
  for (const [name, text] of Object.entries(fixes || {})) fs.writeFileSync(path.join(dir, 'dict/fixes', name), text);
  return dir;
}
function serve(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const p = path.join(dir, decodeURIComponent(req.url.split('?')[0].split('#')[0]).replace(/\/$/, '/index.html'));
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    res.end(fs.readFileSync(p));
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}/` })));
}

const results = [];
const rec = (no, ok, why) => results.push({ no, ok: !!ok, why: ok ? '' : why });

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  async function open(fixes, opts) {
    const dir = site(fixes);
    const { srv, url } = await serve(dir);
    const ctx = await browser.newContext({ viewport: { width: (opts && opts.width) || 960, height: 900 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url.replace(/\/$/, '') });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url + ((opts && opts.hash) || ''));
    await page.waitForFunction(() => !/読み込み中/.test(document.querySelector('#stateSum').textContent));
    return { page, ctx, srv, url, dir, errs, close: async () => { await ctx.close(); srv.close(); } };
  }
  const paste = (page, t) => page.evaluate(t => { const i = document.querySelector('#in'); i.focus(); i.value = t; i.dispatchEvent(new Event('paste')); }, t);
  const settle = page => page.waitForTimeout(60);
  const outText = page => page.$eval('#out', e => e.innerText);
  const judgeText = page => page.$eval('#judge', e => e.innerText);
  const clip = page => page.evaluate(() => navigator.clipboard.readText());
  const typeInto = async (page, sel, v) => { await page.fill(sel, v); };

  /* ===== 本体だけ ===== */
  let o = await open();
  let p = o.page;
  {
    await p.click('#stateBox summary');
    const st = await p.$eval('#stateList', e => e.innerText);
    rec('S-01', /読み込んだファイル：entries\.json\n/.test(st + '\n') && /修正ファイル：なし/.test(st) && /札の数：20/.test(st) && /エラーの数：1/.test(st) && /例文の数：5/.test(st) && /最後に足した修正の番号：なし/.test(st)
      && await p.$eval('#dictErr', e => e.classList.contains('hide')), st);
  }
  // S-04
  {
    const cases = [[S.line, 'PHP・1行'], [S.method, 'PHP・メソッド'], [S.back, 'PHP・ページ（バックエンド）'], [S.front, 'Blade・ページ（フロントエンド）'], [S.rline, '日本語・1行（逆向き）'],
      [S.sentSave, '日本語・メソッド（逆向き）'], [S.memoMethod, '日本語・メソッド（逆向き）'], [S.memoBack, '日本語・ページ（逆向き）'], [S.memoFront, '日本語・ページ（逆向き）'], [S.memoCrud, '日本語・ページ（逆向き）']];
    const bad = [];
    for (const [v, want] of cases) { await paste(p, v); await settle(p); const j = await judgeText(p); if (!j.includes(want + 'として読みました')) bad.push(`${v.slice(0, 12)}…→${j.split('\n')[0]}`); }
    rec('S-04', !bad.length, bad.join('／'));
  }
  // S-05
  {
    await paste(p, S.line); await settle(p);
    await p.selectOption('#ov', 'method'); await settle(p);
    const j = await judgeText(p);
    rec('S-05', j.includes('PHP・メソッドとして読みました（手で変更）'), j);
  }
  // S-06
  {
    await paste(p, S.line); await settle(p);
    const t = await outText(p);
    const ids = await p.$$eval('#out .id', es => es.map(e => e.textContent));
    rec('S-06', t.includes('↑ 変数 shippingAddress・item_id を、画面 purchase.edit に渡して表示する') && t.includes('部品ごとの意味') && t.includes('resources/views/purchase/edit.blade.php')
      && ['php-view', 'php-compact', 'php-return'].every(i => ids.includes(i)), t);
  }
  // S-07
  {
    const before = await p.$eval('#missN', e => +e.textContent);
    await paste(p, S.noLine); await settle(p);
    const t = await outText(p);
    const after = await p.$eval('#missN', e => +e.textContent);
    rec('S-07', t.includes('この行は辞書にありません') && after === before + 1, `${t} 件数 ${before}→${after}`);
  }
  // S-08
  {
    await paste(p, S.rline); await settle(p);
    const cands = await p.$$eval('#out .cand label', es => es.map(e => e.innerText));
    const i = cands.findIndex(c => c.includes('渡す'));
    if (i >= 0) await p.check(`#out input[name=rc][value="${i}"]`);
    const inputs = await p.$$('#rvf input');
    await inputs[0].fill('purchase.edit'); await inputs[0].dispatchEvent('input');
    const mid = await p.$eval('#rvo pre', e => e.textContent);
    await inputs[1].fill('shippingAddress, item_id'); await inputs[1].dispatchEvent('input');
    const code = await p.$eval('#rvo pre', e => e.textContent);
    const tr = await p.$eval('#rvo .tr', e => e.innerText);
    rec('S-08', i >= 0 && cands.length <= 5 && sq(code) === sq(S.line) && mid !== code && tr.includes('変数 shippingAddress・item_id を、画面 purchase.edit に渡して表示する') && tr.includes('php-return-view'), `${cands.join('|')} / ${code} / ${tr}`);
  }
  // S-09
  {
    const before = await p.$eval('#missN', e => +e.textContent);
    await paste(p, 'あいうえお'); await settle(p);
    const t = await outText(p);
    rec('S-09', t.includes('近いコードの形がありません') && await p.$eval('#missN', e => +e.textContent) === before + 1, t);
  }
  // S-10
  {
    await paste(p, S.method); await settle(p);
    const hs = await p.$$eval('#out h3, #out summary', es => es.map(e => e.textContent.trim()));
    const t = await outText(p);
    const order = ['まとめ', '前提の条件', '流れ', '押さえる点', '1行ごとの対応', 'メモ（逆向きに貼ると、このメソッドに戻る）'];
    const pos = order.map(h => hs.indexOf(h));
    const tableAfterSum = await p.$eval('#out', e => { const h = [...e.querySelectorAll('h3')].find(x => x.textContent === 'まとめ'); const t = e.querySelector('table.kv'); const c = [...e.querySelectorAll('h3')].find(x => x.textContent === '前提の条件'); return !!(h && t && c && (h.compareDocumentPosition(t) & 4) && (t.compareDocumentPosition(c) & 4)); });
    const ids = await p.$$eval('#out .id', es => es.map(e => e.textContent));
    rec('S-10', pos.every((x, i) => x >= 0 && (i === 0 || x > pos[i - 1])) && tableAfterSum && t.includes('一覧ページを開いた時に動く処理') && ids.includes('mname-index')
      && ['php-where', 'php-with', 'php-get'].every(i => ids.includes(i)), hs.join('|'));
  }
  // S-12 / S-13（画面）
  {
    await paste(p, 'public function destroy(Memo $memo)\n{\n    $memo->delete();\n}'); await settle(p);
    const t1 = await outText(p);
    await paste(p, "public function destroy(Memo $memo)\n{\n    $memo->delete();\n    return redirect()->route('memos.index');\n}"); await settle(p);
    const t2 = await outText(p);
    await paste(p, S.method); await settle(p);
    const t3 = await outText(p);
    const flow = t => (t.split(/流れ\n+/)[1] || '').split('\n')[0];
    rec('S-12', !/まず|最後に/.test(flow(t1)) && /^まず、.*最後に、/.test(flow(t2)) && !/次に/.test(flow(t2)) && /^まず、.*次に、.*最後に、/.test(flow(t3)) && /keyword と tab/.test(flow(t3)), `${flow(t1)}／${flow(t2)}／${flow(t3)}`);
    const conds = await p.$$eval('#out h3', es => { const h = es.find(x => x.textContent === '前提の条件'); return h ? [...h.nextElementSibling.querySelectorAll('li')].map(l => l.innerText) : []; });
    rec('S-13', conds.length === 3 && !t1.includes('前提の条件'), conds.join('|'));
  }
  // S-14
  {
    await paste(p, S.sentSave); await settle(p);
    const chips = await p.$$eval('#out .chip', es => es.map(e => e.textContent).join('→'));
    const route = await p.$('#out input[data-k$=".route"]');
    await route.fill('memos.index'); await route.dispatchEvent('input');
    const code = await p.$eval('#rmo pre', e => e.textContent);
    rec('S-14', chips === '確かめる→保存する→移動する' && sq(code) === sq(S.expStore), `${chips} / ${code}`);
  }
  // S-15
  {
    await paste(p, S.memoMethod); await settle(p);
    const code = await p.$eval('#rmo pre', e => e.textContent);
    const boxes = await p.$$eval('#out .tagbox', es => es.length);
    const inp = await p.$('#out .tagbox input');
    await inp.fill('word'); await inp.dispatchEvent('input');
    const code2 = await p.$eval('#rmo pre', e => e.textContent);
    rec('S-15', sq(code) === sq(S.method) && boxes === 13 && code2.includes('$word = $request->keyword;'), `${boxes}個 / ${code.slice(0, 80)}`);
  }
  // S-16
  {
    await paste(p, S.memoMethod.replace('  まとめて取る：purchases', '  数える：\n  まとめて取る：purchases')); await settle(p);
    const code = await p.$eval('#rmo pre', e => e.textContent);
    rec('S-16', code.includes('// 数える（辞書にない札）') && code.includes("->with('purchases')") && code.includes("return view('item.index'"), code);
  }
  // S-17
  {
    await paste(p, S.back); await settle(p);
    const t = await outText(p);
    rec('S-17', t.includes('【ルート】\n') && t.includes('読み方') && t.includes('【コントローラー】LikeController'), t.slice(0, 200));
  }
  // S-18 / S-19
  {
    await paste(p, S.memoBack); await settle(p);
    const t = await outText(p);
    const r = await p.$('#out input[data-k="p.route"]');
    await r.fill('POST /items/{item}/like'); await r.dispatchEvent('input');
    const line1 = await p.$eval('#rmo pre', e => e.textContent);
    const a = await p.$('#out input[data-k="p.auth"]');
    await a.fill('いらない'); await a.dispatchEvent('input');
    const line2 = await p.$eval('#rmo pre', e => e.textContent);
    rec('S-18', t.includes('ルートが空欄です'), t.slice(0, 200));
    rec('S-19', line1 === "Route::post('/items/{item}/like', [LikeController::class, 'toggle'])->middleware('auth');" && line2 === "Route::post('/items/{item}/like', [LikeController::class, 'toggle']);", `${line1} / ${line2}`);
  }
  // S-20
  {
    await paste(p, S.memoCrud); await settle(p);
    const pres = await p.$$eval('#rmo pre', es => es.map(e => e.textContent));
    rec('S-20', sq(pres[0]) === sq(S.expCrudRoute) && sq(pres[1]) === sq(S.expCrudCtl), pres.join('\n---\n'));
  }
  // S-21 / S-22 / S-23
  {
    await paste(p, S.front); await settle(p);
    const memo = await p.$eval('#out pre', e => e.textContent);
    rec('S-21', sq(memo) === sq(S.memoFront) && (await outText(p)).includes('読み方'), memo);
    await paste(p, memo); await settle(p);
    const code = await p.$eval('#rfo pre', e => e.textContent);
    rec('S-22', sq(code) === sq(S.front), code);
    for (const [k, v] of [['old', 'しない'], ['err', 'しない'], ['send', '']]) { const i = await p.$(`#out input[data-k="g.${k}"]`); await i.fill(v); await i.dispatchEvent('input'); }
    const code2 = await p.$eval('#rfo pre', e => e.textContent);
    rec('S-23', !/old\(|@error|<form/.test(code2) && /login__title/.test(code2) && /login__link/.test(code2), code2);
  }
  // S-24
  {
    await paste(p, S.memoFront.replace('リンク：', '画像：ロゴ\nリンク：')); await settle(p);
    const code = await p.$eval('#rfo pre', e => e.textContent);
    rec('S-24', code.includes('{{-- 画像：ロゴ（辞書にない要素） --}}'), code);
  }
  // S-36 / S-37
  {
    await paste(p, S.line); await settle(p);
    const before = await outText(p);
    await p.click('#in'); await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.keyboard.type('$memo->delete();'); await settle(p);
    const v = await p.$eval('#in', e => e.value);
    const same = (await outText(p)) === before;
    rec('S-36', v.includes('\n$memo->delete();') && same, v);
    await p.keyboard.press('Control+Enter'); await settle(p);
    rec('S-37', (await outText(p)).includes('変数 memo の1件をテーブルから消す'), await outText(p));
  }
  // S-39
  {
    await paste(p, S.line); await settle(p);
    await p.keyboard.press('Control+Shift+Enter'); await settle(p);
    const c = await clip(p);
    const toastOn = await p.$eval('#toast', e => e.classList.contains('on') && e.textContent === 'コピーしました');
    await p.waitForTimeout(1200);
    const toastOff = await p.$eval('#toast', e => !e.classList.contains('on'));
    rec('S-39', c.startsWith('```\n') && c.endsWith('\n```') && c.includes('部品ごとの意味') && toastOn && toastOff, c.slice(0, 80));
  }
  // S-38 / P-07
  {
    await paste(p, S.line); await settle(p);
    const n = await p.$eval('#missN', e => +e.textContent);
    await p.keyboard.press('Escape'); await settle(p);
    const v = await p.$eval('#in', e => e.value);
    const t = await outText(p);
    const focus = await p.evaluate(() => document.activeElement.id);
    rec('S-38', v === '' && t.includes('まだ何も貼られていません') && focus === 'in', `${v}/${t}/${focus}`);
    rec('P-07', n > 0 && await p.$eval('#missN', e => +e.textContent) === n, `件数 ${n}`);
  }
  // S-40
  {
    await paste(p, S.feat); await settle(p);
    await p.keyboard.press('Alt+2'); await settle(p);
    const a = await p.$eval('.tab.on', e => e.dataset.tab);
    const j2 = await judgeText(p);
    await p.keyboard.press('Alt+3'); await settle(p);
    const b = await p.$eval('.tab.on', e => e.dataset.tab);
    const j3 = await judgeText(p);
    await p.keyboard.press('Alt+1'); await settle(p);
    const c = await p.$eval('.tab.on', e => e.dataset.tab);
    const j1 = await judgeText(p);
    rec('S-40', a === 'feat' && j2.includes('機能解説') && b === 'err' && j3.includes('どこで出ましたか') && c === 'code' && j1.includes('として読みました'), `${a}:${j2}/${b}:${j3}/${c}:${j1}`);
  }
  // S-25 / S-26 / S-27
  {
    await p.click('.tab[data-tab=err]');
    await paste(p, S.err); await settle(p);
    const j = await judgeText(p);
    const t = await outText(p);
    rec('S-25', j.includes('どこでも出るエラーとして読みました（SQLSTATE で判定）') && t.includes('Laravelが items のデータを取りに行った') && t.includes('laravel_db の中に items') && t.includes('止まった工程：③')
      && (t.match(/手順\d/g) || []).length >= 3 && t.includes('err-sql-42S02'), j + '\n' + t.slice(0, 300));
    const A = '2026_10_01_000000_create_items_table ......... Pending', B = '2026_10_01_000000_create_items_table ......... Ran',
      C = '2026_10_01_000000_create_users_table ......... Ran', Dd = "database/migrations/2026_10_01_000000_create_items_table.php:14: Schema::create('items', function";
    const want = { 0: { A: '0', B: '1', C: '2', D: '', E: '' }, 1: { A: '0', B: '1', C: '', D: '', E: '' }, 2: { A: '1', B: '1', C: '', D: '1', E: '0' } };
    const bad = [];
    for (const si of [0, 1, 2]) for (const [k, v] of Object.entries({ A, B, C, D: Dd, E: null })) {
      const st = (await p.$$('#out .vstep'))[si];
      const ta = await st.$('textarea');
      if (v == null) { await ta.fill(''); await (await st.$('.none')).click(); } else { await ta.fill(v); await ta.dispatchEvent('input'); }
      const hits = await st.$$eval('.branch', es => es.map((e, i) => e.classList.contains('hit') ? i : -1).filter(i => i >= 0).join(','));
      if (hits !== want[si][k]) bad.push(`手順${si + 1} ${k}→${hits || 'なし'}（期待 ${want[si][k] || 'なし'}）`);
    }
    rec('S-26', !bad.length, bad.join('／'));
    await (await p.$$('#out .vstep .cmd .cc'))[2].click(); await settle(p);
    const c = await clip(p);
    rec('S-27', c === `grep -rn "Schema::create('items'" database/migrations`, c);
  }
  // S-28
  {
    await paste(p, S.errUnknown); await settle(p);
    const j = await judgeText(p);
    const btns = await p.$$eval('#judge button', es => es.map(e => e.textContent).join('／'));
    await p.click('#judge button[data-s="CLI"]'); await settle(p);
    const t = await outText(p);
    const ms = await p.$$eval('#missList li', es => es.map(e => e.textContent));
    rec('S-28', j.includes('どこで出ましたか？') && btns === 'CLI／画面／コンソール' && t.includes('このエラーは辞書にありません') && ms.includes('[CLI] Something unexpected happened while processing'), `${j}/${btns}/${t}`);
  }
  // S-29
  {
    await paste(p, '関係ない文です\n' + S.err); await settle(p);
    rec('S-29', (await outText(p)).includes('Laravelが items のデータを取りに行った'), await outText(p));
  }
  // S-41
  {
    const p2 = await o.ctx.newPage();
    await p2.goto(o.url + '#err:' + encodeURIComponent(S.err));
    await p2.waitForFunction(() => document.querySelector('#out').innerText.includes('何が起きたか'), null, { timeout: 5000 }).catch(() => {});
    const tabOn = await p2.$eval('.tab.on', e => e.dataset.tab);
    rec('S-41', tabOn === 'err' && (await p2.$eval('#out', e => e.innerText)).includes('Laravelが items のデータを取りに行った'), tabOn);
    await p2.close();
  }
  // S-30〜S-35
  {
    await p.click('.tab[data-tab=feat]');
    await paste(p, S.feat); await settle(p);
    const chips = await p.$$eval('#featSteps .chip', es => es.map(e => e.textContent).join('・'));
    const cands = await p.$$eval('#featSteps .cand label', es => es.map(e => ({ t: e.innerText, on: e.querySelector('input').checked })));
    rec('S-30', chips === '選んだ・取り出す・ログイン・住所・用意・画面・渡す' && cands.length === 4 && cands[0].t.includes('ログイン中の人の情報') && cands[0].t.includes('一致6')
      && cands[1].t.includes('一致4') && cands[2].t.includes('一致3') && cands[3].t.includes('一致2') && cands.every(c => c.on), JSON.stringify(cands));
    const qs = async () => p.$$eval('#featSteps .q', es => es.map(e => e.childNodes[0].textContent.trim()));
    const q1 = await qs();
    await p.click('#featSteps .seg[data-k=info] button[data-v=B]'); await settle(p);
    const q2 = await qs();
    rec('S-31', q1.length === 4 && new Set(q1).size === 4 && q2.length === 2, `${q1.join('|')} → ${q2.join('|')}`);
    await p.click('#featSteps .seg[data-k=info] button[data-v=A]'); await settle(p);
    await p.click('#featSteps .seg[data-k=where] button[data-v=A]'); await p.click('#featSteps .seg[data-k=has] button[data-v=B]'); await settle(p);
    const titles = await p.$$eval('#out .vstep .sh', es => es.map(e => e.textContent));
    const pres = await p.$$eval('#out .vstep pre', es => es.map(e => e.textContent));
    const rows = await p.$$eval('#out table tr', es => es.slice(1).map(r => [...r.children].map(c => c.innerText)));
    const expT = S.expFeatSteps.map(s => s.title);
    const expC = S.expFeatSteps.map(s => s.code).filter(Boolean);
    rec('S-32', titles.join('|') === expT.join('|') && pres.length === expC.length && pres.every((c, i) => sq(c) === sq(expC[i])) && rows.length === 5 && rows.every((r, i) => r[2] === S.expFeatRows[i][2]),
      titles.join('|') + '\n' + rows.map(r => r.join(' | ')).join('\n'));
    await p.click('#featSteps .seg[data-k=has] button[data-v=A]'); await settle(p);
    const t33 = await p.$$eval('#out .vstep .sh', es => es.map(e => e.textContent.split('：')[0]).join(','));
    rec('S-33', t33 === 'コントローラー,ルート', t33);
    await p.click('#featSteps .seg[data-k=has] button[data-v=B]'); await settle(p);
    await p.fill('#featSteps input[data-q=name]', 'order'); await settle(p);
    const all = await outText(p);
    rec('S-34', /OrderController/.test(all) && /'\/order\/\{item\}'/.test(all) && /order\.create/.test(all) && !/purchase|Purchase/.test(all), all.slice(0, 200));
    const before = await p.$eval('#missN', e => +e.textContent);
    await paste(p, 'かきくけこ'); await settle(p);
    rec('S-35', (await outText(p)).includes('近い例文がありません') && await p.$eval('#missN', e => +e.textContent) === before + 1, await outText(p));
  }
  // S-43
  {
    await p.click('#missBox summary');
    await p.click('#missCopy'); await settle(p);
    const c = await clip(p);
    const n = await p.$eval('#missN', e => +e.textContent);
    const ls = c.split('\n');
    rec('S-43', ls[0] === '次のものを辞書に足してください。' && ls.filter(l => l.startsWith('- ')).length === n && ls.slice(1).every(l => l.startsWith('- ') || l.startsWith('  ')), c);
  }
  // P-06
  {
    await p.evaluate(() => { localStorage.clear(); });
    await p.reload();
    await p.waitForFunction(() => !/読み込み中/.test(document.querySelector('#stateSum').textContent));
    await paste(p, S.noLine); await settle(p);
    await paste(p, S.noLine); await settle(p);
    const n = await p.$eval('#missN', e => +e.textContent);
    const li = await p.$$eval('#missList li', es => es.length);
    rec('P-06', n === 1 && li === 1, `${n}/${li}`);
  }
  // S-44（P-06 で残した「辞書に無い行」1件のまま開き直す）
  {
    const n = await p.$eval('#missN', e => +e.textContent);
    await p.reload();
    await p.waitForFunction(() => !/読み込み中/.test(document.querySelector('#stateSum').textContent));
    const li = await p.$$eval('#missList li', es => es.map(e => e.textContent));
    rec('S-44', n === 1 && await p.$eval('#missN', e => +e.textContent) === 1 && li[0] === S.noLine, `${n} → ${li.join('|')}`);
  }
  // S-42
  {
    const bad = [];
    for (const w of [375, 960]) {
      await p.setViewportSize({ width: w, height: 800 });
      for (const [t, v] of [['code', S.method], ['err', S.err], ['feat', S.feat]]) {
        await p.click(`.tab[data-tab=${t}]`);
        await paste(p, v); await settle(p);
        if (t === 'feat') await p.click('#featSteps .seg[data-k=has] button[data-v=B]').catch(() => {});
        await settle(p);
        const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (over > 0) bad.push(`${w}px ${t}：${over}px はみ出し`);
        await p.screenshot({ path: path.join(os.tmpdir(), `dict-${t}-${w}.png`), fullPage: true });
      }
    }
    rec('S-42', !bad.length, bad.join('／'));
  }
  if (o.errs.length) rec('JSエラー（本体のみ）', false, o.errs.join('／'));
  await o.close();

  /* ===== fix-001 を置く ===== */
  o = await open({ 'fix-001.json': FIX1 }); p = o.page;
  {
    await p.click('#stateBox summary');
    const st = await p.$eval('#stateList', e => e.innerText);
    await paste(p, S.method); await settle(p);
    const t = await outText(p);
    rec('S-02', /札の数：21/.test(st) && /最後に足した修正の番号：fix-001/.test(st) && await p.$eval('#dictErr', e => e.classList.contains('hide')) && t.includes('【修正済み】重ねた条件は'), st);
  }
  await o.close();

  /* ===== P-01：渡すを消す ===== */
  const fx = (name, items) => JSON.stringify({ format: 1, fix: name, items }, null, 2);
  o = await open({ 'fix-001.json': fx('fix-001', [{ id: 'php-return-view', field: 'disabled', value: true }]) }); p = o.page;
  {
    await paste(p, S.line); await settle(p);
    const t1 = await outText(p);
    await paste(p, S.rline); await settle(p);
    const t2 = await outText(p);
    await paste(p, S.memoMethod); await settle(p);
    const code = await p.$eval('#rmo pre', e => e.textContent);
    await p.click('#stateBox summary');
    const st = await p.$eval('#stateList', e => e.innerText);
    rec('P-01', /この行は辞書にありません|辞書にない/.test(t1) && !/渡す/.test(t2.split('穴を埋める')[0]) && code.includes('// 渡す（辞書にない札）') && /札の数：19/.test(st), `${t1.slice(0, 60)} / ${st}`);
  }
  await o.close();

  /* ===== P-02：未登録の行に当たる札を足して開き直す ===== */
  {
    const dir = site();
    const { srv, url } = await serve(dir);
    const ctx = await browser.newContext();
    const pg = await ctx.newPage();
    await pg.goto(url);
    await pg.waitForFunction(() => !/読み込み中/.test(document.querySelector('#stateSum').textContent));
    await paste(pg, S.noLine); await settle(pg);
    await paste(pg, '$x = foo();'); await settle(pg);
    const before = await pg.$$eval('#missList li', es => es.map(e => e.textContent));
    fs.writeFileSync(path.join(dir, 'dict/fixes/fix-001.json'), fx('fix-001', [{ add: 'tags', value: { id: 'php-collect-sum', name: '合計する', lang: 'php', kind: 'line', slots: [{ key: 'var', label: '入れる変数', default: 'total' }, { key: 'list', label: '並び', default: 'rows' }, { key: 'col', label: '列', default: 'price' }], code: ["$《var》 = collect($《list》)->sum('《col》');"], tr: '並び 《list》 の 《col》 を足し合わせて、変数 《var》 に入れる' } }]));
    await pg.reload();
    await pg.waitForFunction(() => !/読み込み中/.test(document.querySelector('#stateSum').textContent));
    const after = await pg.$$eval('#missList li', es => es.map(e => e.textContent));
    rec('P-02', before.includes(S.noLine) && !after.includes(S.noLine) && after.includes('$x = foo();'), `${before.join('|')} → ${after.join('|')}`);
    await ctx.close(); srv.close();
  }

  /* ===== P-03 ===== */
  o = await open({ 'fix-001.json': fx('fix-001', [{ id: 'php-wher', field: 'note', value: 'x' }, { id: 'php-with', field: 'note', value: '効いた1' }]) }); p = o.page;
  let p03a;
  {
    const banner = await p.$eval('#dictErr', e => e.classList.contains('hide') ? '' : e.innerText);
    await paste(p, S.method); await settle(p);
    const t = await outText(p);
    p03a = banner.includes('fix-001.json・1件目・php-wher・辞書にこの id が無い') && t.includes('効いた1');
    if (!p03a) rec('P-03(1)', false, banner);
  }
  await o.close();
  const broken = FIX1.replace('"field": "note",', '"field": "note"');
  const brokenLine = broken.split('\n').findIndex(l => l.includes('"value": "【修正済み】')) + 1;
  o = await open({ 'fix-001.json': broken, 'fix-002.json': fx('fix-002', [{ id: 'php-with', field: 'note', value: '効いた2' }]) }); p = o.page;
  {
    const banner = await p.$eval('#dictErr', e => e.classList.contains('hide') ? '' : e.innerText);
    await paste(p, S.method); await settle(p);
    const t = await outText(p);
    const ok = banner.includes(`fix-001.json・${brokenLine}行目・JSONとして読めない`) && t.includes('効いた2') && !t.includes('【修正済み】');
    rec('P-03', p03a && ok, banner);
  }
  await o.close();

  /* ===== P-04 ===== */
  o = await open({ 'fix-001.json': FIX1, 'fix-003.json': fx('fix-003', [{ id: 'php-with', field: 'note', value: '3番' }]) }); p = o.page;
  {
    await p.click('#stateBox summary');
    const st = await p.$eval('#stateList', e => e.innerText);
    rec('P-04', /最後に足した修正の番号：fix-001/.test(st) && !/fix-003/.test(st), st);
  }
  await o.close();

  /* ===== P-05 ===== */
  o = await open({ 'fix-001.json': FIX1, 'fix-002.json': fx('fix-002', [{ id: 'php-json', field: 'disabled', value: true }]) }); p = o.page;
  {
    await p.click('#stateBox summary');
    const st = await p.$eval('#stateList', e => e.innerText);
    await paste(p, '件数を数える'); await settle(p);
    const t1 = await outText(p);
    await paste(p, 'JSONで返す'); await settle(p);
    const t2 = await outText(p);
    rec('P-05', /札の数：20/.test(st) && t1.includes('数える') && !/返す/.test(t2.split('穴を埋める')[0]), `${st} / ${t1.slice(0, 40)} / ${t2.slice(0, 40)}`);
  }
  await o.close();

  await browser.close();
  let ng = 0;
  for (const r of results) { if (!r.ok) ng++; console.log(`${r.no}\t${r.ok ? '合格' : '不合格'}${r.ok ? '' : '\t' + String(r.why).replace(/\n/g, ' ⏎ ')}`); }
  console.log(`\n${results.length}項目中 合格 ${results.length - ng}・不合格 ${ng}`);
  process.exitCode = ng ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 2; });
