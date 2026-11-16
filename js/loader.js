/* ===== 窓口：辞書のファイルを読み、1つの辞書にまとめてから、画面のプログラムを動かす =====
   読む順：目次（dict/index.json）→ ②技術の決まり（tech）→ ③中身（content）→ 修正（fixes/fix-001.json から番号順）
   壊れたファイル・名前で呼んだ先が無い所は、飛ばしたうえで、消せない帯で知らせる */
(function(root){
'use strict';
const isObj=x=>x&&typeof x==='object'&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
function jsonErrorLine(text,e){const m=String(e&&e.message||'').match(/position (\d+)/);if(!m)return 1;return text.slice(0,+m[1]).split('\n').length}

/* 中身を足し合わせる：並びはつなぐ・表は欄ごとに重ねる（2段まで）・ほかは後のファイルで置き換える */
function mergeInto(d,src,origin,seen,errs,layerOf){
 for(const [k,v] of Object.entries(src)){
  if(['format','layer','tech','label','note'].includes(k))continue;
  if(Array.isArray(v)){
   d[k]=d[k]||[];
   v.forEach(it=>{
    if(isObj(it)&&it.id!=null){const key=k+'\u0000'+it.id;
     if(seen[key]){errs.push({file:origin,reason:`同じ名前の項目が2つある：${k} の ${it.id}（先に ${seen[key]} で読んだ）。後の方を飛ばしました`});return}
     seen[key]=origin;layerOf[key]=src.layer}
    d[k].push(clone(it))});
  }else if(isObj(v)){
   d[k]=d[k]||{};
   for(const [k2,v2] of Object.entries(v)){
    if(isObj(v2)&&isObj(d[k][k2]))d[k][k2]={...d[k][k2],...clone(v2)};else d[k][k2]=clone(v2)}
  }else d[k]=v;
 }
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
  for(const [k,v] of Object.entries(x)){if(k==='slots')continue;if(typeof v==='object')walk(v,who)}
 };
 (d.tags||[]).forEach(t=>{
  [...(t.chains||[]),...(t.inner||[])].forEach(c=>{if(!tagIds.has(c))say('札',c,`札 ${t.id}`)});
  (t.start||[]).forEach(s=>{if(s.tag&&!tagIds.has(s.tag))say('札',s.tag,`札 ${t.id}`)});
  if(t.rewrite)['to','kv','rows'].forEach(k=>{if(t.rewrite[k]&&!tagIds.has(t.rewrite[k]))say('札',t.rewrite[k],`札 ${t.id}`)});
  (t.in||[]).forEach(p=>{if(!fileIds.has(p.file))say('ファイルの種類',p.file,`札 ${t.id}`)});
 });
 Object.entries(d.pieces||{}).forEach(([k,v])=>walk(v,`部品のまとまり ${k}`));
 (d.steps||[]).forEach(s=>walk(s.do||[],`手順 ${s.id}`));
 (d.examples||[]).forEach(e=>(e.steps||[]).forEach(id=>{if(!stepIds.has(id))say('手順',id,`例文 ${e.id}`)}));
 Object.entries(d.roles||{}).forEach(([k,v])=>{if(!tagIds.has(v)&&!fileIds.has(v))say('札',v,`役 ${k}`)});
 (d.techs||[]).forEach(t=>{if(t.lines_file&&!fileIds.has(t.lines_file))say('ファイルの種類',t.lines_file,`技術 ${t.name}`)});
 /* どこからも使われない札：どの段にも入っていない（in が無い）うえに、ほかの札・役・手順などからも呼ばれていない */
 const used=new Set();
 (d.tags||[]).forEach(t=>{[...(t.chains||[]),...(t.inner||[])].forEach(c=>used.add(c));(t.start||[]).forEach(s=>s&&s.tag&&used.add(s.tag));
  if(t.rewrite)['to','kv','rows'].forEach(k=>t.rewrite[k]&&used.add(t.rewrite[k]))});
 Object.values(d.roles||{}).forEach(v=>used.add(v));
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
 Object.entries(who).forEach(([lg,ws])=>out.push({id:lg,text:`言語 ${lg} の読み方の決まり（lang_rules）がありません。${ws.slice(0,3).join('・')}${ws.length>3?` ほか${ws.length-3}件`:''}が使っています。この言語のコードは正しく読めません`}));
 const seen=new Set();return out.filter(x=>{const k=x.text;if(seen.has(k))return false;seen.add(k);return true});
}

/* 読んだ文字の束から辞書を作る（画面なしでも使える） */
function build(index,files,fixFiles){
 const d={techs:[],format:index.format},errs=[],seen={},layerOf={},removed={},loaded=[],applied=[];
 const fmt=index.format;
 const parse=(f)=>{if(f.text==null){errs.push({file:f.path,reason:'ファイルが見つからない'});return null}
  try{return JSON.parse(f.text)}catch(e){errs.push({file:f.path,line:jsonErrorLine(f.text,e),reason:'JSONとして読めない'});return null}};
 const techFiles=files.filter(f=>f.layer==='tech'),contentFiles=files.filter(f=>f.layer==='content');
 techFiles.forEach(f=>{const j=parse(f);if(!j)return;
  if(j.format!==fmt){errs.push({file:f.path,reason:`format ${j.format} が目次の format ${fmt} と違う（作り直しが要る）`});return}
  j.layer='tech';if(j.tech)d.techs.push(clone(j.tech));mergeInto(d,j,f.path,seen,errs,layerOf);loaded.push(f.path)});
 const techIds=new Set(d.techs.map(t=>t.id));
 contentFiles.forEach(f=>{const j=parse(f);if(!j)return;
  if(j.format!==fmt){errs.push({file:f.path,reason:`format ${j.format} が目次の format ${fmt} と違う（作り直しが要る）`});return}
  if(j.tech&&!techIds.has(j.tech)){errs.push({file:f.path,reason:`${f.path} の技術（${j.label||j.tech}）が目次にありません。このファイルは読んでいません`,orphan:true});return}
  j.layer='content';mergeInto(d,j,f.path,seen,errs,layerOf);loaded.push(f.path)});
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
 (d.files||[]).forEach(f=>(f.sections||[]).forEach(sec=>{
  const list=[];(d.tags||[]).forEach((t,ti)=>(t.in||[]).forEach(p=>{if(p.file===f.id&&p.sec===sec.key)list.push([t.id,typeof p.n==='number'?p.n:Infinity,ti])}));
  sec.tags=list.sort((a,b)=>a[1]-b[1]||a[2]-b[2]).map(x=>x[0])}));
 const refs=refCheck(d,removed);
 const state={loaded,applied,last:applied.length?applied[applied.length-1].replace(/^.*\//,'').replace(/\.json$/,''):''};
 return {dict:d,errs,refs,state,removed};
}

/* 画面で選んだJSONの置き場所を、ファイルの頭の印から決める（dict/ に置いた時と同じ場所） */
function placeUpload(name,text){
 let j;try{j=JSON.parse(text)}catch(e){return {name,reason:`JSONとして読めない（${jsonErrorLine(text,e)}行目）`}}
 if(!isObj(j))return {name,reason:'JSONの形が辞書のファイルではない'};
 if(Array.isArray(j.tech)&&Array.isArray(j.content))return {name,path:'dict/index.json',text};
 if(j.layer==='tech')return {name,path:'dict/tech/'+name,text};
 if(j.layer==='content')return {name,path:'dict/content/'+name,text};
 if(Array.isArray(j.items)){if(!/^fix-\d{3}\.json$/.test(name))return {name,reason:'修正ファイルには fix-001.json のように番号3桁の名前を付ける'};return {name,path:'dict/fixes/'+name,text}}
 return {name,reason:'技術の決まり（layer: tech）・中身（layer: content）・修正（items）・目次（index.json）のどれか分からない。ファイルの頭に layer を書く'};
}

async function loadAll(getText,uploads){
 uploads=uploads||[];
 const up={};uploads.forEach(u=>{if(u.path)up[u.path]=u.text});
 const fromSite=getText;
 const get=async p=>p in up?up[p]:await fromSite(p);
 const upErrs=uploads.filter(u=>u.reason).map(u=>({file:'選んだファイル '+u.name,reason:u.reason}));
 const idxText=await get('dict/index.json');
 if(idxText==null){const e=new Error('dict/index.json が読めません');e.picked=uploads.length;throw e}
 let index;try{index=JSON.parse(idxText)}catch(e){throw new Error('dict/index.json が JSON として読めません（'+jsonErrorLine(idxText,e)+'行目）')}
 /* 選んだファイルのうち目次に無い物は、目次の最後に足した時と同じに読む */
 const added=[];
 index={...index,tech:[...(index.tech||[])],content:[...(index.content||[])]};
 uploads.forEach(u=>{if(!u.path)return;const m=u.path.match(/^dict\/(tech|content)\/(.+)$/);if(!m)return;const rel=m[1]+'/'+m[2];
  if(!index[m[1]].includes(rel)){index[m[1]].push(rel);added.push('dict/'+rel)}});
 getText=get;
 const files=[];
 for(const p of index.tech||[])files.push({path:'dict/'+p,layer:'tech',text:await getText('dict/'+p)});
 for(const p of index.content||[])files.push({path:'dict/'+p,layer:'content',text:await getText('dict/'+p)});
 const fixes=[];
 for(let n=1;n<1000;n++){const p=`dict/fixes/fix-${String(n).padStart(3,'0')}.json`;const t=await getText(p);if(t==null)break;fixes.push({path:p,text:t})}
 const R=build(index,files,fixes);
 R.errs.push(...upErrs);
 R.state.uploaded=uploads.filter(u=>u.path).map(u=>u.path);R.state.added=added;
 return R;
}

if(typeof module!=='undefined'&&module.exports){module.exports={build,loadAll,placeUpload};return}

/* ---- 画面での動き ---- */
const getText=async p=>{try{const r=await fetch(p,{cache:'no-store'});if(!r.ok)return null;return await r.text()}catch(e){return null}};
/* 画面のプログラムを読む。1枚に詰めたHTMLでは、同じ名前で中に入れてある物を使う */
const addScript=src=>new Promise((ok,ng)=>{
 const inl=document.querySelector('script[type="text/x-dict-src"][data-src="'+src+'"]');
 const s=document.createElement('script');
 if(inl){s.textContent=inl.textContent;document.body.appendChild(s);ok();return}
 s.src=src;s.onload=ok;s.onerror=()=>ng(new Error(src+' が読めません'));document.body.appendChild(s)});
/* 選んだJSONは、このタブの中に残す（再読み込みしても残り、タブを閉じると消える） */
const UP_KEY='dict-uploads';
const readUploads=()=>{try{return JSON.parse(sessionStorage.getItem(UP_KEY)||'[]')}catch(e){return []}};
const upBtn=document.getElementById('upBtn'),upFile=document.getElementById('upFile');
if(upBtn&&upFile){
 upBtn.onclick=()=>upFile.click();
 upFile.onchange=async()=>{
  const picked=await Promise.all([...upFile.files].map(async f=>placeUpload(f.name,await f.text())));
  /* 同じ置き場所の物は新しい方に入れ替える。使えなかったファイルは、同じ名前を選び直したら外す */
  const keep=readUploads().filter(u=>!picked.some(p=>(u.path&&p.path===u.path)||(!u.path&&p.name===u.name)));
  try{sessionStorage.setItem(UP_KEY,JSON.stringify([...keep,...picked]))}
  catch(e){const box=document.getElementById('dictErr');if(box){box.innerHTML='<b>選んだファイルが大きすぎて、このタブに残せませんでした</b>';box.classList.remove('hide')}return}
  location.reload();
 };
}
(async()=>{
 try{
  const R=await loadAll(getText,readUploads());
  /* 技術の決まりか中身がまだ1本も読めていない時は、画面を動かさずに足りない物を知らせる */
  const D=R.dict;
  if(!D.techs.length||!Array.isArray(D.tags)||!Array.isArray(D.files)){
   const e2=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
   const box=document.getElementById('dictErr');
   const nT=R.state.loaded.filter(x=>/^dict\/tech\//.test(x)).length,nC=R.state.loaded.filter(x=>/^dict\/content\//.test(x)).length;
   const items=[`読めたファイル：技術の決まり（dict/tech/）${nT}本・中身（dict/content/）${nC}本。どちらも1本以上要ります`,'PCで直接開いている時は、続けて dict/tech/ と dict/content/ の中のファイルも選んでください（前に選んだ物は残ります）',...R.errs.map(e=>e.line!=null?`${e.file}・${e.line}行目・${e.reason}`:`${e.file}・${e.reason}`)];
   if(box){box.innerHTML='<b>辞書のファイルがまだ足りません</b><ul>'+items.map(t=>'<li>'+e2(t)+'</li>').join('')+'</ul>';box.classList.remove('hide')}
   const sb=document.getElementById('stateBox'),ss=document.getElementById('stateSum');if(sb)sb.open=true;if(ss)ss.textContent='足りません';
   root.DICT_LOAD=R;root.__ready=true;return;
  }
  root.DICT=R.dict;root.DICT_LOAD=R;
  await addScript('js/engine.js');await addScript('js/app.js');
  root.__ready=true;
 }catch(e){
  const box=document.getElementById('dictErr');
  const e2=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  if(box){box.innerHTML='<b>辞書を読み込めませんでした</b><ul><li>'+e2(e.message)+'</li><li>'+(e.picked?'選んだファイルの中に index.json（目次）がありません。dict/ の中のファイルを、index.json も含めて全部選んでください':'PCに保存したHTMLを直接開いた時は、ブラウザが dict/ を読ませてくれません。下の「辞書の状態」の「JSONを選んで入れる」から、dict/ の中のファイルを全部選んでください')+'</li></ul>';box.classList.remove('hide')}
  const sb=document.getElementById('stateBox'),ss=document.getElementById('stateSum');if(sb)sb.open=true;if(ss)ss.textContent='読めていません';
  root.__ready=true;root.__fatal=String(e.message);
 }
})();
})(typeof window!=='undefined'?window:globalThis);
