/*
 * 検品表のうち、スクリプトで確かめられる項目を確かめる
 * 使い方：node tests/run-checks.js（依存ライブラリなし）
 * 結果は1項目1行で「合格／不合格」と、不合格なら何が出たかを出す
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/engine.js');
const S = require('./samples.js');

const ROOT = path.join(__dirname, '..');
const ENTRIES = fs.readFileSync(path.join(ROOT, 'dict/entries.json'), 'utf8');
const FIX1 = fs.readFileSync(path.join(ROOT, 'samples/fix-001.json'), 'utf8');
const sq = s => String(s).replace(/\s+/g, '');
const same = (a, b) => sq(a) === sq(b);
const dropLines = (s, re) => String(s).split('\n').filter(l => !re.test(l)).join('\n');
const results = [];
function check(no, fn) {
  try {
    const r = fn();
    const fails = (Array.isArray(r) ? r : [r]).filter(x => x !== true);
    results.push({ no, ok: fails.length === 0, why: fails.join(' ／ ') });
  } catch (e) { results.push({ no, ok: false, why: '例外：' + e.message }); }
}
const expect = (cond, why) => cond ? true : why;
const diff = (got, exp) => {
  const a = String(got).split('\n'), b = String(exp).split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (sq(a[i] || '') !== sq(b[i] || '')) return `${i + 1}行目 出た「${(a[i] || '').trim()}」／期待「${(b[i] || '').trim()}」`;
  return '（行の数だけ違う）';
};

const base = () => E.buildDict(ENTRIES, []);
const withFix = fixes => E.buildDict(ENTRIES, fixes);
const D = base().dict;

/* ---------- 読み込み・辞書の状態 ---------- */
check('S-01', () => {
  const r = base();
  return [expect(r.state.tags === 20, `札 ${r.state.tags}`), expect(r.state.errors === 1, `エラー ${r.state.errors}`),
    expect(r.state.examples === 5, `例文 ${r.state.examples}`), expect(r.state.last === '', `最後 ${r.state.last}`), expect(r.skipped.length === 0, '飛ばしたものがある')];
});
check('S-02', () => {
  const r = withFix([{ file: 'fix-001.json', text: FIX1 }]);
  const mf = E.methodForward(S.method, r.dict);
  const note = mf.notes.find(n => n.id === 'php-where');
  return [expect(r.state.tags === 21, `札 ${r.state.tags}`), expect(r.state.last === 'fix-001', `最後 ${r.state.last}`), expect(r.skipped.length === 0, 'エラーが出た'),
    expect(note && note.text.startsWith('【修正済み】'), `押さえる点：${note && note.text}`)];
});
check('S-03', () => {
  const a = E.checkShape(base().dict);
  const b = E.checkShape(withFix([{ file: 'fix-001.json', text: FIX1 }]).dict);
  return [expect(!a.length, a.join('、')), expect(!b.length, b.join('、'))];
});

/* ---------- 判定 ---------- */
check('S-04', () => {
  const cases = [[S.line, 'line'], [S.method, 'method'], [S.back, 'back'], [S.front, 'front'], [S.rline, 'rline'], [S.sentSave, 'rmethod'],
    [S.memoMethod, 'rmethod'], [S.memoBack, 'rpage'], [S.memoFront, 'rpage'], [S.memoCrud, 'rpage']];
  return cases.map(([v, m]) => { const g = E.detectCode(v, D); return expect(g === m, `「${v.slice(0, 16)}…」→ ${g}（期待 ${m}）`); });
});

/* ---------- 1行 ---------- */
check('S-06', () => {
  const r = E.lineForward(S.line, D);
  const row = r.rows[0];
  return [expect(r.rows.length === 1, `行 ${r.rows.length}`),
    expect(row.tr === '変数 shippingAddress・item_id を、画面 purchase.edit に渡して表示する', `訳：${row.tr}`),
    expect(r.parts.map(p => p.id).join() === 'php-view,php-compact,php-return', `部品：${r.parts.map(p => p.id)}`),
    expect(r.parts[0].meaning === '画面のファイル resources/views/purchase/edit.blade.php を使う', `view：${r.parts[0].meaning}`)];
});
check('S-07', () => { const r = E.lineForward(S.noLine, D); return expect(r.rows[0].miss === true, '辞書にある扱いになった'); });
check('S-08', () => {
  const c = E.rlineCandidates(S.rline, D);
  const tag = c.find(t => t.name === '渡す');
  if (!tag) return '候補に渡すが無い';
  const r = E.renderOne(D, tag, { view: 'purchase.edit', vars: 'shippingAddress, item_id' });
  const r2 = E.renderOne(D, tag, { view: 'a.b', vars: 'x' });
  return [expect(c.length <= 5, '5件を超えた'), expect(same(r.code, S.line), `完成：${r.code}`),
    expect(r.tr === '変数 shippingAddress・item_id を、画面 purchase.edit に渡して表示する', `訳：${r.tr}`), expect(r.id === 'php-return-view', r.id),
    expect(r2.code !== r.code, '穴を変えてもコードが変わらない')];
});
check('S-09', () => expect(E.rlineCandidates('あいうえお', D).length === 0, '候補が出た'));

/* ---------- メソッド ---------- */
check('S-10', () => {
  const mf = E.methodForward(S.method, D);
  return [expect(mf.when.text === '一覧ページを開いた時' && mf.when.id === 'mname-index', `入口：${mf.when.text}`),
    expect(mf.notes.map(n => n.id).join() === 'php-where,php-with,php-get', `押さえる点：${mf.notes.map(n => n.id)}`),
    expect(same(dropLines(mf.memo, /^まとめ：/), dropLines(S.memoMethod, /^まとめ：/)), 'メモ（まとめの行を除く）：' + diff(dropLines(mf.memo, /^まとめ：/), dropLines(S.memoMethod, /^まとめ：/)))];
});
check('S-11', () => {
  const mf = E.methodForward(S.method, D);
  const m = E.parseMethodMemos(mf.memo, D)[0];
  const code = E.methodLines(D, m).join('\n');
  return expect(same(code, S.method), diff(code, S.method));
});
check('S-12', () => {
  const one = E.methodForward('public function destroy(Memo $memo)\n{\n    $memo->delete();\n}', D).flow;
  const two = E.methodForward("public function destroy(Memo $memo)\n{\n    $memo->delete();\n    return redirect()->route('memos.index');\n}", D).flow;
  const many = E.methodForward(S.method, D).flow;
  return [expect(!/まず|最後に/.test(one) && one.endsWith('。'), `1つ：${one}`), expect(/^まず、.*。最後に、.*。$/.test(two) && !/次に/.test(two), `2つ：${two}`),
    expect(/^まず、/.test(many) && /次に、/.test(many) && /最後に、/.test(many), `3つ以上：${many}`),
    expect(/keyword と tab/.test(many.split('。')[0]), `受け取る2文：${many.split('。')[0]}`)];
});
check('S-13', () => {
  const a = E.methodForward(S.method, D).conds;
  const b = E.methodForward('public function destroy(Memo $memo)\n{\n    $memo->delete();\n}', D).conds;
  return [expect(a.length === 3, `前提の条件 ${a.length}件`), expect(a.every(c => c.id === 'php-when'), 'id'),
    expect(a[0].text.includes('auth()->check()') && a[1].text.includes('$keyword') && a[2].text.includes("$tab === 'mylist'"), '条件の文'), expect(b.length === 0, '条件なしでも出た')];
});
check('S-14', () => {
  const nodes = E.keywordNodes(S.sentSave, D);
  const names = nodes.map(n => n.tag).join('→');
  const m = { name: E.guessName(D, nodes), arg: E.guessArg(D, nodes), ret: '', nodes };
  nodes.find(n => n.tag === '移動する').o.route = 'memos.index';
  const code = E.methodLines(D, m).join('\n');
  return [expect(names === '確かめる→保存する→移動する', names), expect(m.name === 'store', m.name), expect(m.arg === 'Request $request', m.arg),
    expect(same(code, S.expStore), diff(code, S.expStore))];
});
check('S-15', () => {
  const m = E.parseMethodMemos(S.memoMethod, D)[0];
  const code = E.methodLines(D, m).join('\n');
  return expect(same(code, S.method), diff(code, S.method));
});
check('S-16', () => {
  const memo = S.memoMethod.replace('  まとめて取る：purchases', '  数える：\n  まとめて取る：purchases');
  const code = E.methodLines(D, E.parseMethodMemos(memo, D)[0]).join('\n');
  const exp = S.method.replace("->with('purchases')", "// 数える（辞書にない札）\n->with('purchases')");
  return [expect(code.includes('// 数える（辞書にない札）'), 'その行が出ない'), expect(same(code, exp), diff(code, exp))];
});

/* ---------- ページ ---------- */
check('S-17', () => {
  const r = E.backForward(S.back, D);
  const drop = s => dropLines(s, /^(【係】|まとめ：)/);
  return [expect(same(drop(r.memo), drop(S.memoBack)), '（【係】とまとめの行を除く）' + diff(drop(r.memo), drop(S.memoBack))),
    expect(/【ルート】\s*$/m.test(r.memo), '【ルート】が空欄でない'), expect(r.read.length > 0 && r.trs.length > 0, '読み方が無い')];
});
check('S-18', () => {
  const r = E.backForward(S.back, D);
  const p = E.parseBackMemo(r.memo, D);
  const out = E.backRender(D, p.vals, p.methods).outputs;
  return [expect(out[0].missing && out[0].missing.startsWith('ルートが空欄です'), 'ルートの所'), expect(same(out[1].code, S.back), diff(out[1].code, S.back))];
});
check('S-19', () => {
  const p = E.parseBackMemo(S.memoBack, D);
  p.vals.route = 'POST /items/{item}/like';
  const a = E.backRender(D, p.vals, p.methods).outputs[0].code;
  p.vals.auth = 'いらない';
  const b = E.backRender(D, p.vals, p.methods).outputs[0].code;
  return [expect(a === "Route::post('/items/{item}/like', [LikeController::class, 'toggle'])->middleware('auth');", a),
    expect(b === "Route::post('/items/{item}/like', [LikeController::class, 'toggle']);", b)];
});
check('S-20', () => {
  const p = E.parseBackMemo(S.memoCrud, D);
  const out = E.backRender(D, p.vals, p.methods).outputs;
  return [expect(same(out[0].code, S.expCrudRoute), out[0].code || out[0].missing), expect(same(out[1].code, S.expCrudCtl), diff(out[1].code, S.expCrudCtl))];
});
check('S-21', () => {
  const r = E.frontForward(S.front, D);
  return [expect(same(r.memo, S.memoFront), diff(r.memo, S.memoFront)), expect(/【ファイル】\s*$/m.test(r.memo), '【ファイル】が空欄でない'), expect(r.read.length > 0, '読み方')];
});
check('S-22', () => {
  const r = E.frontForward(S.front, D);
  const p = E.parseFrontMemo(r.memo, D);
  const code = E.frontRender(D, p.vals, p.els).outputs[0].code;
  return expect(same(code, S.front), diff(code, S.front));
});
check('S-23', () => {
  const p = E.parseFrontMemo(S.memoFront, D);
  Object.assign(p.vals, { old: 'しない', err: 'しない', send: '' });
  const code = E.frontRender(D, p.vals, p.els).outputs[0].code;
  return [expect(!/old\(|@error|<form/.test(code), code), expect(/login__title/.test(code) && /login__link/.test(code), '見出しかリンクが消えた')];
});
check('S-24', () => {
  const p = E.parseFrontMemo(S.memoFront.replace('リンク：', '画像：ロゴ\nリンク：'), D);
  const code = E.frontRender(D, p.vals, p.els).outputs[0].code;
  return expect(code.includes('{{-- 画像：ロゴ（辞書にない要素） --}}'), code);
});

/* ---------- エラー ---------- */
const errV = () => E.errorView(E.errorFind(S.err, D));
check('S-25', () => {
  const f = E.errorFind(S.err, D), v = E.errorView(f);
  return [expect(f.source === 'どこでも' && f.mark === 'SQLSTATE', `判定：${f.source}・${f.mark}`), expect(v.happened.length === 4 && v.happened[0].includes('items') && v.happened[1].includes('laravel_db'), v.happened.join('／')),
    expect(v.stopped.at === 3, '止まった工程'), expect(v.causes.length === 3, '原因の候補'), expect(v.steps.length === 3, '手順'), expect(v.id === 'err-sql-42S02', v.id)];
});
check('S-26', () => {
  const v = errV();
  const A = '2026_10_01_000000_create_items_table ......... Pending', B = '2026_10_01_000000_create_items_table ......... Ran',
    C = '2026_10_01_000000_create_users_table ......... Ran', Dd = "database/migrations/2026_10_01_000000_create_items_table.php:14: Schema::create('items', function";
  const lit = (si, t, empty) => v.steps[si].branches.map((b, i) => E.branchHit(b.when, t, empty, v.vars) ? i : -1).filter(i => i >= 0).join(',');
  const want = [
    [0, A, false, '0'], [0, B, false, '1'], [0, C, false, '2'], [0, Dd, false, ''], [0, '', true, ''],
    [1, A, false, '0'], [1, B, false, '1'], [1, C, false, ''], [1, Dd, false, ''], [1, '', true, ''],
    [2, A, false, '1'], [2, B, false, '1'], [2, C, false, ''], [2, Dd, false, '1'], [2, '', true, '0']
  ];
  return want.map(([s, t, e, w]) => { const g = lit(s, t, e); return expect(g === w, `手順${s + 1}「${t.slice(0, 30) || '何も出なかった'}」→ ${g || 'なし'}（期待 ${w || 'なし'}）`); });
});
check('S-27', () => { const v = errV(); return [expect(v.steps[0].cmd === 'php artisan migrate:status', v.steps[0].cmd), expect(v.steps[2].cmd === `grep -rn "Schema::create('items'" database/migrations`, v.steps[2].cmd)]; });
check('S-28', () => {
  const a = E.errorFind(S.errUnknown, D);
  const b = E.errorFind(S.errUnknown, D, 'CLI');
  return [expect(a === null, '出どころが判定された'), expect(b && !b.error && b.line === S.errUnknown, '辞書にある扱いになった')];
});
check('S-29', () => { const f = E.errorFind('関係ない文です\n' + S.err, D); return expect(f && f.error && f.line === S.err, '2行目を使っていない'); });

/* ---------- 機能解説 ---------- */
const featState = () => { const { hits, ranked } = E.featRank(S.feat, D); return { hits, ranked, sel: E.featDefaultSelection(ranked) }; };
check('S-30', () => {
  const { hits, ranked, sel } = featState();
  return [expect(hits.join('・') === '選んだ・取り出す・ログイン・住所・用意・画面・渡す', hits.join('・')),
    expect(ranked.map(x => `${x.e.id}:${x.n}`).join(',') === 'ex-authuser:6,ex-show:4,ex-index:3,ex-authonly:2', ranked.map(x => `${x.e.id}:${x.n}`).join(',')),
    expect(sel.length === 4 && ranked.every(x => sel.includes(x.e.id)), `選んだ状態：${sel}`)];
});
check('S-31', () => {
  const { sel } = featState();
  const a = E.featQuestions(D, sel, {}).map(q => q.id).join();
  const b = E.featQuestions(D, sel, { info: 'B' }).map(q => q.id).join();
  return [expect(a === 'name,info,where,has', a), expect(b === 'name,info', b)];
});
const featOut = ans => { const { sel } = featState(); return E.featResult(S.feat, D, sel, Object.assign({ name: 'purchase', info: 'A', where: 'A', has: 'B' }, ans || {})); };
check('S-32', () => {
  const r = featOut();
  const out = [];
  out.push(expect(r.rows.length === 5, `対応表 ${r.rows.length}行`));
  r.rows.forEach((row, i) => { const e = S.expFeatRows[i] || []; out.push(expect(row.files === e[2], `${i + 1}行目 ファイル：${row.files}（期待 ${e[2]}）`)); });
  out.push(expect(r.steps.map(s => s.title).join('|') === S.expFeatSteps.map(s => s.title).join('|'), '手順の見出し：' + r.steps.map(s => s.title).join('|')));
  r.steps.forEach((s, i) => {
    const e = S.expFeatSteps[i] || {};
    out.push(expect(same(s.code, e.code || ''), `手順${i + 1}のコード：` + diff(s.code, e.code || '')));
    out.push(expect(s.cmds.map(c => c.cmd).join('|') === (e.cmds || []).join('|'), `手順${i + 1}のコマンド`));
  });
  return out;
});
check('S-33', () => {
  const r = featOut({ has: 'A' });
  const t = r.steps.map(s => s.title.split('：')[0]).join(',');
  return [expect(t === 'コントローラー,ルート', t), expect(!r.rows.some(x => x.text === '（住所の欄が無い）'), '住所の行が残った')];
});
check('S-34', () => {
  const r = featOut({ name: 'order' });
  const all = r.steps.map(s => [s.title, s.where, s.code, ...s.cmds.map(c => c.cmd)].join('\n')).join('\n');
  return [expect(/OrderController/.test(all) && /'\/order\/\{item\}'/.test(all) && /order\.create/.test(all), '名前が変わらない'), expect(!/purchase|Purchase/.test(all), 'purchase が残った')];
});
check('S-35', () => expect(E.featRank('あいうえお', D).ranked.length === 0, '候補が出た'));

/* ---------- P系（スクリプトで確かめられるもの） ---------- */
const fixFile = (name, items) => ({ file: name, text: JSON.stringify({ format: 1, fix: name.replace('.json', ''), items }) });
check('P-01', () => {
  const r = withFix([fixFile('fix-001.json', [{ id: 'php-return-view', field: 'disabled', value: true }])]);
  const d = r.dict;
  const line = E.lineForward(S.line, d);
  const cands = E.rlineCandidates(S.rline, d).map(t => t.name);
  const code = E.methodLines(d, E.parseMethodMemos(S.memoMethod, d)[0]).join('\n');
  return [expect(line.rows[0].tr !== '変数 shippingAddress・item_id を、画面 purchase.edit に渡して表示する' && !line.rows[0].id, '正向きで引けてしまう'),
    expect(!cands.includes('渡す'), '候補に渡すが出た'), expect(code.includes('// 渡す（辞書にない札）'), '辞書にない札の行が出ない'), expect(r.state.tags === 19, `札 ${r.state.tags}`)];
});
check('P-02', () => {
  const before = E.resolvable(S.noLine, 'line', D);
  const r = withFix([fixFile('fix-001.json', [{ add: 'tags', value: { id: 'php-collect-sum', name: '合計する', lang: 'php', kind: 'line', slots: [{ key: 'var', label: '入れる変数', default: 'total' }, { key: 'list', label: '並び', default: 'rows' }, { key: 'col', label: '列', default: 'price' }], code: ["$《var》 = collect($《list》)->sum('《col》');"], tr: '並び 《list》 の 《col》 を足し合わせて、変数 《var》 に入れる' } }])]);
  const after = E.resolvable(S.noLine, 'line', r.dict);
  const still = E.resolvable('$x = foo();', 'line', r.dict);
  return [expect(!before, '足す前から引けた'), expect(after, '足した後も引けない'), expect(!still, 'まだ引けない行が外れた')];
});
check('P-03', () => {
  const r1 = withFix([fixFile('fix-001.json', [{ id: 'php-wher', field: 'note', value: 'x' }, { id: 'php-with', field: 'note', value: 'ちゃんと効く' }])]);
  const s1 = r1.skipped[0] || {};
  const broken = FIX1.replace('"field": "note",', '"field": "note"');
  const r2 = withFix([{ file: 'fix-001.json', text: broken }, fixFile('fix-002.json', [{ id: 'php-with', field: 'note', value: '2番が効いた' }])]);
  const s2 = r2.skipped[0] || {};
  const brokenLine = broken.split('\n').findIndex(l => l.includes('"value": "【修正済み】')) + 1;
  return [expect(r1.skipped.length === 1 && s1.file === 'fix-001.json' && s1.n === 1 && s1.id === 'php-wher' && s1.reason === '辞書にこの id が無い', JSON.stringify(s1)),
    expect(r1.dict.tags.find(t => t.id === 'php-with').note === 'ちゃんと効く', '他の件が効かない'),
    expect(r2.skipped.length === 1 && s2.file === 'fix-001.json' && s2.reason === 'JSONとして読めない' && s2.line === brokenLine, JSON.stringify(s2) + ` 期待の行 ${brokenLine}`),
    expect(r2.dict.tags.find(t => t.id === 'php-with').note === '2番が効いた' && !r2.dict.tags.some(t => t.id === 'php-count'), 'fix-002 が効かない／fix-001 が効いた'),
    expect(r2.state.last === 'fix-002', `最後 ${r2.state.last}`)];
});
check('P-04', async () => true);
check('P-05', () => {
  const r = withFix([{ file: 'fix-001.json', text: FIX1 }, fixFile('fix-002.json', [{ id: 'php-json', field: 'disabled', value: true }])]);
  const d = r.dict;
  return [expect(r.state.tags === 20, `札 ${r.state.tags}`), expect(E.rlineCandidates('件数を数える', d).some(t => t.name === '数える'), '足した札が候補に出ない'),
    expect(!E.rlineCandidates('JSONで返す', d).some(t => t.name === '返す'), 'disabled の札が候補に出た'),
    expect(!!E.lineForward("$n = Memo::where('a', $b)->count();", d).rows[0].id, '足した札で照合できない'),
    expect(!E.lineForward('return response()->json($memos);', d).rows[0].id, 'disabled の札で照合できた')];
});
check('P-06', () => { const list = []; E.addMissing(list, S.noLine, 'line'); E.addMissing(list, S.noLine, 'line'); return expect(list.length === 1, `${list.length}件`); });

/* P-04：番号の抜けで止まる（読み込みの関数を、ファイルの置き場所を差し替えて動かす） */
async function p04() {
  const files = { 'dict/entries.json': ENTRIES, 'dict/fixes/fix-001.json': FIX1, 'dict/fixes/fix-003.json': JSON.stringify({ format: 1, fix: 'fix-003', items: [{ id: 'php-with', field: 'note', value: '3番' }] }) };
  const r = await E.loadAll(async p => (p in files ? files[p] : null));
  const i = results.findIndex(x => x.no === 'P-04');
  const ok = r.files.join() === 'fix-001.json' && r.state.last === 'fix-001' && r.dict.tags.find(t => t.id === 'php-with').note !== '3番';
  results[i] = { no: 'P-04', ok, why: ok ? '' : `読んだ：${r.files}・最後：${r.state.last}` };
}

p04().then(() => {
  let ng = 0;
  for (const r of results) { if (!r.ok) ng++; console.log(`${r.no}\t${r.ok ? '合格' : '不合格'}${r.ok ? '' : '\t' + r.why}`); }
  console.log(`\n${results.length}項目中 合格 ${results.length - ng}・不合格 ${ng}`);
  process.exitCode = ng ? 1 : 0;
});
