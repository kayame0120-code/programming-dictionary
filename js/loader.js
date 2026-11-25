/* ===== 窓口：辞書のファイルを読み、1つの辞書にまとめてから、画面のプログラムを動かす =====
   読む順：目次（dict/index.json）→ ②技術の決まり（tech）→ ③中身（content）→ 修正（fixes/fix-001.json から番号順）
   壊れたファイル・名前で呼んだ先が無い所・書き間違い・重なりは、飛ばしたうえで、消せない帯で知らせる */
(function(root){
'use strict';
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
function jsonErrorLine(text,e){const m=String(e&&e.message||'').match(/position (\d+)/);if(!m)return 1;return text.slice(0,+m[1]).split('\n').length}

/* key を持つ並び：同じ key をファイルをまたいで重ねない（アプリの値は3つの入れ物を通して1つの名前の集まり） */
const KEY_BOX={questions:'値',derived:'値',values:'値',css_base:'土台の値'};
const KEY_OF={css_base:'name'};
/* 名前で引く表のうち、中の名前ごとに重ねてよい表（words は表を何本ものファイルに分けて書ける） */
const DEEP_TABLE=new Set(['words']);

/* 中身を足し合わせる：並びはつなぐ・表は欄ごとに重ねる（2段まで）・ほかは後のファイルで置き換える。
   どこから来たか（org）を覚え、重なった所は org.warns に積む */
function mergeInto(d,src,origin,seen,errs,layerOf,org){
 org=org||{items:{},keys:{},tables:{},scalars:{},warns:[]};
 for(const [k,v] of Object.entries(src)){
  if(['format','layer','tech','label','note'].includes(k))continue;
  if(Array.isArray(v)){
   d[k]=d[k]||[];
   v.forEach(it=>{
    if(isObj(it)&&it.id!=null){const key=k+'\u0000'+it.id;
     if(seen[key]){errs.push({file:origin,reason:`同じ名前の項目が2つある：${k} の ${it.id}（先に ${seen[key]} で読んだ）。後の方を飛ばしました`});return}
     seen[key]=origin;layerOf[key]=src.layer;org.items[key]=origin}
    else if(isObj(it)&&KEY_BOX[k]){const kk=it[KEY_OF[k]||'key'];
     if(kk!=null){const key=KEY_BOX[k]+'\u0000'+kk;
      if(org.keys[key])org.warns.push({id:kk,text:`${KEY_BOX[k]}の名前 ${kk} が2つあります（${org.keys[key]} と ${origin} の ${k}）。同じ名前は1つにしてください`});
      else org.keys[key]=origin+' の '+k}}
    d[k].push(clone(it))});
  }else if(isObj(v)){
   d[k]=d[k]||{};
   for(const [k2,v2] of Object.entries(v)){
    const tk=k+'\u0000'+k2;
    if(DEEP_TABLE.has(k)&&isObj(v2)){
     Object.keys(v2).forEach(k3=>{const t3=tk+'\u0000'+k3;
      if(org.tables[t3]&&org.tables[t3]!==origin)org.warns.push({id:k2,text:`${k} の表 ${k2} の「${k3}」が、${org.tables[t3]} と ${origin} の両方にあります。後で読んだ ${origin} の方が残りました`});
      org.tables[t3]=origin});
    }else if(org.tables[tk]&&org.tables[tk]!==origin)
     org.warns.push({id:k2,text:`${k} の ${k2} が、${org.tables[tk]} と ${origin} の両方にあります。後で読んだ ${origin} の方が残りました。同じ名前は1本のファイルにだけ書いてください`});
    org.tables[tk]=org.tables[tk]||origin;
    if(isObj(v2)&&isObj(d[k][k2]))d[k][k2]={...d[k][k2],...clone(v2)};else d[k][k2]=clone(v2)}
  }else{
   if(org.scalars[k]&&org.scalars[k].file!==origin&&JSON.stringify(org.scalars[k].v)!==JSON.stringify(v))
    org.warns.push({id:k,text:`${k} が、${org.scalars[k].file} と ${origin} の両方にあります。後で読んだ ${origin} の方が残りました`});
   org.scalars[k]={file:origin,v};d[k]=v}
 }
 return org;
}

/* 修正1件を当てる（③の中身だけ）：{id, field, value} で欄を直す（id を持たない項目は key で探す）／{add: 入れ物, value} で足す */
function applyFix(d,it,layerOf,removed,file){
 if(!isObj(it))return '修正の形が型に無い';
 if('add' in it){
  const box=it.add,v=it.value;
  if(!Array.isArray(d[box]))return `入れ物「${box}」が辞書に無い`;
  if(!isObj(v))return '足す中身（value）が項目の形になっていない';
  if(v.id!=null&&d[box].some(x=>x&&x.id===v.id))return 'この id はもう辞書にある';
  const key=box+'\u0000'+v.id;
  if(v.id!=null&&layerOf[key]==='tech')return '②（技術の決まり）の項目は修正ファイルで直さない';
  d[box].push(clone(v));if(v.id!=null)layerOf[key]='content';return null;
 }
 if('id' in it){
  let hit=null;
  for(const [box,arr] of Object.entries(d)){if(!Array.isArray(arr))continue;const x=arr.find(y=>isObj(y)&&(y.id===it.id||(y.id==null&&y.key===it.id)));if(x){hit={box,x};break}}
  if(!hit)return '辞書にこの id が無い';
  if(layerOf[hit.box+'\u0000'+it.id]==='tech')return '②（技術の決まり）の項目は修正ファイルで直さない';
  if(!('field' in it))return '直す欄（field）が無い';
  if(it.field==='id')return 'id は直せない';
  hit.x[it.field]=clone(it.value);
  if(it.field==='disabled'&&it.value)removed[it.id]={file,name:hit.x.name||hit.x.title||it.id,box:hit.box};
  return null;
 }
 return '修正の形が型に無い（id か add が要る）';
}

/* 名前で呼んでいる先が全部あるかを確かめる */
function refCheck(d,removed){
 const out=[];
 const tagIds=new Set((d.tags||[]).map(t=>t.id)),fileIds=new Set((d.files||[]).map(f=>f.id)),
  pieceIds=new Set(Object.keys(d.pieces||{})),stepIds=new Set((d.steps||[]).map(s=>s.id));
 const say=(kind,id,who)=>{const r=removed[id];
  out.push({id,text:r?`${r.file} で消した${kind}『${r.name}』（${id}）を、${who}が呼んでいます`:`${kind} ${id} が辞書にありません。${who}が呼んでいます`})};
 const walk=(x,who)=>{
  if(Array.isArray(x)){x.forEach(y=>walk(y,who));return}
  if(!isObj(x))return;
  if(typeof x.tag==='string'&&x.tag!=='*'&&!tagIds.has(x.tag))say('札',x.tag,who);
  if(typeof x.file==='string'&&/^file-/.test(x.file)&&!fileIds.has(x.file))say('ファイルの種類',x.file,who);
  if(typeof x.from==='string'&&!pieceIds.has(x.from))say('部品のまとまり',x.from,who);
  if(typeof x.pick==='string'&&!pieceIds.has(x.pick))say('部品のまとまり',x.pick,who);
  if(typeof x.piece==='string'&&!pieceIds.has(x.piece))say('部品のまとまり',x.piece,who);
  for(const [k,v] of Object.entries(x)){if(k==='slots')continue;if(typeof v==='object')walk(v,who)}
 };
 (d.tags||[]).forEach(t=>{
  [...(t.chains||[]),...(t.inner||[])].forEach(c=>{if(!tagIds.has(c))say('札',c,`札 ${t.id}`)});
  (t.start||[]).forEach(s=>{if(s.tag&&!tagIds.has(s.tag))say('札',s.tag,`札 ${t.id}`)});
  if(t.kv&&!tagIds.has(t.kv))say('札',t.kv,`札 ${t.id} の kv`);
  if(t.rewrite)['to','kv','rows'].forEach(k=>{if(t.rewrite[k]&&!tagIds.has(t.rewrite[k]))say('札',t.rewrite[k],`札 ${t.id}`)});
  if(isObj(t.absorb))Object.keys(t.absorb).forEach(k=>{if(!tagIds.has(k))say('札',k,`札 ${t.id} の absorb`)});
  (t.in||[]).forEach(p=>{if(!fileIds.has(p.file))say('ファイルの種類',p.file,`札 ${t.id}`)});
  if(t.for&&!tagIds.has(t.for))say('札',t.for,`札 ${t.id} の for（元の札）`);
 });
 (d.files||[]).forEach(f=>{
  if(f.for&&!fileIds.has(f.for))say('ファイルの種類',f.for,`ファイルの種類 ${f.id} の for（元の種類）`);
  (f.sections||[]).forEach(s=>{if(s.group&&s.group.tag&&!tagIds.has(s.group.tag))say('札',s.group.tag,`ファイルの種類 ${f.id} の段 ${s.key} の group`)});
 });
 Object.entries(d.pieces||{}).forEach(([k,v])=>walk(v,`部品のまとまり ${k}`));
 (d.steps||[]).forEach(s=>walk(s.do||[],`手順 ${s.id}`));
 (d.examples||[]).forEach(e=>(e.steps||[]).forEach(id=>{if(!stepIds.has(id))say('手順',id,`例文 ${e.id}`)}));
 Object.entries(d.roles||{}).forEach(([k,v])=>{if(!tagIds.has(v)&&!fileIds.has(v))say('札',v,`役 ${k}`)});
 (d.techs||[]).forEach(t=>{if(t.lines_file&&!fileIds.has(t.lines_file))say('ファイルの種類',t.lines_file,`技術 ${t.name}`)});
 /* 当て方の一覧（メソッド名・引数）が指す札 */
 (d.name_guess||[]).forEach((g,i)=>{if(g&&typeof g.tag==='string'&&g.tag!=='*'&&!tagIds.has(g.tag))say('札',g.tag,`メソッド名の当て方（name_guess の${i+1}件目）`)});
 (d.arg_guess||[]).forEach((g,i)=>(g&&g.tags||[]).forEach(id=>{if(!tagIds.has(id))say('札',id,`引数の当て方（arg_guess の${i+1}件目）`)}));
 /* どこからも使われない札：どの段にも入っていない（in が無い）うえに、ほかの札・役・手順などからも呼ばれていない */
 const used=new Set();
 (d.tags||[]).forEach(t=>{[...(t.chains||[]),...(t.inner||[])].forEach(c=>used.add(c));(t.start||[]).forEach(s=>s&&s.tag&&used.add(s.tag));
  if(t.kv)used.add(t.kv);if(t.rewrite)['to','kv','rows'].forEach(k=>t.rewrite[k]&&used.add(t.rewrite[k]));if(isObj(t.absorb))Object.keys(t.absorb).forEach(k=>used.add(k))});
 Object.values(d.roles||{}).forEach(v=>used.add(v));
 (d.files||[]).forEach(f=>(f.sections||[]).forEach(s=>{if(s.group&&s.group.tag)used.add(s.group.tag)}));
 const mark=x=>{if(Array.isArray(x)){x.forEach(mark);return}if(!isObj(x))return;if(typeof x.tag==='string')used.add(x.tag);Object.values(x).forEach(v=>{if(typeof v==='object')mark(v)})};
 for(const [k,v] of Object.entries(d))if(k!=='tags'&&k!=='files')mark(v);
 (d.tags||[]).forEach(t=>{if(!(t.in||[]).length&&!used.has(t.id))
  out.push({id:t.id,text:`札 ${t.id}（${t.name||'名前なし'}）が、どのファイルの種類の段にも入っていません。札に in（入るファイルの種類と段）を書かないと、翻訳に出ません`})});
 /* 読み方の決まりが無い言語：札・ファイルの種類・技術が使っている言語ごとに、lang_rules があるかを見る */
 const rules=d.lang_rules||{},who={};
 const note=(lg,w)=>{if(lg&&!rules[lg])(who[lg]=who[lg]||[]).push(w)};
 (d.techs||[]).forEach(t=>note(t.lang,`技術 ${t.name||t.id}`));
 (d.files||[]).forEach(f=>note(f.lang,`ファイルの種類 ${f.id}`));
 (d.tags||[]).forEach(t=>note(t.lang,`札 ${t.id}`));
 (d.steps||[]).forEach(s=>(s.do||[]).forEach(w=>{if(isObj(w)&&w.lang)note(w.lang,`手順 ${s.id}`)}));
 if(d.default_lang)note(d.default_lang,'共通の値 default_lang');
 /* コマンドの札を呼ぶ手順がある時だけ、コマンドを読む言語（cmd_lang）を確かめる */
 if(d.cmd_lang&&(d.steps||[]).some(s=>(s.do||[]).some(w=>isObj(w)&&w.kind==='cmd'&&w.tag)))note(d.cmd_lang,'共通の値 cmd_lang（コマンドの札を呼ぶ手順）');
 Object.entries(who).forEach(([lg,ws])=>out.push({id:lg,text:`言語 ${lg} の読み方の決まり（lang_rules）がありません。${ws.slice(0,3).join('・')}${ws.length>3?` ほか${ws.length-3}件`:''}が使っています。この言語のコードは正しく読めません`}));
 const seen=new Set();return out.filter(x=>{const k=x.text;if(seen.has(k))return false;seen.add(k);return true});
}

/* ===== 書き間違いの確かめ：名前の指し先のほかに、値の間違い・番号の範囲・必須の欄・重なりを見る ===== */
const TAG_KINDS=['line','block','if','chain_head','chain','chain_block'];
const WORK_KINDS=['cmd','new','replace','edit','add','css','check'];
const WHEN_TYPES=['has_all','has','lacks','empty'];
const GO_TYPES=['cause','step','outside'];
const Q_TYPES=['text','choice','table'];
/* ひな形（文字・{if,t}・{each,t} の並び）から、文字と条件と each を集める */
function tplBits(x,acc){
 acc=acc||{texts:[],conds:[],eachs:[]};
 if(typeof x==='string')acc.texts.push(x);
 else if(Array.isArray(x))x.forEach(y=>tplBits(y,acc));
 else if(isObj(x)){if(x.t!=null)tplBits(x.t,acc);if(x.if!=null)[].concat(x.if).forEach(c=>acc.conds.push(String(c)));if(typeof x.each==='string')acc.eachs.push(x.each)}
 return acc;
}
/* 《key|フィルター》 を分ける */
function holes(s){return [...String(s).matchAll(/《([^》]+)》/g)].map(m=>{const p=m[1].split('|');return {key:p[0],filters:p.slice(1)}})}
/* 条件の文字から、見ている値の名前を取り出す */
function condKeys(c){
 c=String(c);
 if(/\|/.test(c)&&!/[=~^!]/.test(c))return c.split('|');
 const m=c.match(/^!?(.+?)(?:\^=|~|!=|=|$)/);return m?[m[1]]:[];
}
const RESERVED=k=>k==='one'||k==='i'||/^r\./.test(k);
function shapeCheck(d,org){
 const out=[];const add=t=>out.push({id:'',text:t});
 const src=(box,id)=>{const f=org&&org.items[box+'\u0000'+id];return f?`（${f}）`:''};
 const reBad=(s,flags)=>{if(typeof s!=='string')return '文字でない';try{new RegExp(s,flags||'');return null}catch(e){return e.message}};
 const reCheck=(s,what,flags)=>{const b=reBad(s,flags);if(b)add(`${what} の正規表現が読めません：${s}`)};
 const need=(o,keys,what)=>{if(!isObj(o)){add(`${what} が項目の形（{ }）になっていません`);return false}const miss=keys.filter(k=>o[k]==null);if(miss.length)add(`${what} に必須の欄 ${miss.join('・')} がありません`);return !miss.length};
 const tags=d.tags||[],files=d.files||[],techs=d.techs||[],rules=d.lang_rules||{};
 const T=new Map(tags.map(t=>[t.id,t])),F=new Map(files.map(f=>[f.id,f]));
 const filters=d.filters||{},words=d.words||{},pieces=d.pieces||{};
 const kw=new Set(Object.keys(d.keywords||{}));
 const posNames=new Set(Object.keys(d.positions||{}));
 const verTech=techs.filter(t=>Array.isArray(t.versions)&&t.versions.length);
 const verIds=new Set(verTech.flatMap(t=>t.versions.map(v=>v&&v.id)));
 const frontIds=new Set(techs.filter(t=>t.front).map(t=>t.id));
 const slotKeys=t=>new Set((t&&t.slots||[]).map(s=>s&&s.key));

 /* --- 技術の見出し --- */
 techs.forEach(t=>{const w=`技術 ${t.id||t.name||'（id なし）'}`;need(t,['id','name','lang'],w);
  if(t.looks!=null)reCheck(t.looks,`${w} の looks`,'m');
  (t.versions||[]).forEach((v,i)=>{if(need(v,['id','name','marks'],`${w} の版（${i+1}件目）`))[].concat(v.marks).forEach(r=>reCheck(r,`${w} の版 ${v.id} の marks`,'m'))});
  if(t.versions&&t.versions.length){if(t.default_version==null)add(`${w} は版を持つので default_version が要ります`);else if(!t.versions.some(v=>v&&v.id===t.default_version))add(`${w} の default_version「${t.default_version}」が、版の並びにありません`)}});
 const defs=techs.filter(t=>t.default);if(defs.length>1)add(`default の技術が${defs.length}つあります（${defs.map(t=>t.id).join('・')}）。辞書に1つだけにしてください`);
 if(verTech.length>1)add(`版を持つ技術が${verTech.length}つあります（${verTech.map(t=>t.id).join('・')}）。版を持つ技術は辞書に1つだけです`);
 if(d.front_default!=null&&!frontIds.has(d.front_default))add(`共通の値 front_default「${d.front_default}」が、画面の技術（front が true の技術）にありません`);

 /* --- 言語の読み方の決まり --- */
 Object.entries(rules).forEach(([lg,r])=>{if(!isObj(r))return;const w=`言語 ${lg} の読み方の決まり`;
  (r.comments||[]).forEach(c=>reCheck(c&&c.re,`${w} の comments`,'g'));
  ['code_marks','skip_lines'].forEach(k=>(r[k]||[]).forEach(s=>reCheck(s,`${w} の ${k}`,'m')));
  ['method','call','pair_kv'].forEach(k=>{if(r[k]!=null)reCheck(r[k],`${w} の ${k}`)});
  if(isObj(r.imports)){['skip','line','class_start'].forEach(k=>{if(r.imports[k]!=null)reCheck(r.imports[k],`${w} の imports.${k}`)});
   if(r.imports.role&&!(d.roles||{})[r.imports.role])add(`${w} の imports.role「${r.imports.role}」が、役（roles）にありません`)}
  if(isObj(r.pair))['head','after','elif_after','else_not'].forEach(k=>{if(r.pair[k]!=null)reCheck(r.pair[k],`${w} の pair.${k}`)});
  if(isObj(r.chain)&&r.chain.after!=null)reCheck(r.chain.after,`${w} の chain.after`);
  if(isObj(r.closure)&&r.closure.end!=null)reCheck(r.closure.end,`${w} の closure.end`);
  if(isObj(r.css))['tag_re','class_re','skip_class','layout','own'].forEach(k=>{if(r.css[k]!=null)reCheck(r.css[k],`${w} の css.${k}`)});});
 Object.entries(d.word_forms||{}).forEach(([k,v])=>reCheck(v,`言い換えの表の形 ${k}`));
 Object.entries(d.unfilters||{}).forEach(([k,v])=>{if(isObj(v)&&v.items!=null)reCheck(v.items,`元の形に戻す決まり ${k}`,'g')});

 /* --- ファイルの種類 --- */
 files.forEach(f=>{const w=`ファイルの種類 ${f.id}${src('files',f.id)}`;
  need(f,['id','name','lang','head','marks','path','summary','fields','sections',...(f.patch?['patches']:['code'])],w);
  if(f.detect!=null)reCheck(f.detect,`${w} の detect`,'m');if(f.detect_not!=null)reCheck(f.detect_not,`${w} の detect_not`,'m');
  if(f.ver!=null&&!verIds.has(f.ver))add(`${w} の ver「${f.ver}」が、技術の版にありません`);
  const fk=new Set(),sk=new Set();
  (f.fields||[]).forEach((fd,i)=>{if(!need(fd,['key','label','default'],`${w} の項目（${i+1}件目）`))return;
   if(fk.has(fd.key))add(`${w} の項目の key「${fd.key}」が2つあります`);fk.add(fd.key);
   (fd.reads||[]).forEach(r=>{const b=reBad(r,'m');if(b)add(`${w} の項目 ${fd.key} の reads の正規表現が読めません：${r}`);else if(!/\(\?<v>/.test(r))add(`${w} の項目 ${fd.key} の reads に、値を取る (?<v>…) がありません：${r}`)});
   if(fd.unfilter&&!(d.unfilters||{})[fd.unfilter])add(`${w} の項目 ${fd.key} の unfilter「${fd.unfilter}」が、元の形に戻す決まり（unfilters）にありません`)});
  (f.sections||[]).forEach((s,i)=>{if(!need(s,['key','label'],`${w} の段（${i+1}件目）`))return;
   if(sk.has(s.key))add(`${w} の段の key「${s.key}」が2つあります`);sk.add(s.key);
   if(s.group){if(!s.group.slot)add(`${w} の段 ${s.key} の group に slot がありません`);const gt=T.get(s.group.tag);if(gt&&gt.kind!=='block')add(`${w} の段 ${s.key} の group の札 ${gt.id} は、kind が block の札にしてください`)}});
  (f.patches||[]).forEach((p,i)=>{if(!need(p,['label','find','start','until','code'],`${w} の置き換える所（${i+1}件目）`))return;
   if(!['line','block'].includes(p.until))add(`${w} の置き換える所「${p.label}」の until「${p.until}」は、line か block にしてください`);
   if(p.field&&!fk.has(p.field))add(`${w} の置き換える所「${p.label}」の field「${p.field}」が、項目にありません`)});
  /* ひな形の穴：項目の key・《段:key》・《@段》・《@uses》 */
  const bits=tplBits([f.path,f.cmd,f.summary,f.uses,f.code,...(f.patches||[]).map(p=>p.code),...(f.fields||[]).map(fd=>[fd.tr,fd.via_note&&fd.via_note.t,fd.via_note&&fd.via_note.code])]);
  const okKey=k=>{let m;if(RESERVED(k))return true;if(m=k.match(/^@(\w+)$/))return m[1]==='uses'||sk.has(m[1]);if(m=k.match(/^(\w+):(\w+)(?:@[\w-]+)?$/))return sk.has(m[1]);return fk.has(k)};
  const bad=new Set();bits.texts.forEach(s=>holes(s).forEach(h=>{if(!okKey(h.key))bad.add(h.key)}));bits.conds.forEach(c=>condKeys(c).forEach(k=>{if(!okKey(k))bad.add(k)}));
  bad.forEach(k=>add(`${w} のひな形の穴《${k}》が、項目（fields）にも段にもありません`));
 });

 /* --- 札 --- */
 const secOf=new Map();files.forEach(f=>secOf.set(f.id,new Set((f.sections||[]).map(s=>s&&s.key))));
 tags.forEach(t=>{const w=`札 ${t.id}${src('tags',t.id)}`;
  need(t,['id','name','lang','kind','from','slots','tr'],w);
  if(t.kind!=null&&!TAG_KINDS.includes(t.kind))add(`${w} の kind「${t.kind}」は、${TAG_KINDS.join('・')} のどれかにしてください`);
  if(t.memo!=null&&!['items','inline'].includes(t.memo))add(`${w} の memo「${t.memo}」は、items か inline にしてください`);
  if(t.lang&&t.id&&!String(t.id).startsWith(t.lang+'-'))add(`${w} の id は、言語の印「${t.lang}-」で始めてください`);
  if(t.ver!=null&&!verIds.has(t.ver))add(`${w} の ver「${t.ver}」が、技術の版にありません`);
  const sk=new Set();(Array.isArray(t.slots)?t.slots:[]).forEach((s,i)=>{if(!need(s,['key','label','default'],`${w} の穴（${i+1}件目）`))return;
   if(sk.has(s.key))add(`${w} の穴の key「${s.key}」が2つあります`);sk.add(s.key);
   if(s.pattern!=null)reCheck(s.pattern,`${w} の穴 ${s.key} の pattern`)});
  (t.in||[]).forEach((p,i)=>{if(!need(p,['file','sec'],`${w} の in（${i+1}件目）`))return;const ss=secOf.get(p.file);if(ss&&!ss.has(p.sec))add(`${w} の in の段「${p.sec}」が、ファイルの種類 ${p.file} の段にありません（段：${[...ss].join('・')||'なし'}）`)});
  /* ひな形の穴と条件が見ている名前は、札の穴（slots）にある物だけ */
  const reads=(t.reads||[]).map(r=>isObj(r)?r.t:r),elifR=t.elif_reads||[];
  const bits=tplBits([t.code,t.open,t.close,t.else,t.elif,reads,elifR,t.tr,t.else_tr,t.elif_tr,t.uses,t.show,t.point,t.sum,t.returns&&t.returns.form,t.returns&&t.returns.desc,isObj(t.looks)?[...Object.keys(t.looks),...Object.values(t.looks)]:null]);
  const bad=new Set();bits.texts.forEach(s=>holes(s).forEach(h=>{if(!RESERVED(h.key)&&!sk.has(h.key))bad.add(h.key)}));
  [...bits.conds,...bits.eachs].forEach(c=>condKeys(c).forEach(k=>{if(!RESERVED(k)&&!sk.has(k))bad.add(k)}));
  bad.forEach(k=>add(`${w} のひな形・条件の穴《${k}》が、札の穴（slots）にありません`));
  (t.reads||[]).forEach(r=>{if(isObj(r)&&isObj(r.set))Object.keys(r.set).forEach(k=>{if(!sk.has(k))add(`${w} の reads の set の穴「${k}」が、札の穴にありません`)})});
  if(t.returns!=null){need(t.returns,['form','hint'],`${w} の returns`);if(isObj(t.returns&&t.returns.pattern))Object.entries(t.returns.pattern).forEach(([k,v])=>{if(!sk.has(k))add(`${w} の returns.pattern の穴「${k}」が、札の穴にありません`);reCheck(v,`${w} の returns.pattern.${k}`)})}
  if(t.catch_all!=null&&!sk.has(t.catch_all))add(`${w} の catch_all「${t.catch_all}」が、札の穴にありません`);
  if(isObj(t.absorb))Object.entries(t.absorb).forEach(([id,a])=>{if(!isObj(a))return;if(a.to&&!sk.has(a.to))add(`${w} の absorb の to「${a.to}」が、この札の穴にありません`);const at=T.get(id);if(at&&a.from&&!slotKeys(at).has(a.from))add(`${w} の absorb の from「${a.from}」が、札 ${id} の穴にありません`)});
  if(isObj(t.rewrite)){const r=t.rewrite,to=T.get(r.to),rows=T.get(r.rows);
   if(to&&isObj(r.slots))Object.entries(r.slots).forEach(([k,v])=>{if(!slotKeys(to).has(k))add(`${w} の rewrite.slots の「${k}」が、札 ${r.to} の穴にありません`);holes(v).forEach(h=>{if(!sk.has(h.key))add(`${w} の rewrite.slots の《${h.key}》が、この札の穴にありません`)})});
   if(rows&&r.pairs&&!slotKeys(rows).has(r.pairs))add(`${w} の rewrite.pairs「${r.pairs}」が、札 ${r.rows} の穴にありません`)}
  if(isObj(t.looks)&&(d.styles||[]).length){const st=new Set(d.styles.map(s=>s&&s.id));
   Object.values(t.looks).forEach(v=>{const hs=holes(v);
    if(!hs.length){if(!st.has(v))add(`${w} の looks「${v}」が、見た目のひな形（styles）にありません`);return}
    hs.forEach(h=>{const s=(t.slots||[]).find(x=>x&&x.key===h.key);(s&&s.options||[]).forEach(o=>{const ov=isObj(o)?o.v:o;const id=String(v).replace(/《[^》]+》/g,ov);if(ov!==''&&!st.has(id))add(`${w} の looks（穴 ${h.key} が「${ov}」の時）「${id}」が、見た目のひな形（styles）にありません`)})})})}
 });
 /* メモの名前から札を選ぶ時に迷う所：①同じ段に直接入る札どうし ②1つの札がつなげる札・中に入れる札どうし で、名前が重ならない */
 const dupName=(ids,where)=>{const byName={};[...new Set(ids)].filter(id=>T.has(id)).forEach(id=>{const n=T.get(id).name;(byName[n]=byName[n]||[]).push(id)});
  Object.entries(byName).forEach(([n,a])=>{if(a.length>1)add(`${where}に、名前「${n}」の札が${a.length}つあります（${a.join('・')}）。メモから札を選べないので、名前を分けてください`)})};
 files.forEach(f=>(f.sections||[]).forEach(s=>{if(!isObj(s))return;
  dupName(tags.filter(t=>(t.in||[]).some(p=>p&&p.file===f.id&&p.sec===s.key)).map(t=>t.id),`ファイルの種類 ${f.id} の段 ${s.key} `)}));
 tags.forEach(t=>{const sub=[...(t.chains||[]),...(t.inner||[])];if(sub.length)dupName(sub,`札 ${t.id} につなげる・中に入れる札`)});

 /* --- 部品の意味 --- */
 (d.parts||[]).forEach(p=>{const w=`部品の意味 ${p&&p.id}${src('parts',p&&p.id)}`;if(!need(p,['id','pattern','meaning'],w))return;
  const ks=new Set(holes(p.pattern).map(h=>h.key));[p.meaning,p.show].forEach(s=>s&&holes(s).forEach(h=>{if(!ks.has(h.key))add(`${w} の《${h.key}》が、pattern の穴にありません`)}));
  if(p.only!=null&&p.only!=='line')add(`${w} の only「${p.only}」は、line にしてください`)});

 /* --- 言い換え・フィルター（どの文字の中でも《〜|フィルター》を見る） --- */
 const badF=new Set();
 const fOk=f=>{let m;if(f==='label'||/^(has|not|col):.+/.test(f)||/^(is|ne):\w+=/.test(f))return true;if(m=f.match(/^words:(.+)$/)){if(!isObj(words[m[1]]))badF.add(`言い換えの表「${m[1]}」（words:${m[1]}）が、言い換え（words）にありません`);return true}return !!filters[f]};
 const scan=(x,who)=>{if(typeof x==='string'){holes(x).forEach(h=>h.filters.forEach(f=>{if(!fOk(f))badF.add(`フィルター「${f}」が、名前の変え方（filters）にありません。${who}が使っています`)}));return}
  if(Array.isArray(x))x.forEach(y=>scan(y,who));else if(isObj(x))Object.values(x).forEach(y=>scan(y,who))};
 tags.forEach(t=>scan(t,`札 ${t.id}`));files.forEach(f=>scan(f,`ファイルの種類 ${f.id}`));
 ['parts','errors','steps','examples','questions','derived','values','rows'].forEach(b=>(d[b]||[]).forEach((x,i)=>scan(x,`${b} の ${x&&(x.id||x.key)||(i+1)+'件目'}`)));
 Object.entries(pieces).forEach(([k,v])=>scan(v,`部品のまとまり ${k}`));
 badF.forEach(add);

 /* --- 当て方の一覧 --- */
 const ng=d.name_guess||[];ng.forEach((g,i)=>need(g,['tag','method'],`メソッド名の当て方（${i+1}件目）`));
 const stars=ng.map((g,i)=>g&&g.tag==='*'?i:-1).filter(i=>i>=0);
 if(stars.length>1)add(`メソッド名の当て方（name_guess）に「*」の行が${stars.length}つあります。1つだけにしてください（後の束の行は使われません）`);
 else if(stars.length===1&&stars[0]!==ng.length-1)add(`メソッド名の当て方（name_guess）の「*」の行が最後にありません。「*」より後ろの${ng.length-1-stars[0]}行は使われません`);
 (d.arg_guess||[]).forEach((g,i)=>need(g,['tags','arg'],`引数の当て方（${i+1}件目）`));

 /* --- エラー --- */
 const srcs=d.error_sources||[];
 (d.errors||[]).forEach(e=>{const w=`エラー ${e&&e.id}${src('errors',e&&e.id)}`;
  if(!need(e,['id','match','source','extract','happened','stopped','causes','steps'],w))return;
  if(!String(e.id).startsWith('err-'))add(`${w} の id は err- で始めてください`);
  if(srcs.length&&!srcs.includes(e.source))add(`${w} の source「${e.source}」が、エラーの出どころ（${srcs.join('・')}）にありません`);
  const ek=new Set();(e.extract||[]).forEach((x,i)=>{if(!need(x,['key','label','re'],`${w} の extract（${i+1}件目）`))return;
   if(ek.has(x.key))add(`${w} の extract の key「${x.key}」が2つあります`);ek.add(x.key);
   const b=reBad(x.re);if(b)add(`${w} の extract ${x.key} の正規表現が読めません：${x.re}`);else if(!/\(\?<v>/.test(x.re))add(`${w} の extract ${x.key} に、値を取る (?<v>…) がありません`)});
  const nH=Array.isArray(e.happened)?e.happened.length:0,nC=Array.isArray(e.causes)?e.causes.length:0,nS=Array.isArray(e.steps)?e.steps.length:0;
  if(need(e.stopped,['step','at'],`${w} の stopped`)&&!(Number.isInteger(e.stopped.step)&&e.stopped.step>=1&&e.stopped.step<=nH))add(`${w} の止まった工程 stopped.step「${e.stopped.step}」が、何が起きたか（happened）の1〜${nH}番にありません`);
  (e.causes||[]).forEach((c,i)=>{if(isObj(c))need(c,['text'],`${w} の原因の候補（${i+1}件目）`);else if(typeof c!=='string')add(`${w} の原因の候補（${i+1}件目）は、文字か { text, why } にしてください`)});
  (e.steps||[]).forEach((s,i)=>{const sw=`${w} の確かめる手順${i+1}`;if(!need(s,['cmd','branches'],sw))return;
   (s.branches||[]).forEach((b,j)=>{const bw=`${sw} の行き先${j+1}`;if(!need(b,['text','when','go'],bw))return;
    if(!GO_TYPES.includes(b.go))add(`${bw} の go「${b.go}」は、${GO_TYPES.join('・')} のどれかにしてください`);
    if(b.go==='cause'&&!(Number.isInteger(b.cause)&&b.cause>=1&&b.cause<=nC))add(`${bw} の確定する候補 cause「${b.cause}」が、原因の候補の1〜${nC}番にありません`);
    if(b.go==='step'&&!(Number.isInteger(b.step)&&b.step>=1&&b.step<=nS))add(`${bw} の次の手順 step「${b.step}」が、確かめる手順の1〜${nS}番にありません`);
    if(b.go==='step'&&b.step===i+1)add(`${bw} の次の手順が、自分自身（手順${i+1}）になっています`);
    (b.drops||[]).forEach(n=>{if(!(Number.isInteger(n)&&n>=1&&n<=nC))add(`${bw} の消える候補 drops「${n}」が、原因の候補の1〜${nC}番にありません`)});
    if(isObj(b.when)){if(!WHEN_TYPES.includes(b.when.type))add(`${bw} の when.type「${b.when.type}」は、${WHEN_TYPES.join('・')} のどれかにしてください`);
     else if(b.when.type!=='empty'&&!(Array.isArray(b.when.words)&&b.when.words.length))add(`${bw} の when に、探す言葉（words）がありません`)}
    else add(`${bw} の when が { type, words } の形になっていません`)})});
  /* 文の中の《部品》は、extract で抜き出す物だけ */
  const bad=new Set();const texts=tplBits([e.happened,e.stopped&&e.stopped.at,e.stopped&&e.stopped.note,(e.causes||[]).map(c=>isObj(c)?[c.text,c.why]:c),(e.steps||[]).map(s=>isObj(s)?[s.cmd,s.desc,(s.branches||[]).map(b=>isObj(b)?[b.text,isObj(b.when)?b.when.words:null]:null)]:null)]).texts;
  texts.forEach(s=>holes(s).forEach(h=>{if(!ek.has(h.key))bad.add(h.key)}));
  bad.forEach(k=>add(`${w} の文の中の《${k}》が、抜き出す部品（extract）にありません`))});

 /* --- 機能解説：例文・値・対応表 --- */
 (d.examples||[]).forEach(x=>{const w=`例文 ${x&&x.id}${src('examples',x&&x.id)}`;if(!need(x,['id','text','words'],w))return;
  if(!String(x.id).startsWith('ex-'))add(`${w} の id は ex- で始めてください`);
  [].concat(x.words).forEach(k=>{if(!kw.has(k))add(`${w} の words「${k}」が、言葉（keywords）の見出しにありません`)})});
 (d.questions||[]).forEach((q,i)=>{const w=`自分で決める値 ${q&&q.key||(i+1)+'件目'}`;if(!need(q,['key','text','type','default'],w))return;
  if(!Q_TYPES.includes(q.type))add(`${w} の type「${q.type}」は、${Q_TYPES.join('・')} のどれかにしてください`);
  if(q.type==='choice'&&!(Array.isArray(q.choices)&&q.choices.length))add(`${w} は choice なので choices が要ります`);
  if(q.type==='table'&&!(Array.isArray(q.cols)&&q.cols.length))add(`${w} は table なので cols が要ります`);
  (q.cols||[]).forEach((c,j)=>need(c,['key','label'],`${w} の列（${j+1}件目）`))});
 (d.derived||[]).forEach((x,i)=>need(x,['key','text','t','if'],`決まりで決まる値 ${x&&x.key||(i+1)+'件目'}`));
 (d.values||[]).forEach((x,i)=>need(x,['key','t'],`画面に出さない値 ${x&&x.key||(i+1)+'件目'}`));
 const exIds=new Set((d.examples||[]).map(x=>x&&x.id));
 [...(d.questions||[]),...(d.derived||[]),...(d.values||[])].forEach(x=>{if(x&&exIds.has(x.key))add(`値の名前 ${x.key} が、例文の id と同じです。重ねないでください`)});
 (d.rows||[]).forEach((r,i)=>{const w=`対応表の行（${i+1}件目）`;if(!need(r,['if','action','file'],w))return;(r.words||[]).forEach(k=>{if(!kw.has(k))add(`${w} の words「${k}」が、言葉（keywords）の見出しにありません`)})});

 /* --- 機能解説：手順と部品 --- */
 const fileOfWork=w=>{if(w.file)return F.get(w.file);const p=pieces[w.from]||pieces[w.pick];return p&&isObj(p)&&p.file?F.get(p.file):null};
 const callCheck=(x,who)=>{if(Array.isArray(x)){x.forEach(y=>callCheck(y,who));return}if(!isObj(x))return;
  if(typeof x.tag==='string'&&isObj(x.set)){const t=T.get(x.tag);if(t){const sk=slotKeys(t);Object.keys(x.set).forEach(k=>{if(!sk.has(k))add(`${who} で札 ${x.tag} に入れる穴「${k}」が、その札の穴にありません`)})}}
  Object.entries(x).forEach(([k,v])=>{if(k!=='set'&&typeof v==='object')callCheck(v,who)})};
 (d.steps||[]).forEach(s=>{const w=`手順 ${s&&s.id}${src('steps',s&&s.id)}`;if(!need(s,['id','title','do'],w))return;
  if(!String(s.id).startsWith('st-'))add(`${w} の id は st- で始めてください`);
  if(s.front!=null&&!frontIds.has(s.front))add(`${w} の front「${s.front}」が、画面の技術（front が true の技術）にありません`);
  (Array.isArray(s.do)?s.do:[]).forEach((x,i)=>{const ww=`${w} の作業${i+1}`;if(!need(x,['kind'],ww))return;
   if(!WORK_KINDS.includes(x.kind))add(`${ww} の kind「${x.kind}」は、${WORK_KINDS.join('・')} のどれかにしてください`);
   if(x.at!=null&&!posNames.has(x.at))add(`${ww} の at「${x.at}」が、決まった位置（positions）にありません`);
   if(x.kind==='add'&&x.at==null)add(`${ww} は add なので、足す位置 at が要ります`);
   if(x.lang!=null&&!rules[x.lang])add(`${ww} の lang「${x.lang}」に、読み方の決まり（lang_rules）がありません`);
   if(x.until!=null&&!['line','block'].includes(x.until))add(`${ww} の until「${x.until}」は、line にしてください`);
   if(x.mode!=null&&!['new','replace'].includes(x.mode))add(`${ww} の mode「${x.mode}」は、new か replace にしてください`);
   if(isObj(x.modes))Object.entries(x.modes).forEach(([k,v])=>{if(!['new','replace'].includes(v))add(`${ww} の modes の ${k}「${v}」は、new か replace にしてください`)});
   const f=fileOfWork(x);
   if(x.patch!=null&&f&&!(f.patches||[]).some(p=>p&&p.label===x.patch))add(`${ww} の patch「${x.patch}」が、ファイルの種類 ${f.id} の置き換える所にありません`);
   if(x.sec!=null&&f&&!(f.sections||[]).some(p=>p&&p.key===x.sec))add(`${ww} の sec「${x.sec}」が、ファイルの種類 ${f.id} の段にありません`);
   if(isObj(x.secs)&&f)Object.keys(x.secs).forEach(k=>{if(!(f.sections||[]).some(p=>p&&p.key===k))add(`${ww} の secs の段「${k}」が、ファイルの種類 ${f.id} の段にありません`)})});
  callCheck(s.do,w)});
 Object.entries(pieces).forEach(([k,p])=>{const w=`部品のまとまり ${k}`;callCheck(p,w);
  if(isObj(p)&&p.file){const f=F.get(p.file);if(f&&isObj(p.secs))Object.keys(p.secs).forEach(s=>{if(!(f.sections||[]).some(x=>x&&x.key===s))add(`${w} の secs の段「${s}」が、ファイルの種類 ${f.id} の段にありません`)})}});

 /* --- 見た目 --- */
 (d.styles||[]).forEach(s=>{const w=`見た目のひな形 ${s&&s.id}${src('styles',s&&s.id)}`;if(!need(s,['id','name','rules'],w))return;(s.rules||[]).forEach((r,i)=>need(r,['props'],`${w} の決まり（${i+1}件目）`))});
 (d.css_base||[]).forEach((b,i)=>need(b,['name','value','label'],`CSS の土台の値（${i+1}件目）`));

 const seen=new Set();return out.filter(x=>{if(seen.has(x.text))return false;seen.add(x.text);return true});
}

/* 読んだ文字の束から辞書を作る（画面なしでも使える） */
function build(index,files,fixFiles){
 const d={techs:[],format:index.format},errs=[],seen={},layerOf={},removed={},loaded=[],applied=[];
 const org={items:{},keys:{},tables:{},scalars:{},warns:[]},fileInfo=[];
 const fmt=index.format;
 const parse=(f)=>{if(f.text==null){errs.push({file:f.path,reason:'ファイルが見つからない'});return null}
  try{return JSON.parse(f.text)}catch(e){errs.push({file:f.path,line:jsonErrorLine(f.text,e),reason:'JSONとして読めない'});return null}};
 /* ファイルごとに、何が入っていたかを覚える（辞書の状態で、アプリ×機能ごとに見せるため） */
 const info=(f,j,layer,ok)=>{const n=k=>Array.isArray(j[k])?j[k].length:0;
  fileInfo.push({path:f.path,layer,ok,label:typeof j.label==='string'?j.label:'',tech:typeof j.tech==='string'?j.tech:(isObj(j.tech)?j.tech.id:''),
   techName:isObj(j.tech)?j.tech.name||j.tech.id:'',base:layer==='tech'&&(isObj(j.tech)||!Array.isArray(j.files)),
   counts:{tags:n('tags'),files:n('files'),errors:n('errors'),examples:n('examples'),steps:n('steps'),parts:n('parts'),styles:n('styles')}})};
 const techFiles=files.filter(f=>f.layer==='tech'),contentFiles=files.filter(f=>f.layer==='content');
 techFiles.forEach(f=>{const j=parse(f);if(!j)return;
  if(!isObj(j)){errs.push({file:f.path,reason:'JSONの形が辞書のファイルではない'});return}
  if(j.format!==fmt){errs.push({file:f.path,reason:`format ${j.format} が目次の format ${fmt} と違う（作り直しが要る）`});info(f,j,'tech',false);return}
  if(j.layer!=null&&j.layer!=='tech')org.warns.push({id:f.path,text:`${f.path} は目次の tech に載っていますが、頭の layer が「${j.layer}」です`});
  j.layer='tech';if(j.tech)d.techs.push(clone(j.tech));mergeInto(d,j,f.path,seen,errs,layerOf,org);loaded.push(f.path);info(f,j,'tech',true)});
 const techIds=new Set(d.techs.map(t=>t.id));
 contentFiles.forEach(f=>{const j=parse(f);if(!j)return;
  if(!isObj(j)){errs.push({file:f.path,reason:'JSONの形が辞書のファイルではない'});return}
  if(j.format!==fmt){errs.push({file:f.path,reason:`format ${j.format} が目次の format ${fmt} と違う（作り直しが要る）`});info(f,j,'content',false);return}
  if(j.tech&&!techIds.has(j.tech)){errs.push({file:f.path,reason:`${f.path}（${j.label||j.tech}）は、技術 ${j.tech} の土台（頭に tech を持つ JSON2）が読めていないので、読んでいません。土台が目次に無いか、ファイルが見つかりません`,orphan:true});info(f,j,'content',false);return}
  if(j.layer!=null&&j.layer!=='content')org.warns.push({id:f.path,text:`${f.path} は目次の content に載っていますが、頭の layer が「${j.layer}」です`});
  if(j.tech==null)org.warns.push({id:f.path,text:`${f.path} の頭に tech（属する技術の id）がありません`});
  if(j.label==null)org.warns.push({id:f.path,text:`${f.path} の頭に label（見せる名前）がありません`});
  j.layer='content';mergeInto(d,j,f.path,seen,errs,layerOf,org);loaded.push(f.path);info(f,j,'content',true)});
 (fixFiles||[]).forEach(f=>{const j=parse(f);if(!j)return;
  if(!isObj(j)||!Array.isArray(j.items)){errs.push({file:f.path,line:1,reason:'items の並びが無い（修正ファイルの形が型に無い）'});return}
  if(j.format!=null&&j.format!==fmt){errs.push({file:f.path,line:1,reason:`format ${j.format} が目次の format ${fmt} と違う（作り直しが要る）`});return}
  j.items.forEach((it,i)=>{const r=applyFix(d,it,layerOf,removed,f.path);
   if(r)errs.push({file:f.path,n:i+1,id:(it&&(it.id||(it.value&&it.value.id)))||'（id なし）',reason:r})});
  applied.push(f.path)});
 /* 消す印の付いた物を外す */
 for(const k of Object.keys(d))if(Array.isArray(d[k]))d[k]=d[k].filter(x=>!(isObj(x)&&x.disabled));
 if(isObj(d.pieces))for(const k of Object.keys(d.pieces))if(isObj(d.pieces[k])&&d.pieces[k].disabled)delete d.pieces[k];
 /* 並びの印（o）を持つ入れ物は、その順に並べ直す（印の無い物は後ろに、読んだ順で） */
 for(const k of Object.keys(d))if(Array.isArray(d[k])&&d[k].some(x=>isObj(x)&&typeof x.o==='number')){
  d[k]=d[k].map((x,i)=>[x,i]).sort((a,b)=>{const oa=isObj(a[0])&&typeof a[0].o==='number'?a[0].o:Infinity,ob=isObj(b[0])&&typeof b[0].o==='number'?b[0].o:Infinity;return oa-ob||a[1]-b[1]}).map(x=>x[0])}
 /* 札の側が持つ「入るファイルの種類と段」から、ファイルの種類ごとの札の並びを作る */
 (d.files||[]).forEach(f=>{if(!isObj(f))return;(f.sections||[]).forEach(sec=>{if(!isObj(sec))return;
  const list=[];(d.tags||[]).forEach((t,ti)=>(isObj(t)&&t.in||[]).forEach(p=>{if(p&&p.file===f.id&&p.sec===sec.key)list.push([t.id,typeof p.n==='number'?p.n:Infinity,ti])}));
  sec.tags=list.sort((a,b)=>a[1]-b[1]||a[2]-b[2]).map(x=>x[0])})});
 /* 確かめ：名前の指し先 → 重なり → 書き間違い。確かめの途中で止まっても、読み込みは止めない */
 let refs=[];
 try{refs=refCheck(d,removed)}catch(e){refs=[{id:'',text:'名前の指し先を確かめる途中で止まりました：'+e.message}]}
 refs.push(...org.warns);
 try{refs.push(...shapeCheck(d,org))}catch(e){refs.push({id:'',text:'書き間違いを確かめる途中で止まりました（形が大きく崩れている所があります）：'+e.message})}
 const state={loaded,applied,files:fileInfo,last:applied.length?applied[applied.length-1].replace(/^.*\//,'').replace(/\.json$/,''):''};
 return {dict:d,errs,refs,state,removed};
}

/* 画面で選んだJSONの置き場所を、ファイルの頭の印から決める（dict/ に置いた時と同じ場所） */
function placeUpload(name,text){
 let j;try{j=JSON.parse(text)}catch(e){return {name,reason:`JSONとして読めない（${jsonErrorLine(text,e)}行目）`}}
 if(!isObj(j))return {name,reason:'JSONの形が辞書のファイルではない'};
 if(j.kind==='dict-missing')return {name,reason:'未登録の一覧を書き出したファイルです。辞書のファイルではないので読みません（別のチャットに渡して、辞書のJSONにしてもらう物です）'};
 if(Array.isArray(j.tech)&&Array.isArray(j.content))return {name,path:'dict/index.json',text};
 if(j.layer==='tech')return {name,path:'dict/tech/'+name,text};
 if(j.layer==='content')return {name,path:'dict/content/'+name,text};
 if(Array.isArray(j.items)){if(!/^fix-\d{3}\.json$/.test(name))return {name,reason:'修正ファイルには fix-001.json のように番号3桁の名前を付ける'};return {name,path:'dict/fixes/'+name,text}}
 return {name,reason:'技術の決まり（layer: tech）・中身（layer: content）・修正（items）・目次（index.json）のどれか分からない。ファイルの頭に layer を書く'};
}

/* ===== zip を取り出す（ブラウザの中だけで行う。ほかの道具は使わない） ===== */
async function inflateRaw(bytes){
 if(typeof DecompressionStream==='undefined')throw new Error('このブラウザは zip を取り出せません。zip を取り出したフォルダを入れてください');
 const ds=new DecompressionStream('deflate-raw');
 const out=new Response(new Blob([bytes]).stream().pipeThrough(ds));
 return new Uint8Array(await out.arrayBuffer());
}
function zipName(bytes,utf8){
 if(utf8)return new TextDecoder('utf-8').decode(bytes);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch(e){try{return new TextDecoder('shift_jis').decode(bytes)}catch(e2){return new TextDecoder('utf-8').decode(bytes)}}
}
/* zip の中の .json を全部取り出す。返り値：{files:[{name,path,text}], notes:[…]} */
async function unzip(buf,zipLabel){
 const u8=new Uint8Array(buf),dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength),files=[],notes=[];
 let eocd=-1;for(let i=u8.length-22;i>=Math.max(0,u8.length-65557);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}}
 if(eocd<0)throw new Error(`${zipLabel} は zip として読めません`);
 const n=dv.getUint16(eocd+10,true);let p=dv.getUint32(eocd+16,true);
 for(let k=0;k<n;k++){
  if(dv.getUint32(p,true)!==0x02014b50)throw new Error(`${zipLabel} の中身の一覧が壊れています`);
  const flags=dv.getUint16(p+8,true),method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true);
  const nl=dv.getUint16(p+28,true),xl=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
  const full=zipName(u8.subarray(p+46,p+46+nl),!!(flags&0x800));p+=46+nl+xl+cl;
  const base=full.split('/').pop();
  if(!base||full.endsWith('/')||/(^|\/)__MACOSX\//.test(full)||base.startsWith('._')||base==='.DS_Store')continue;
  if(/\.zip$/i.test(base)){notes.push(`${zipLabel} の中の ${full} は zip です。zip の中の zip は読みません（取り出してから入れてください）`);continue}
  if(!/\.json$/i.test(base))continue;
  if(flags&1){notes.push(`${zipLabel} の中の ${full} はパスワード付きです。パスワード無しの zip にしてください`);continue}
  const lnl=dv.getUint16(off+26,true),lxl=dv.getUint16(off+28,true),start=off+30+lnl+lxl;
  const raw=u8.subarray(start,start+csize);
  let data;
  if(method===0)data=raw;else if(method===8)data=await inflateRaw(raw);
  else{notes.push(`${zipLabel} の中の ${full} は、読めない縮め方（${method}）です`);continue}
  files.push({name:base,path:full,text:new TextDecoder('utf-8').decode(data).replace(/^﻿/,'')});
 }
 return {files,notes};
}
/* 入れた物（ファイル・zip・フォルダの中身）を、辞書の置き場所に振り分ける。
   返り値：{picked:[…置き場所の決まった物と使えなかった物], notes:[…一度だけ知らせる事]} */
async function sortUploads(items){
 const picked=[],notes=[];let skipped=0;
 for(const it of items){
  if(/\.zip$/i.test(it.name)){
   try{const z=await unzip(await it.buffer(),it.name);notes.push(...z.notes);
    if(!z.files.length)notes.push(`${it.name} の中に .json がありませんでした`);
    z.files.forEach(f=>picked.push(placeUpload(f.name,f.text)))}
   catch(e){notes.push(e.message)}
  }else if(/\.json$/i.test(it.name))picked.push(placeUpload(it.name,(await it.text()).replace(/^﻿/,'')));
  else skipped++;
 }
 if(skipped)notes.push(`.json と .zip 以外のファイル ${skipped}本は読みませんでした`);
 /* 1回に同じ置き場所のファイルが2本来た時は、後の方を使う */
 const last={};picked.forEach((p,i)=>{if(p.path)last[p.path]=i});
 const out=picked.filter((p,i)=>!p.path||last[p.path]===i);
 const dup=picked.filter((p,i)=>p.path&&last[p.path]!==i).map(p=>p.path);
 [...new Set(dup)].forEach(pth=>notes.push(`${pth} に入るファイルが1回に2本以上ありました。後の方を使いました`));
 return {picked:out,notes};
}

async function loadAll(getText,uploads){
 uploads=uploads||[];
 const up={};uploads.forEach(u=>{if(u.path)up[u.path]=u.text});
 const fromSite=getText;
 const get=async p=>p in up?up[p]:await fromSite(p);
 const upErrs=uploads.filter(u=>u.reason).map(u=>({file:'入れたファイル '+u.name,reason:u.reason}));
 const idxText=await get('dict/index.json');
 let index,emptyIndex=false;
 if(idxText==null){
  /* 目次がどこにも無い時：入れたファイルがあれば、中身が空の目次で読む（入れた物は目次の最後に足して読む） */
  if(!uploads.some(u=>u.path)){const e=new Error('dict/index.json が読めません');e.picked=uploads.length;throw e}
  let fm=2;for(const u of uploads){if(!u.path)continue;try{const j=JSON.parse(u.text);if(j&&j.format!=null){fm=j.format;break}}catch(e){}}
  index={format:fm,tech:[],content:[]};emptyIndex=true;
 }else{try{index=JSON.parse(idxText)}catch(e){throw new Error('dict/index.json が JSON として読めません（'+jsonErrorLine(idxText,e)+'行目）')}}
 /* 入れたファイルのうち目次に無い物は、目次の最後に足した時と同じに読む。base.json は先頭に */
 const added=[];
 index={...index,tech:[...(index.tech||[])],content:[...(index.content||[])]};
 const ups=uploads.filter(u=>u.path).map((u,i)=>[u,i]).sort((a,b)=>(/\/base\.json$/.test(b[0].path)?1:0)-(/\/base\.json$/.test(a[0].path)?1:0)||a[1]-b[1]).map(x=>x[0]);
 ups.forEach(u=>{const m=u.path.match(/^dict\/(tech|content)\/(.+)$/);if(!m)return;const rel=m[1]+'/'+m[2];
  if(!index[m[1]].includes(rel)){index[m[1]].push(rel);added.push('dict/'+rel)}});
 getText=get;
 const files=[];
 for(const p of index.tech||[])files.push({path:'dict/'+p,layer:'tech',text:await getText('dict/'+p)});
 for(const p of index.content||[])files.push({path:'dict/'+p,layer:'content',text:await getText('dict/'+p)});
 const fixes=[];
 for(let n=1;n<1000;n++){const p=`dict/fixes/fix-${String(n).padStart(3,'0')}.json`;const t=await getText(p);if(t==null)break;fixes.push({path:p,text:t})}
 const R=build(index,files,fixes);
 R.errs.push(...upErrs);
 const upSet=new Set(uploads.filter(u=>u.path).map(u=>u.path));
 R.state.files.forEach(f=>{f.uploaded=upSet.has(f.path)});
 R.state.uploaded=uploads.filter(u=>u.path).map(u=>u.path);R.state.added=added;R.state.emptyIndex=emptyIndex;
 return R;
}

if(typeof module!=='undefined'&&module.exports){module.exports={build,loadAll,placeUpload,unzip,sortUploads,shapeCheck,refCheck};return}

/* ---- 画面での動き ---- */
/* PCで直接開いた時（file:）は、入れていない物を公開ページから読む。公開ページで開いた時は、同じ場所の dict/ を読む */
const SITE='https://kayame0120-code.github.io/programming-dictionary/';
const LOCAL=location.protocol==='file:',siteRead=[];
const getText=async p=>{try{const r=await fetch(LOCAL?SITE+p:p,{cache:'no-store'});if(!r.ok)return null;const t=await r.text();if(LOCAL)siteRead.push(p);return t}catch(e){return null}};
/* 画面のプログラムを読む。1枚に詰めたHTMLでは、同じ名前で中に入れてある物を使う */
const addScript=src=>new Promise((ok,ng)=>{
 const inl=document.querySelector('script[type="text/x-dict-src"][data-src="'+src+'"]');
 const s=document.createElement('script');
 if(inl){s.textContent=inl.textContent;document.body.appendChild(s);ok();return}
 s.src=src;s.onload=ok;s.onerror=()=>ng(new Error(src+' が読めません'));document.body.appendChild(s)});
/* 入れたJSONは、このタブの中に残す（再読み込みしても残り、タブを閉じると消える） */
const UP_KEY='dict-uploads',NOTE_KEY='dict-upload-notes';
const readUploads=()=>{try{return JSON.parse(sessionStorage.getItem(UP_KEY)||'[]')}catch(e){return []}};
const e2=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const $id=id=>document.getElementById(id);
function showBox(html){const box=$id('dictErr');if(box){box.innerHTML=html;box.classList.remove('hide')}}
/* 入れた物を、タブに残して開き直す */
async function takeIn(items,pre){
 pre=pre||[];
 if(!items.length){showBox('<b>落とした物を受け取れませんでした</b><ul>'+[...pre,'もう一度落とすか、枠を押してファイルを選んでください'].map(t=>'<li>'+e2(t)+'</li>').join('')+'</ul>');return}
 const z=$id('dropZone');if(z)z.classList.add('busy');
 const {picked,notes:n2}=await sortUploads(items);const notes=[...pre,...n2];
 if(!picked.length){showBox('<b>入れた物の中に、辞書のJSONがありませんでした</b><ul>'+notes.map(t=>'<li>'+e2(t)+'</li>').join('')+'</ul>');if(z)z.classList.remove('busy');return}
 /* 同じ置き場所の物は新しい方に入れ替える。使えなかったファイルは、同じ名前を入れ直したら外す */
 const keep=readUploads().filter(u=>!picked.some(p=>(u.path&&p.path===u.path)||(!u.path&&p.name===u.name)));
 try{sessionStorage.setItem(UP_KEY,JSON.stringify([...keep,...picked]));sessionStorage.setItem(NOTE_KEY,JSON.stringify(notes))}
 catch(e){showBox('<b>入れたファイルが大きすぎて、このタブに残せませんでした。何も入れ替えていません</b>');if(z)z.classList.remove('busy');return}
 location.reload();
}
const fileItem=f=>({name:f.name,text:()=>f.text(),buffer:()=>f.arrayBuffer()});
/* 落とした物を受け取る。ファイルは落とした瞬間にそのまま受け取る（PCで直接開いたページでは、
   落とした物の入口 webkitGetAsEntry からファイルを取り出すのをブラウザが断るため）。入口はフォルダの時だけ使う */
async function readDirHandle(h,acc){
 for await (const [name,c] of h.entries()){
  if(c.kind==='file'){try{acc.push(fileItem(await c.getFile()))}catch(e){}}
  else if(name!=='__MACOSX')await readDirHandle(c,acc);
 }
}
function readEntry(ent,acc){
 return new Promise(res=>{
  if(ent.isFile){ent.file(f=>{acc.push(fileItem(f));res()},()=>res());return}
  if(ent.isDirectory){if(ent.name==='__MACOSX'){res();return}const rd=ent.createReader(),all=[];
   const next=()=>rd.readEntries(es=>{if(!es.length){Promise.all(all.map(x=>readEntry(x,acc))).then(()=>res());return}all.push(...es);next()},()=>res());next();return}
  res()});
}
/* 落とした瞬間（イベントの中）に、受け取れる物を全部つかんでおく。中身を読むのは後でよい */
function grabDrop(dt){
 const jobs=[],items=[...(dt.items||[])].filter(i=>i.kind==='file');
 items.forEach(it=>{
  const en=it.webkitGetAsEntry?it.webkitGetAsEntry():null;
  if(en&&en.isDirectory){let h=null;try{h=it.getAsFileSystemHandle?it.getAsFileSystemHandle():null}catch(e){}jobs.push({dir:en,handle:h})}
  else{const f=it.getAsFile();if(f)jobs.push({file:f})}
 });
 if(!jobs.length)[...(dt.files||[])].forEach(f=>jobs.push({file:f}));
 return jobs;
}
async function readGrab(jobs){
 const acc=[],notes=[];
 for(const j of jobs){
  if(j.file){acc.push(fileItem(j.file));continue}
  const before=acc.length;
  if(j.handle){try{const h=await j.handle;if(h&&h.kind==='directory')await readDirHandle(h,acc)}catch(e){}}
  if(acc.length===before)await readEntry(j.dir,acc);
  if(acc.length===before)notes.push(`フォルダ ${j.dir.name} の中を読めませんでした。zip にまとめて落とすか、中のファイルを押して選んでください`);
 }
 return {acc,notes};
}
const upFile=$id('upFile'),zone=$id('dropZone'),hint=$id('dropHint');
if(upFile){upFile.onchange=()=>takeIn([...upFile.files].map(fileItem))}
if(zone&&upFile){zone.onclick=()=>upFile.click();zone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();upFile.click()}}}
/* ページのどこに落としても入る。落とす間は知らせを出す */
let dragN=0;
const hasFiles=e=>!!e.dataTransfer&&([...(e.dataTransfer.types||[])].includes('Files')||[...(e.dataTransfer.items||[])].some(i=>i.kind==='file'));
document.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();dragN++;if(hint)hint.classList.remove('hide');if(zone)zone.classList.add('over')});
document.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect='copy'});
document.addEventListener('dragleave',e=>{if(!hasFiles(e))return;dragN=Math.max(0,dragN-1);if(!dragN){if(hint)hint.classList.add('hide');if(zone)zone.classList.remove('over')}});
document.addEventListener('drop',async e=>{if(!hasFiles(e))return;e.preventDefault();dragN=0;if(hint)hint.classList.add('hide');if(zone)zone.classList.remove('over');
 const jobs=grabDrop(e.dataTransfer);const r=await readGrab(jobs);takeIn(r.acc,r.notes)});
const clr=$id('upClear');if(clr)clr.onclick=()=>{try{sessionStorage.removeItem(UP_KEY);sessionStorage.removeItem(NOTE_KEY)}catch(e){}location.reload()};
/* このタブで入れた物を試している時に、本番に置く入口を出す。
   本番への入口は GitHub の dict/inbox だけ。押すと inbox の「Upload files」の画面を別のタブで開く（置くのは人。ここからは何も送らない）。
   帯が出ている時は、inbox の検品でも止まるので、押せる形にしない */
const INBOX_UPLOAD='https://github.com/kayame0120-code/programming-dictionary/upload/main/dict/inbox';
function renderUpBar(R){
 const bar=$id('upBar');if(!bar)return;const ups=readUploads(),ok=ups.filter(u=>u.path),bad=ups.filter(u=>!u.path);
 if(!ups.length){bar.classList.add('hide');bar.innerHTML='';return}
 const bands=R?(R.errs||[]).length+(R.refs||[]).length:-1;
 const head=`<b>このタブだけで、入れたファイル ${ok.length}本を試しています</b>（タブを閉じると消えます）`;
 if(bands===0&&!bad.length){
  bar.innerHTML=`<div class="upbar-t">${head}<br>思ったとおりに出たら、本番に置けます。開いた画面に、試した zip を開けず・名前を変えずにドラッグして「Commit changes」を押します。1〜2分たってから inbox を開き直すと、下に結果が出ています</div>`+
   `<a class="upbar-go" href="${INBOX_UPLOAD}" target="_blank" rel="noopener">本番に置く（GitHub の inbox を開く）↗</a>`;
 }else{
  bar.innerHTML=`<div class="upbar-t">${head}<br>${bands<0?'辞書を読み込めていない':bad.length?'使えないファイルがある':'帯が出ている'}ので、このままでは本番に置けません（inbox の検品でも止まります）。直した zip を入れ直してください</div>`;
 }
 bar.classList.remove('hide');
}
/* このタブで入れたファイルの一覧（辞書が読めない時も出す） */
function renderUploads(R){
 const box=$id('upNow');if(!box)return;const ups=readUploads();
 renderUpBar(R);
 if(!ups.length){box.textContent='このタブで入れたファイル：なし（入れた物は、タブを閉じると消えます）'+(R&&R.state&&R.state.local&&(R.state.fromSite||[]).length?'。PCで開いているので、辞書は公開ページから読みました':'');if(clr)clr.classList.add('hide');return}
 if(clr)clr.classList.remove('hide');
 const added=((R&&R.state&&R.state.added)||[]),ok=ups.filter(u=>u.path),bad=ups.filter(u=>!u.path);
 box.innerHTML=`このタブで入れたファイル ${ok.length}本（タブを閉じると消えます）`+
  `<div class="upfiles">${ok.map(u=>`<code>${e2(u.path.replace(/^dict\//,''))}</code>`).join(' ')}</div>`+
  (bad.length?`<div>${bad.map(u=>`<span class="miss">${e2(u.name)}：使えません</span>`).join(' ')}</div>`:'')+
  (R&&R.state&&R.state.emptyIndex?'<div class="note">目次（index.json）が無いので、空の目次を使って読みました</div>':'')+
  (R&&R.state&&R.state.local&&(R.state.fromSite||[]).length?`<div class="note">PCで開いているので、入れていない ${R.state.fromSite.length}本は公開ページから読みました</div>`:'')+
  (added.length&&!(R&&R.state&&R.state.emptyIndex)?`<div class="note">目次に無いファイル ${added.length}本は、目次の最後に足して読みました。GitHubに置く時は index.json にも足してください</div>`:'');
}
(async()=>{
 let notes=[];try{notes=JSON.parse(sessionStorage.getItem(NOTE_KEY)||'[]');sessionStorage.removeItem(NOTE_KEY)}catch(e){}
 try{
  const R=await loadAll(getText,readUploads());
  R.state.fromSite=siteRead.filter(p=>R.state.loaded.includes(p)||p==='dict/index.json');R.state.local=LOCAL;
  R.errs.push(...notes.map(t=>({file:'入れた物',reason:t})));
  renderUploads(R);
  /* 技術の決まりか中身がまだ1本も読めていない時は、画面を動かさずに足りない物を知らせる */
  const D=R.dict;
  if(!D.techs.length||!Array.isArray(D.tags)||!Array.isArray(D.files)){
   const nT=R.state.loaded.filter(x=>/^dict\/tech\//.test(x)).length,nC=R.state.loaded.filter(x=>/^dict\/content\//.test(x)).length;
   const items=[`読めたファイル：技術の決まり（dict/tech/）${nT}本・中身（dict/content/）${nC}本。どちらも1本以上要ります`,'PCで直接開いていて公開ページにつながらない時は、土台（dict/tech/ の base.json・laravel.json など）も一緒に入れてください（前に入れた物は残ります）',...R.errs.map(e=>e.line!=null?`${e.file}・${e.line}行目・${e.reason}`:`${e.file}・${e.reason}`)];
   showBox('<b>辞書のファイルがまだ足りません</b><ul>'+items.map(t=>'<li>'+e2(t)+'</li>').join('')+'</ul>');
   const sb=$id('stateBox'),ss=$id('stateSum');if(sb)sb.open=true;if(ss)ss.textContent='足りません';
   root.DICT_LOAD=R;root.__ready=true;return;
  }
  root.DICT=R.dict;root.DICT_LOAD=R;
  await addScript('js/engine.js');await addScript('js/app.js');
  root.__ready=true;
 }catch(e){
  renderUploads(null);
  showBox('<b>辞書を読み込めませんでした</b><ul><li>'+e2(e.message)+'</li>'+notes.map(t=>'<li>'+e2(t)+'</li>').join('')+'<li>'+(e.picked?'入れたファイルの中に、辞書のJSONがありません。dict/ の中のファイル（または、それをまとめた zip）を入れてください':'PCで直接開いていて、公開ページにもつながらない時は、dict/ を読めません。下の「辞書の状態」の枠に、dict/ の中のファイル（土台の base.json・laravel.json なども含めて。zip・フォルダでも可）をドラッグしてください')+'</li></ul>');
  const sb=$id('stateBox'),ss=$id('stateSum');if(sb)sb.open=true;if(ss)ss.textContent='読めていません';
  root.__ready=true;root.__fatal=String(e.message);
 }
})();
})(typeof window!=='undefined'?window:globalThis);
