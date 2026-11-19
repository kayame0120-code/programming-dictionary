/* dict/inbox/ に置かれた zip（と .json）を、辞書の置き場所に振り分けて置く。
   振り分けと検品は、辞書アプリと同じ js/loader.js を使う（アプリで読める物＝ここで置ける物）。
   帯が1本でも出る時は何も置かず、元に戻して止まる。
   結果は dict/inbox/README.md の頭に書く（GitHub でフォルダを開くとそのまま見える）。
   終わり方：0＝置いた／1＝止まった（何も置いていない）／3＝置く物が無かった */
const fs = require('fs');
const path = require('path');
const L = require('../../js/loader.js');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..'));
const INBOX = path.join(ROOT, 'dict', 'inbox');
const README = path.join(INBOX, 'README.md');
const abs = p => path.join(ROOT, p);
const exists = p => fs.existsSync(abs(p));
const readText = p => { try { return fs.readFileSync(abs(p), 'utf8') } catch (e) { return null } };
const writeText = (p, t) => { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), t) };

const HOW = [
  '# ここに zip を置くと、本番の辞書に入ります',
  '',
  '1. この `dict/inbox` を開いた画面の右上「…」→「Upload files」',
  '2. 別のチャットで作った zip（`dict/` のフォルダごとの物）をドラッグ',
  '3. 「Commit changes」を押す',
  '',
  'あとは GitHub が自動で、zip を開けて `dict/tech`・`dict/content`・`dict/fixes` に振り分け、目次（`dict/index.json`）に足りない行を足します。',
  '目次の行は消しません。同じ名前のファイルは入れ替えます。',
  '辞書アプリと同じ検品をかけて、帯が1本でも出る時は何も置かずに止まります。',
  '1〜2分たったら、このページを開き直すと、下に結果が出ています。置けた時は、さらに1〜2分で公開ページに出ます。',
  '',
  '- 置いた zip は、終わったら（止まった時も）ここから消えます。手元の zip はそのまま使えます',
  '- 辞書アプリにドラッグして入れた物は、そのタブの中だけの試しです。本番に出す入口はここだけです',
  ''
].join('\n');

const now = () => {
  const d = new Date(Date.now() + 9 * 3600e3);
  const z = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
};

function finish(code, lines) {
  writeText('dict/inbox/README.md', HOW + '\n## 前回の結果（' + now() + '）\n\n' + lines.join('\n') + '\n');
  console.log(lines.join('\n'));
  process.exit(code);
}

(async () => {
  /* 1. 置かれた物を集める */
  const names = fs.existsSync(INBOX) ? fs.readdirSync(INBOX).filter(n => n !== 'README.md' && !n.startsWith('.')) : [];
  if (!names.length) { console.log('dict/inbox に置く物がありません'); process.exit(3) }
  const items = [], others = [];
  for (const n of names) {
    const full = path.join(INBOX, n);
    if (fs.statSync(full).isDirectory()) { others.push(n + '/'); continue }
    if (!/\.(zip|json)$/i.test(n)) { others.push(n); continue }
    const buf = fs.readFileSync(full);
    items.push({ name: n, text: async () => buf.toString('utf8'), buffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  }
  const removeInbox = () => names.forEach(n => fs.rmSync(path.join(INBOX, n), { recursive: true, force: true }));
  const got = names.map(n => '`' + n + '`').join('・');

  /* 2. アプリと同じ振り分け */
  const { picked, notes } = await L.sortUploads(items);
  const bad = picked.filter(p => !p.path);
  const place = picked.filter(p => p.path && p.path !== 'dict/index.json');
  const upIndex = picked.find(p => p.path === 'dict/index.json');

  const stop = (why) => {
    removeInbox();
    finish(1, ['**✗ 止まりました。本番には何も置いていません。**', '', '置かれていた物：' + got, '', '止まった理由：', ...why.map(w => /^  - /.test(w) ? w : '- ' + w),
      '', '直した zip を、もう一度ここに置いてください。']);
  };
  const reasons = [
    ...others.map(n => `${n} は zip でも .json でもないので読めません`),
    ...bad.map(b => `${b.name}：${b.reason}`),
    ...notes.filter(n => !/後の方を使いました/.test(n))
  ];
  if (reasons.length) return stop(reasons);
  if (!place.length && !upIndex) return stop(['zip の中に、辞書のファイル（.json）がありませんでした']);

  /* 3. 元の状態を控えてから置く（止まる時に戻すため） */
  const before = {};
  const keep = p => { if (!(p in before)) before[p] = readText(p) };
  const restore = () => Object.entries(before).forEach(([p, t]) => { if (t == null) fs.rmSync(abs(p), { force: true }); else writeText(p, t) });

  const curText = readText('dict/index.json');
  let index;
  try { index = JSON.parse(curText) } catch (e) { return stop(['今の dict/index.json が JSON として読めません。先にこちらを直す必要があります']) }
  index.tech = [...(index.tech || [])]; index.content = [...(index.content || [])];

  const placed = [];
  for (const p of place) { keep(p.path); placed.push((exists(p.path) ? '入れ替え　' : '新しく足す') + '：`' + p.path + '`'); writeText(p.path, p.text) }

  /* 4. 目次：今の行は消さない・並べ替えない。zip の目次にある行と、置いたファイルで目次に無い物を最後に足す */
  const added = [];
  const add = (layer, rel) => { if (!index[layer].includes(rel)) { index[layer].push(rel); added.push('dict/' + rel) } };
  if (upIndex) { try { const zi = JSON.parse(upIndex.text); ['tech', 'content'].forEach(l => (zi[l] || []).forEach(r => add(l, r))) } catch (e) { } }
  place.forEach(p => { const m = p.path.match(/^dict\/(tech|content)\/(.+)$/); if (m) add(m[1], m[1] + '/' + m[2]) });
  const bi = index.tech.indexOf('tech/base.json');
  if (bi > 0) { index.tech.splice(bi, 1); index.tech.unshift('tech/base.json') }
  keep('dict/index.json');
  writeText('dict/index.json', JSON.stringify(index, null, 2) + '\n');

  /* 5. 置いた後の辞書を、公開ページと同じ読み方で検品する */
  let R;
  try { R = await L.loadAll(async p => readText(p), []) }
  catch (e) { restore(); return stop(['置いた後の辞書が読めません：' + e.message]) }
  const bands = [
    ...R.errs.map(e => e.n != null ? `${e.file}・${e.n}件目・${e.id}・${e.reason}` : e.line != null ? `${e.file}・${e.line}行目・${e.reason}` : `${e.file}・${e.reason}`),
    ...R.refs.map(r => r.text)
  ];
  if (bands.length) { restore(); return stop(['辞書アプリで帯が出る状態になるので、置きませんでした。出る帯：' + bands.length + '本', ...bands.map(b => '  - ' + b)]) }

  /* 6. 置けた */
  removeInbox();
  finish(0, ['**✓ 置きました。**1〜2分で公開ページに出ます。', '', '置かれていた物：' + got, '',
    ...placed.map(p => '- ' + p),
    ...(added.length ? ['', '目次に足した行：', ...added.map(a => '- `' + a + '`')] : ['', '目次に足した行：なし（もう載っていました）']),
    ...(notes.length ? ['', 'お知らせ：', ...notes.map(n => '- ' + n)] : []),
    '', '検品：帯 0（辞書アプリと同じ検品）']);
})().catch(e => {
  console.error(e);
  finish(1, ['**✗ 止まりました。本番には何も置いていません。**', '', '自動でやる係の途中で止まりました：' + e.message]);
});
