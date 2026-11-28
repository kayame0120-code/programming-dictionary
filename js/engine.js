/* ===== ①の道具：読む・照らし合わせる・組み立てる =====
   言語・版・技術の決まりは持たない。決まりは全部、窓口がまとめた辞書（window.DICT）の②から読む */
const DICT=window.DICT;
const LR=l=>(DICT.lang_rules||{})[l]||{};
const LANGS_WITH=k=>Object.keys(DICT.lang_rules||{}).filter(l=>LR(l)[k]);
/* 前提（版・画面の技術）：画面の欄で選ぶ。自動の時は貼った物から見分ける */
let PREMISE={sel:'auto',ver:null,front:null};
const TECHS=()=>DICT.techs||[];
const DEF_TECH=()=>TECHS().find(t=>t.default)||TECHS()[0]||{};
const VER_TECH=()=>TECHS().find(t=>t.versions&&t.versions.length)||null;
const FRONTS=()=>TECHS().filter(t=>t.front);
const FRONT_DEF=()=>FRONTS().find(t=>t.id===DICT.front_default)||FRONTS()[0]||null;
function premiseVersion(){return PREMISE.sel!=='auto'&&PREMISE.ver?PREMISE.ver:(PREMISE.autoVer||null)}
function premiseFront(){return PREMISE.sel!=='auto'&&PREMISE.front?TECHS().find(t=>t.id===PREMISE.front):(PREMISE.autoFront?TECHS().find(t=>t.id===PREMISE.autoFront):FRONT_DEF())}
/* 名前の変え方：②の filters に書いた手順を上から当てる */
function runSteps(v,steps){
 for(const st of steps){
  if('if_empty' in st&&v==='')return st.if_empty;
  if(st.split!=null){let items=v.split(new RegExp(st.split));if(st.trim)items=items.map(x=>x.trim());items=items.filter(Boolean);
   if(st.each)items=items.map(x=>runSteps(x,st.each));if(st.first){v=items[0]||'';continue}v=items.join(st.join==null?', ':st.join);continue}
  if(st.match_all!=null){v=(v.match(new RegExp(st.match_all,'g'))||[]).join(st.join==null?'':st.join);continue}
  if(st.pick){for(const r of st.pick){const re=new RegExp(r.re,r.flags||'');if(re.test(v)){v=v.replace(re,r.to);break}}continue}
  if(st.lookup){const arr=DICT[st.lookup]||[];const it=arr.find(x=>x&&x[st.key||'id']===v);v=it&&it[st.field]!=null?String(it[st.field]):'';continue}
  if(st.re!=null){const re=new RegExp(st.re,st.flags||'');
   if(st.case){const cf=st.case==='upper'?x=>x.toUpperCase():x=>x.toLowerCase();v=v.replace(re,(...a)=>cf(st.group?a[st.group]:a[0]))}
   else v=v.replace(re,st.to);continue}
  if(st.case)v=st.case==='upper'?v.toUpperCase():v.toLowerCase();
 }
 return v;
}
/* ===== 仕組み（プログラムが持つ決まり。中身は DICT から読む） ===== */
const optV=o=>o&&typeof o==='object'?o.v:o;
const plist=s=>String(s||'').split(/\s*[,、]\s*/).filter(Boolean);
function applyF(v,f,ctx){
 v=v==null?'':String(v);
 if(f==='label'){const sl=(ctx.slots||[]).find(s=>s.key===ctx.key);const o=sl&&sl.options&&sl.options.find(o=>optV(o)===v);return o&&o.label?o.label:v}
 if(f.startsWith('words:')){const g=(DICT.words[f.slice(6)]||{});
  const one=r=>{const i=r.indexOf(':');const n=(i<0?r:r.slice(0,i)).trim(),a=i<0?'':r.slice(i+1);return wordFill(wordOf(g,n),a)||r};
  return v.includes('|')?v.split('|').map(one).join('・'):one(v)}
 const st=(DICT.filters||{})[f];
 return st?runSteps(v,st):v;
}
/* 言い換えの表：ぴったり同じ → 形（見出しに《〇〇》を持つ） → * の順に当てる。形の《〇〇》の中身は word_forms に書く */
function wordOf(g,n){
 if(g[n]!==undefined)return {t:g[n],v:{name:n}};
 const forms=DICT.word_forms||{};
 for(const k of Object.keys(g)){
  if(k==='*'||!/《/.test(k))continue;
  const keys=[];
  const re=new RegExp('^'+k.split(/(《[^》]+》)/).map(p=>{const m=p.match(/^《([^》]+)》$/);if(m){keys.push(m[1]);return '('+(forms[m[1]]||'.+?')+')'}return p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}).join('')+'$');
  const mm=String(n).match(re);
  if(mm){const v={name:n};keys.forEach((kk,i)=>v[kk]=mm[i+1]);return {t:g[k],v}}
 }
 if(g['*']!==undefined)return {t:g['*'],v:{name:n}};
 return null;
}
const wordFill=(w,a)=>w?w.t.replace(/《arg》/g,a||'').replace(/《([^》]+)》/g,(m,k)=>w.v[k]!==undefined?w.v[k]:m):null;
const tv=v=>Array.isArray(v)?v.length>0:!!v;
function condOk(c,get){
 if(!c)return true;
 return [].concat(c).every(x=>{let m;
  if(/\|/.test(x)&&!/[=~^!]/.test(x))return x.split('|').some(k=>tv(get(k)));
  if(m=x.match(/^(.+?)\^=(.*)$/))return String(get(m[1])||'').startsWith(m[2]);
  if(m=x.match(/^(.+?)~(.*)$/))return String(get(m[1])||'').includes(m[2]);
  if(m=x.match(/^(.+?)!=(.*)$/))return (get(m[1])||'')!==m[2];
  if(m=x.match(/^(.+?)=(.*)$/))return (get(m[1])||'')===m[2];
  if(x[0]==='!')return !tv(get(x.slice(1)));
  return tv(get(x))});
}
/* 表の形の値（行の並び）は、has:欄（その欄が空でない行）・not:欄（空の行）・is:欄=値 で行を絞り、col:欄（無ければ name）を「, 」でつなぐ */
function fillVal(v,fs,ctx,k){
 if(Array.isArray(v)){let rows=v,col='name';const rest=[];
  fs.forEach(f=>{let m;if(m=f.match(/^has:(.+)$/))rows=rows.filter(r=>r[m[1]]!=null&&String(r[m[1]]).trim()!=='');else if(m=f.match(/^not:(.+)$/))rows=rows.filter(r=>r[m[1]]==null||String(r[m[1]]).trim()==='');else if(m=f.match(/^is:(\w+)=(.*)$/))rows=rows.filter(r=>String(r[m[1]]==null?'':r[m[1]])===m[2]);else if(m=f.match(/^ne:(\w+)=(.*)$/))rows=rows.filter(r=>String(r[m[1]]==null?'':r[m[1]])!==m[2]);else if(m=f.match(/^col:(.+)$/))col=m[1];else rest.push(f)});
  v=rows.map(r=>r[col]==null?'':String(r[col])).filter(Boolean).join(', ');fs=rest}
 v=v==null?'':v;fs.forEach(f=>{v=applyF(v,f,{...ctx,key:k})});
 /* 作業の地図で、値の一覧の値が空の時は、その値の名前をかっこで出す（D28）。表の行の欄（r.〇〇）には使わない */
 if(v===''&&PH&&!/^(r\.|one$|i$)/.test(k)){const p=PH(k);if(p)v=p}
 return v;
}
let PH=null;
function fill(s,get,ctx){return s.replace(/《([^》|]+)((?:\|[^》|]+)*)》/g,(_,k,fs)=>fillVal(get(k),fs.split('|').filter(Boolean),ctx,k))}
function tplLines(tpl,get,ctx){
 const out=[];
 [].concat(tpl||[]).forEach(x=>{
  if(typeof x==='string'){out.push(fill(x,get,ctx));return}
  if(x.each){const v=get(x.each);(Array.isArray(v)?v:plist(v).map(one=>({one,name:one}))).forEach((row,ri)=>{const g=k=>k==='one'?String(row.one!=null?row.one:(row.name||'')):k==='i'?String(ri+1):k.startsWith('r.')?(row[k.slice(2)]==null?'':String(row[k.slice(2)])):get(k);if(condOk(x.if,g))out.push(fill(x.t,g,ctx))});return}
  if(!condOk(x.if,get))return;
  out.push(fill(x.t,get,ctx))});
 return out;
}
const tplText=(tpl,get,ctx)=>tplLines(tpl,get,ctx).join('');
const T=id=>DICT.tags.find(t=>t.id===id);
const F=id=>DICT.files.find(f=>f.id===id);

/* ===== 札の木 → コード ===== */
function flat(ns){return (ns||[]).flatMap(n=>[n,...flat(n.kids),...flat(n.elifs),...flat(n.els)])}
const nodeGet=n=>k=>n.o[k];
const UNCLOSED='閉じ忘れの';
function renderSec(nodes,ind,trs,depth){
 const L=[];
 (nodes||[]).forEach((n,i)=>{
  const t=n.tag&&T(n.tag);
  const prev=i>0&&nodes[i-1].tag?T(nodes[i-1].tag):null;
  if(i>0&&((t&&t.gap)||(prev&&prev.gap)))L.push('');
  if(!t&&n.ph){L.push(ind+n.name);return}
  if(!t){if(n.tool){if(trs)trs.push({tool:true,name:n.name,orig:n.orig,depth});return}
   MISS_TAGS.push(n.name);if(trs)trs.push({miss:true,name:n.name,depth});return}
  const get=nodeGet(n),ctx={slots:t.slots};
  const tr=()=>tplText(t.tr,get,ctx);
  /* 閉じが見つからなかった開きの行：開きの行だけをそのまま出す（閉じは足さない） */
  if(n.unclosed||n.selfclose){
   const op=tplLines(t.open,get,ctx);op.forEach(x=>L.push(ind+x));
   if(trs)trs.push({code:op.join('\n'),tr:tr(),tag:t,depth,orig:n.orig,unclosed:!!n.unclosed});
   L.push(...renderSec(n.kids,ind,trs,depth));
   return;
  }
  if(t.kind==='chain_head'){
   let s=tplText(t.code,get,ctx);const kt=[];
   const multi=(n.kids||[]).some(k=>k.tag&&T(k.tag).kind==='chain_block'),ind2=ind+'    ';
   (n.kids||[]).forEach(k=>{const c=k.tag&&T(k.tag);if(!c){kt.push(k.tool?{tool:true,name:k.name,orig:k.orig,depth:depth+1}:{miss:true,name:k.name,depth:depth+1});return}
    const kc={slots:c.slots},kg=nodeGet(k);
    if(c.kind==='chain_block'){
     const op=tplText(c.open,kg,kc),inTr=[],inner=renderSec(k.kids,ind2+'    ',trs?inTr:null,depth+2);
     s+='\n'+ind2+op+(inner.length?'\n'+inner.join('\n'):'')+'\n'+ind2+tplText(c.close,kg,kc);
     kt.push({code:op,tr:tplText(c.tr,kg,kc),tag:c,depth:depth+1,orig:k.orig,via:k.via},...inTr);return}
    const part=tplText(c.code,kg,kc);s+=(multi?'\n'+ind2:'')+part;kt.push({code:part,tr:tplText(c.tr,kg,kc),tag:c,depth:depth+1,orig:k.orig,via:k.via})});
   L.push(ind+s+';');
   if(trs){trs.push({code:s+';',tr:tr(),tag:t,depth,orig:n.orig,via:n.via,note:n.note});trs.push(...kt)}
   return;
  }
  if(t.kind==='block'||t.kind==='if'){
   const op=tplLines(t.open,get,ctx);
   op.forEach(x=>L.push(ind+x));
   if(trs)trs.push({code:op.join('\n'),tr:tr(),tag:t,depth,orig:n.orig,via:n.via,note:n.note});
   L.push(...renderSec(n.kids,ind+'    ',trs,depth+1));
   /* 分かれる札の後半（elseif …）：何段でも */
   if(t.kind==='if'&&t.elif)(n.elifs||[]).forEach(e=>{const eg=nodeGet(e),ec=tplText(t.elif,eg,ctx);L.push(ind+ec);
    if(trs)trs.push({code:ec,tr:tplText(t.elif_tr||'そうでなければ、もし 《cond》 なら下の処理をする',eg,ctx),tag:t,depth,els:true,orig:e.orig});
    L.push(...renderSec(e.kids,ind+'    ',trs,depth+1))});
   if(t.kind==='if'&&n.els&&n.els.length){L.push(ind+tplText(t.else,get,ctx));if(trs)trs.push({code:tplText(t.else,get,ctx),tr:t.else_tr||'そうでなければ、下の処理をする',tag:t,depth,els:true});L.push(...renderSec(n.els,ind+'    ',trs,depth+1))}
   tplLines(t.close,get,ctx).forEach(x=>L.push(ind+x));
   return;
  }
  const cl=tplLines(t.code,get,ctx);
  cl.forEach(x=>L.push(x?ind+x:''));
  if(trs)trs.push({code:cl.length?cl.join('\n'):tplText(t.show||'',get,ctx),tr:tr(),tag:t,depth,orig:n.orig,via:n.via,note:n.note});
  if(n.kids&&n.kids.length)L.push(...renderSec(n.kids,ind+'    ',trs,depth+1));
 });
 return L;
}
function fileGetter(f,vals,secs){
 return k=>{let m;
  if(m=k.match(/^(\w+):(\w+)(?:@([\w-]+))?$/)){const v=flat(secs[m[1]]).filter(n=>n.tag&&(!m[3]||n.tag===m[3])).map(n=>n.o[m[2]]).filter(Boolean).join(', ');if(v||!PH)return v;const ph=flat(secs[m[1]]).find(n=>n.ph);return ph?ph.name:''}
  return vals[k]==null?'':vals[k]};
}
function tidy(L){
 const out=[];
 L.forEach(l=>{
  if(l.trim()===''){if(!out.length||out[out.length-1].trim()===''||/[{\[(]\s*$/.test(out[out.length-1]))return;out.push('');return}
  if(/^\s*[}\])]/.test(l)&&out.length&&out[out.length-1].trim()==='')out.pop();
  out.push(l)});
 while(out.length&&out[out.length-1].trim()==='')out.pop();
 return out;
}
/* 既存のファイルの一部だけを置き換える種類：置き換える所ごとにコードを作る */
function renderPatches(f,vals,secs,trs){
 return f.patches.map(pt=>{const own=[];const lines=renderFile({...f,patch:false,uses:[],code:pt.code},vals,secs,own);if(trs)trs.push(...own);
  return {label:pt.label,find:pt.find,field:pt.field,lines,trs:own}});
}
function renderFile(f,vals,secs,trs){
 if(f.patch)return renderPatches(f,vals,secs,trs).flatMap((p,i)=>i?['',...p.lines]:p.lines);
 const get=fileGetter(f,vals,secs),ctx={slots:f.fields};
 const uses=new Set(tplLines(f.uses||[],get,ctx).filter(Boolean));
 Object.values(secs).forEach(ns=>flat(ns).forEach(n=>{const t=n.tag&&T(n.tag);if(t&&t.uses)tplLines(t.uses,nodeGet(n),{slots:t.slots}).forEach(u=>u&&uses.add(u))}));
 const L=[];
 f.code.forEach(x=>{
  let s;if(typeof x==='string')s=x;else{if(!condOk(x.if,get))return;s=x.t}
  const m=s.match(/^(\s*)《@(\w+)》\s*$/);
  if(m){if(m[2]==='uses'){[...uses].sort().forEach(u=>L.push(m[1]+u));return}
   L.push(...secLines(f,m[2],secs[m[2]],m[1],trs));return}
  L.push(fill(s,get,ctx));
 });
 return tidy(L);
}
/* 段（セクション）の札を並べる。group のある段は、囲む値の札をまとめて囲む */
function secLines(f,key,ns,ind,trs){
 const sec=f.sections.find(s=>s.key===key),g=sec&&sec.group;
 if(!g)return renderSec(ns,ind,trs,0);
 /* 使える人で分ける：誰でも → そのまま／ログインした人 → まとめて囲む */
 const L=[],gt=T(g.tag);ns=ns||[];
 const free=ns.filter(n=>!(n.o&&n.o[g.slot]===g.on)),inn=ns.filter(n=>n.o&&n.o[g.slot]===g.on);
 L.push(...renderSec(free,ind,trs,0));
 if(inn.length){if(free.length)L.push('');tplLines(gt.open,()=>'',{}).forEach(x=>L.push(ind+x));L.push(...renderSec(inn,ind+'    ',trs,0));tplLines(gt.close,()=>'',{}).forEach(x=>L.push(ind+x))}
 return L;
}
/* ファイル全体で使う use の行（ファイルの uses と、置いた札の uses） */
function usesOf(f,get,secs){
 const uses=new Set(tplLines(f&&f.uses||[],get,{slots:f?f.fields:[]}).filter(Boolean));
 Object.values(secs).forEach(ns=>flat(ns).forEach(n=>{const t=n.tag&&T(n.tag);if(t&&t.uses)tplLines(t.uses,nodeGet(n),{slots:t.slots}).forEach(u=>u&&uses.add(u))}));
 return [...uses].sort();
}

/* ===== メモ ⇄ 札の木 ===== */
const SEP=' / ';
const ELSE_NAMES=()=>DICT.tags.filter(t=>t.else_name).map(t=>t.else_name);
const subTags=id=>{const t=T(id);return [...(t.chains||[]),...(t.inner||[])]};
function secTags(sec){const ids=new Set(sec.tags);const add=id=>subTags(id).forEach(c=>{if(!ids.has(c)){ids.add(c);add(c)}});sec.tags.forEach(add);return [...ids]}
/* メモの名前から札を探す：上の札がつなげる札・中に入れる札 → 段の札 → 段の中の全部、の順 */
function findByName(name,pt,sec,emb){return [...(pt?subTags(pt.id):[]),...sec.tags,...secTags(sec),...(ROLE('use')?[ROLE('use')]:[]),...(emb||[])].find(x=>T(x)&&T(x).name===name)}
function newNode(id,arr){const t=T(id);const o={};t.slots.forEach((s,i)=>{o[s.key]=arr&&arr[i]!==undefined?arr[i]:(s.default==null?'':s.default)});return {tag:id,o,kids:[]}}
/* 選ぶ穴の値：「開く」「get」「開く（get）」のどれで書いても、コードの値にそろえる */
function optNorm(s,v){
 if(!s||!s.options)return v;
 const o=s.options.find(o=>{const ov=optV(o),lb=o&&o.label;return v===ov||(lb&&(v===lb||v===`${lb}（${ov}）`))});
 return o?optV(o):v;
}
const INL='　';
const inlineRe=tg=>new RegExp('^'+tg.slots.map((s,i)=>s.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'：'+(i<tg.slots.length-1?'(.*?)':'(.*)')).join(INL)+'$');
const optShow=(s,v)=>{if(!s||!s.options)return v;const o=s.options.find(o=>optV(o)===v);return o&&o.label?`${o.label}（${v}）`:v};
function parseSecLines(lines,sec,lang){
 const ids=secTags(sec);
 /* 埋め込みの言語の札（Blade の <script> の中の JS など）も、名前で探せるようにする。外の言語の札が先 */
 const emb=embedIdsOf(lang);
 const root={kids:[]},stack=[{n:root,d:-1,key:'kids'}];
 lines.forEach(raw=>{if(!raw.trim())return;
  const d=Math.floor(raw.match(/^ */)[0].length/2),t=raw.trim();
  while(stack.length>1&&stack[stack.length-1].d>=d)stack.pop();
  const top=stack[stack.length-1];
  if(t==='そうでなければ'||ELSE_NAMES().includes(t)){const last=top.n[top.key][top.n[top.key].length-1];if(last){last.els=[];stack.push({n:last,d,key:'els'})}return}
  const i=t.indexOf('：');const name0=(i<0?t:t.slice(0,i)).trim(),rest=i<0?'':t.slice(i+1).replace(/^ /,'');
  /* 分かれる札の後半（「そうでなければ、もし：条件」） */
  const lastSib=top.n[top.key][top.n[top.key].length-1],lt=lastSib&&lastSib.tag&&T(lastSib.tag);
  if(lt&&lt.elif&&name0===(lt.elif_name||'そうでなければ、もし')){const e=newNode(lt.id,[rest]);e.elif=true;(lastSib.elifs=lastSib.elifs||[]).push(e);stack.push({n:e,d,key:'kids'});return}
  /* 閉じ忘れの行（「閉じ忘れの要素：div / …」） */
  const unclosed=name0.startsWith(UNCLOSED),name=unclosed?name0.slice(UNCLOSED.length):name0;
  const pt=top.n.tag&&!top.n.elif?T(top.n.tag):null;
  /* 項目の行（ルートの「URL：/todos」など）は、上の札の穴に入れる */
  if(pt&&pt.memo==='items'){const s=pt.slots.find(s=>s.label===name);if(s){top.n.o[s.key]=optNorm(s,rest.trim());return}}
  /* 1行にラベル付きで並べた札（「カラム：name　値：'仕事'」など） */
  const inl=[...ids,...(pt&&pt.kv?[pt.kv]:[])].map(T).find(tg=>tg.memo==='inline'&&inlineRe(tg).test(t));
  if(inl){const m=t.match(inlineRe(inl));const node=newNode(inl.id,m.slice(1).map((v,k)=>optNorm(inl.slots[k],v.trim())));top.n[top.key].push(node);stack.push({n:node,d,key:'kids'});return}
  const id=findByName(name,pt,sec,emb);
  let node;
  if(id){const tg=T(id),sl=tg.slots;
   if(tg.memo==='items')node=newNode(id,[]);
   else{let arr=rest===''?[]:rest.split(SEP);if(arr.length>sl.length&&sl.length)arr=[...arr.slice(0,sl.length-1),arr.slice(sl.length-1).join(SEP)];node=newNode(id,arr.map((a,k)=>optNorm(sl[k],a)))}}
  /* 「カラム：値」の行（Seederの「name：'仕事'」など）は、上の札が決めた札にする */
  else if(pt&&pt.kv&&i>0)node=newNode(pt.kv,[name,rest]);
  else node={tag:null,name:t,lang,o:{},kids:[]};
  if(unclosed&&node.tag)node.unclosed=true;
  top.n[top.key].push(node);stack.push({n:node,d,key:'kids'});
 });
 return root.kids;
}
function parseFileMemo(v){
 const L=v.replace(/\r/g,'').split('\n');
 const m0=L[0].match(/^\s*【([^】]+)】(.*)$/);if(!m0)return null;
 const f=DICT.files.find(f=>f.name===m0[1]);if(!f)return null;
 const vals={};f.fields.forEach(fd=>{vals[fd.key]=fd.default==null?'':fd.default});
 if(f.head)vals[f.head]=m0[2].trim();
 const secs={};f.sections.forEach(s=>secs[s.key]=[]);
 let cur=null,buf=[];const badHeads=[];let bad=null;const present=new Set();
 const flush=()=>{if(cur)secs[cur.key]=parseSecLines(buf,cur,f.lang);buf=[]};
 L.slice(1).forEach(l=>{const m=l.match(/^\s*【([^】]+)】(.*)$/);
  if(m){flush();present.add(m[1]);const sc=f.sections.find(x=>x.label===m[1]);const fd=f.fields.find(x=>x.label===m[1]);cur=sc||null;bad=null;if(!sc&&fd)vals[fd.key]=optNorm(fd,m[2].trim());if(!sc&&!fd){bad={head:m[1],lines:0};badHeads.push(bad)}}
  else if(cur)buf.push(l);else if(bad&&l.trim())bad.lines++});
 flush();
 return {f,vals,secs,badHeads,present};
}
function memoLines(nodes,d,pt){
 return (nodes||[]).flatMap(n=>{
  const p='  '.repeat(d);
  if(n.tool)return [];
  if(!n.tag)return [p+n.name];
  const t=T(n.tag);
  if(t.memo==='inline')return [p+t.slots.map(s=>s.label+'：'+(n.o[s.key]==null?'':n.o[s.key])).join(INL)];
  const elifs=(n.elifs||[]).flatMap(e=>[p+(t.elif_name||'そうでなければ、もし')+'：'+(e.o.cond||''),...memoLines(e.kids,d+1,t)]);
  const kids=[...memoLines(n.kids,d+1,t),...elifs,...(n.els&&n.els.length?[p+(t.else_name||'そうでなければ'),...memoLines(n.els,d+1,t)]:[])];
  if(t.memo==='items')return [p+t.name,...t.slots.filter(s=>n.o[s.key]!=null&&n.o[s.key]!=='').map(s=>p+'  '+s.label+'：'+optShow(s,n.o[s.key])),...kids];
  const v=t.slots.map(s=>n.o[s.key]==null||n.o[s.key]===''?'':optShow(s,n.o[s.key]));while(v.length&&v[v.length-1]==='')v.pop();
  return [p+(n.unclosed?UNCLOSED:'')+t.name+(v.length?'：'+v.join(SEP):''),...kids]});
}
/* 読めた欄と段だけのメモ（行だけの種類で使う） */
function partMemo(f,r){
 const L=['【'+f.name+'】'+(f.head?r.vals[f.head]||'':'')];
 f.fields.filter(fd=>fd.key!==f.head&&r.fieldOrig[fd.key]).forEach(fd=>L.push('【'+fd.label+'】'+(r.vals[fd.key]?optShow(fd,r.vals[fd.key]):'')));
 f.sections.filter(s=>(r.secs[s.key]||[]).length).forEach(s=>{L.push('【'+s.label+'】',...memoLines(r.secs[s.key],0))});
 return L.length>1?L.join('\n'):'';
}
function fileMemo(f,vals,secs){
 const L=['【'+f.name+'】'+(f.head?vals[f.head]||'':'')];
 f.fields.filter(fd=>fd.key!==f.head).forEach(fd=>L.push('【'+fd.label+'】'+(vals[fd.key]?optShow(fd,vals[fd.key]):'')));
 f.sections.forEach(s=>{L.push('【'+s.label+'】',...memoLines(secs[s.key],0))});
 return L.join('\n');
}

/* ===== コード → 札の木（札のひな形を型紙にする） ===== */
const SET='\u0001';
/* 穴の既定の形：かっこの数が合っている文字の並び。かっこ ( [ { の中だけは行をまたいでよい。
   HOLE は、かっこの外では1行の中だけ。HOLE_ML は、ひな形のかっこの中に置いた穴で使い、行をまたいでよい */
const BR=d=>{const c='[^()\\[\\]{}]',in_=d>0?'|'+BR(d-1):'';return `(?:\\((?:${c}${in_})*\\)|\\[(?:${c}${in_})*\\]|\\{(?:${c}${in_})*\\})`};
const HOLE=`(?:[^()\\[\\]{}\\n]|${BR(3)})*?`;
const HOLE_ML=`(?:[^()\\[\\]{}]|${BR(3)})*?`;
/* PHP の行を左から読み、引用符で囲んだ文字列の中のかっこ（'[' など）を、かっこでない文字に置き換えた写しを作る。
   長さは変えないので、場所はそのまま元のコードに当てはまる。型紙との照合とかっこの数えはこの写しで行い、穴の値は元のコードから取る */
const MASK='';
function maskStr(s,quotes){
 return s.split('\n').map(line=>{let out='',i=0;
  while(i<line.length){const ch=line[i];
   if(quotes.includes(ch)){let j=i+1;while(j<line.length&&line[j]!==ch){if(line[j]==='\\')j++;j++}
    if(j<line.length){out+=ch+line.slice(i+1,j).replace(/[()\[\]{}]/g,MASK)+ch;i=j+1;continue}}
   out+=ch;i++}
  return out}).join('\n');
}
const depthOf=(s,d)=>{for(const ch of s){if('([{'.includes(ch))d++;else if(')]}'.includes(ch))d=Math.max(0,d-1)}return d};
const gk=k=>'g_'+k.replace(/\W/g,'_');
function escFlex(s){
 let r='';
 for(const ch of s){
  if(/\s/.test(ch)){if(!r.endsWith('\\s*'))r+='\\s*';continue}
  const e=ch.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&');
  if(/[(),\[\]{};=>.]/.test(ch))r+=(r.endsWith('\\s*')?'':'\\s*')+e+'\\s*';else r+=e;
 }
 return r;
}
function tplRegex(str,fixed,slots){
 let re='',lit=0,dep=0;const seen=new Set(),keys=[];
 str.split(/(《[^》]+》)/).forEach(p=>{
  const m=p.match(/^《([^》|]+)((?:\|[^》|]+)*)》$/);
  if(m){const k=m[1];
   if(k in fixed){re+=escFlex(fixed[k]);lit+=fixed[k].length;dep=depthOf(fixed[k],dep);return}
   if(seen.has(k)){re+=`\\k<${gk(k)}>`;lit+=1;return}
   seen.add(k);keys.push([k,m[2]]);const sl=(slots||[]).find(x=>x.key===k);re+=`(?<${gk(k)}>${sl&&sl.pattern?sl.pattern:(dep>0?HOLE_ML:HOLE)})`;return}
  re+=escFlex(p);lit+=p.replace(/\s/g,'').length;dep=depthOf(p,dep)});
 re=re.replace(/^(\\s\*)+/,'').replace(/(\\s\*)+$/,'');
 return {re,lit,keys};
}
function cart(arrs){return arrs.reduce((acc,a)=>acc.flatMap(x=>a.map(y=>[...x,y])),[[]])}
function variants(t,key){
 const tpl=[].concat(t[key]||[]);
 const condKeys=new Set();
 tpl.forEach(x=>{if(typeof x==='object')[].concat(x.if||[]).forEach(c=>{const m=c.match(/^!?([^=!~^]+)/);condKeys.add(m[1])})});
 const keys=[...condKeys];
 const doms=keys.map(k=>{const sl=(t.slots||[]).find(s=>s.key===k);return sl&&sl.options?sl.options.map(optV):[SET,'']});
 const out=cart(doms).map(c=>{
  const asg=Object.fromEntries(keys.map((k,i)=>[k,c[i]]));
  const g=k=>asg[k]===undefined?'x':(asg[k]===SET?'x':asg[k]);
  const ls=tpl.filter(x=>typeof x==='string'||condOk(x.if,g)).map(x=>typeof x==='string'?x:x.t);
  const fixed={},set={};keys.forEach(k=>{if(asg[k]!==SET){set[k]=asg[k];if(asg[k]!=='')fixed[k]=asg[k]}});
  return {text:ls.join('\n'),fixed,set,via:false}});
 (key==='code'||key==='open'?(t.reads||[]):[]).forEach(r=>{
  if(typeof r==='string')out.push({text:r,fixed:{},set:{},via:true});
  else if(Array.isArray(r))out.push({text:r.join('\n'),fixed:{},set:{},via:true});
  else out.push({text:[].concat(r.t).join('\n'),fixed:{...(r.set||{})},set:{...(r.set||{})},via:true})});
 return out.filter(v=>v.text.trim());
}
function unf(v,fl){
 v=v==null?'':v;
 const fs=String(fl||'').split('|').filter(Boolean);
 for(const f of fs){const u=(DICT.unfilters||{})[f];if(!u)continue;
  const q=[...v.matchAll(new RegExp(u.items,'g'))].map(m=>m.slice(1).find(x=>x!==undefined));
  return (q.length?q:v.split(',').map(s=>s.trim()).filter(Boolean)).join(u.join)}
 return v.trim();
}
/* コメントを、同じ長さの空白に置き換える。言語が決まっていない時（ファイルの見分けの前）は、全部の言語のコメントの形を当てる */
function stripComments(src,lang){
 let rules;
 if(lang)rules=LR(lang).comments||[];
 else{const seen=new Set();rules=[];LANGS_WITH('comments').forEach(l=>LR(l).comments.forEach(r=>{const k=r.re+'|'+(r.keep||0);if(!seen.has(k)){seen.add(k);rules.push(r)}}))}
 rules.forEach(r=>{src=src.replace(new RegExp(r.re,'g'),(m,...g)=>{if(r.keep){const a=g[r.keep-1]||'';return a+' '.repeat(m.length-a.length)}return m.replace(/[^\n]/g,' ')})});
 return src;
}
function anchorFor(t){return t.kind==='chain_head'?['^[ \\t]*','']:['^[ \\t]*','[ \\t]*$']}
/* 穴の値は、照合に使った写しでなく、元のコードの同じ場所から取る */
const gv=(m,k,orig)=>{const ix=m.indices&&m.indices.groups&&m.indices.groups[gk(k)];return ix?orig.slice(ix[0],ix[1]):m.groups[gk(k)]};
function matchAll(t,key,src,orig=src){
 const res=[];const [a,z]=anchorFor(t);
 variants(t,key).forEach(v=>{
  const R=tplRegex(v.text,v.fixed,t.slots);let re;try{re=new RegExp(a+R.re+z,'gmd')}catch(e){return}
  let m;while((m=re.exec(src))){if(!m[0].trim().length){re.lastIndex++;continue}
   const o={};t.slots.forEach(s=>o[s.key]='');Object.assign(o,v.set);
   R.keys.forEach(([k,fl])=>{o[k]=unf(gv(m,k,orig),fl)});
   const lead=m[0].length-m[0].replace(/^[ \t]*/,'').length;
   /* 穴の中身が行をまたいだか（またいだ物は、1行で当たる物の後に試す） */
   const ml=R.keys.some(([k])=>/\n/.test(gv(m,k,orig)||''))?1:0;
   res.push({tag:t.id,t,start:m.index+lead,end:m.index+m[0].length,o,lit:R.lit,via:v.via,ml,kids:[]})}
 });
 return res;
}
function matchAt(t,src,pos,orig=src,lang){
 let best=null;
 variants(t,t.kind==='chain_block'?'open':'code').forEach(v=>{
  let text=v.text;const ch=LR(lang).chain;if(ch&&new RegExp(ch.after).test(src.slice(0,pos))&&text.startsWith(ch.strip))text=text.slice(ch.strip.length);
  const R=tplRegex(text,v.fixed,t.slots);const re=new RegExp('\\s*'+R.re,'yd');re.lastIndex=pos;const m=re.exec(src);
  if(m&&m[0].trim().length&&(!best||R.lit>best.lit)){const o={};t.slots.forEach(s=>o[s.key]='');Object.assign(o,v.set);R.keys.forEach(([k,fl])=>{o[k]=unf(gv(m,k,orig),fl)});best={tag:t.id,start:pos,end:pos+m[0].length,o,lit:R.lit,via:v.via,kids:[]}}
 });
 return best;
}
/* 閉じる位置を探す：かっこで終わる開きはかっこを数える／それ以外は同じ開きと閉じを数える */
function closeFind(t,x,src,orig=src,R={}){
 const sc=R.self_close,PR=R.pair;
 const get=k=>x.o[k];
 const op=tplText(t.open,get,{}).trimEnd();
 const cl=tplText(t.close,get,{}).trim();
 const el=t.else?tplText(t.else,get,{}).trim():null;
 const last=op.slice(-1);
 const pairs={'{':'}','[':']','(':')'};
 /* 後半（elseif …）の形：決まった書き方と、読むだけの書き方 */
 const elifTpl=t.elif?[t.elif,...(t.elif_reads||[])]:[];
 const elifAt=(pos,cut)=>{for(const e of elifTpl){const R=tplRegex(cut?e.trim().slice(1):e.trim(),{},t.slots);const re=new RegExp('\\s*'+R.re,'yd');re.lastIndex=pos;const m=re.exec(src);
  if(m){const o={};R.keys.forEach(([k,fl])=>o[k]=unf(gv(m,k,orig),fl));return {end:pos+m[0].length,o}}}return null};
 if(pairs[last]&&x.end>0&&src.slice(0,x.end).trimEnd().endsWith(last)){
  const o=last,c=pairs[last];
  const blockEnd=from=>{let d=1,i=from;for(;i<src.length;i++){const ch=src[i];if(ch===o)d++;else if(ch===c){d--;if(d===0)break}}return i<src.length?i:-1};
  const i=blockEnd(x.end);
  if(i<0)return null;
  const r={inner:[x.end,i],elifs:[]};let at=i;
  for(;;){
   const e=elifAt(at+1,true);
   if(e){const j=blockEnd(e.end);if(j<0)break;r.elifs.push({mark:[at,e.end],inner:[e.end,j],o:e.o});at=j;continue}
   if(el){const em=new RegExp('\\s*'+escFlex(el.slice(1)),'y');em.lastIndex=at+1;const mm=em.exec(src);
    if(mm){const s2=at+1+mm[0].length,j=blockEnd(s2);if(j>=0){r.elsR=[s2,j];r.elseMark=[at,s2];at=j}}}
   break;
  }
  const rest=new RegExp('\\s*'+escFlex(cl.slice(1)),'y');rest.lastIndex=at+1;const rm=rest.exec(src);
  r.close=[at,rm?at+1+rm[0].length:at+1];
  return r;
 }
 if(!PR)return null;
 const pm=op.match(new RegExp(PR.head));if(!pm)return null;
 const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\\/]/g,'\\$&');
 const pre=reEsc(pm[0]);
 const ep=elifTpl.length?(elifTpl[0].trim().match(new RegExp(PR.head))||[''])[0]:'';
 /* 同じ言語のほかの囲み（閉じの形が決まっている物）も数える。中の囲みの「そうでなければ」を、外の囲みの物と取り違えないため */
 const txt=x=>[].concat(x||[]).map(c=>typeof c==='string'?c:c.t).join('\n');
 const others=(DICT.tags||[]).filter(o=>o!==t&&o.lang===t.lang&&(o.kind==='if'||o.kind==='block')&&o.close&&!/《/.test(txt(o.close))&&!/《/.test(txt(o.open).split('\n')[0].replace(/\(.*$/,'')))
  .map(o=>({h:((txt(o.open).split('\n')[0].trim().match(new RegExp(PR.head))||[''])[0]),c:txt(o.close).trim()})).filter(o=>o.h&&o.h!==pm[0]&&o.c&&o.c!==cl);
 const oh=new Set(others.map(o=>o.h)),oc=new Set(others.map(o=>o.c));
 const alt=[...oh].map(h=>reEsc(h)+'(?='+PR.after+')').concat([...oc].map(reEsc));
 const tok=new RegExp(`${pre}(?=${PR.after})|${reEsc(cl)}${ep?'|'+reEsc(ep)+'(?='+PR.elif_after+')':''}${el?'|'+reEsc(el)+'(?!'+PR.else_not+')':''}${alt.length?'|'+alt.join('|'):''}`,'g');
 tok.lastIndex=x.end;let d=1,od=0,m;const segs=[{k:'main',a:x.end}];
 while((m=tok.exec(src))){
  if(m[0]===cl){d--;if(d===0){segs[segs.length-1].b=m.index;
   const r={inner:[segs[0].a,segs[0].b],close:[m.index,m.index+m[0].length],elifs:segs.filter(s=>s.k==='elif').map(s=>({mark:s.mark,inner:[s.a,s.b],o:s.o}))};
   const es=segs.find(s=>s.k==='else');if(es){r.elsR=[es.a,es.b];r.elseMark=es.mark}
   return r}}
  else if(ep&&m[0]===ep){if(d===1&&od===0){const e=elifAt(m.index,false);if(e){segs[segs.length-1].b=m.index;segs.push({k:'elif',mark:[m.index,e.end],a:e.end,o:e.o});tok.lastIndex=e.end}}}
  else if(el&&m[0]===el){if(d===1&&od===0){segs[segs.length-1].b=m.index;segs.push({k:'else',mark:[m.index,m.index+m[0].length],a:m.index+m[0].length})}}
  else if(oc.has(m[0])){if(od>0)od--}
  else if(oh.has(m[0])&&m[0]!==pm[0]){od++}
  else{if(sc){const gt=src.indexOf('>',m.index);if(gt>0&&src.slice(m.index,gt+1).replace(/\s+$/,'').endsWith(sc))continue}d++}
 }
 return null;
}
/* かっこと引用符の外にある「,」で分ける */
function splitTop(s){
 const QALL=[...new Set(LANGS_WITH('strings').flatMap(l=>LR(l).strings))];
 const out=[];let d=0,q=null,cur='';
 for(const ch of String(s||'')){
  if(q){cur+=ch;if(ch===q)q=null;continue}
  if(QALL.includes(ch)){q=ch;cur+=ch;continue}
  if('([{'.includes(ch))d++;else if(')]}'.includes(ch))d--;
  if(ch===','&&d===0){if(cur.trim())out.push(cur.trim());cur='';continue}
  cur+=ch}
 if(cur.trim())out.push(cur.trim());
 return out;
}
/* 札の rewrite に従って、古い書き方の札を新しい書き方の札に置き換える */
function rewriteNodes(ns){
 return (ns||[]).flatMap(n=>{
  if(n.kids)n.kids=rewriteNodes(n.kids);
  const t=n.tag&&T(n.tag);
  if(!t||!t.rewrite)return [n];
  const r=t.rewrite,get=nodeGet(n),so={};
  Object.entries(r.slots||{}).forEach(([k,v])=>so[k]=fill(v,get,{}));
  return (n.kids||[]).filter(k=>k.tag===r.rows).map(k=>{
   const nn=newNode(r.to,[]);Object.assign(nn.o,so);nn.via=true;nn.note=r.note;
   const KV=LR(t.lang).pair_kv;nn.kids=!KV?[]:splitTop(k.o[r.pairs]).map(p=>p.match(new RegExp(KV))).filter(m=>m&&!(r.drop||[]).includes(m[1])).map(m=>newNode(r.kv,[m[1],m[2].trim()]));
   return nn});
 });
}
/* コードの中から札を探して、入れ子の木にする。ファイル・メソッド・1行のどれでも、これを使う */
/* forbid：埋め込みの所（[始め, 終わり] の並び）。札の当たった所がそこにかかる物は使わない */
function parseNodes(raw,items,mark,lang,forbid){
 const Q=LR(lang).strings;const src=Q&&Q.length?maskStr(raw,Q):raw;const SC=LR(lang).self_close;
 const found=[];
 items.forEach(({id,sec})=>{const t=T(id);if(!t||t.kind==='chain'||t.kind==='chain_block')return;
  matchAll(t,(t.kind==='block'||t.kind==='if')?'open':'code',src,raw).forEach(x=>{x.sec=sec;found.push(x)})});
 if(forbid&&forbid.length)for(let i=found.length-1;i>=0;i--){const x=found[i];if(forbid.some(([a,b])=>x.start<b&&x.end>a))found.splice(i,1)}
 /* 穴の中身が行をまたいだ物（ml）は、同じ所から始まる囲む札（block・if）が当たる時は使わない（例：Task::create([ … ]) は「保存する（カラムごと）」で読む） */
 const blockAt=new Set(found.filter(x=>!x.ml&&(x.t.kind==='block'||x.t.kind==='if')).map(x=>x.start));
 for(let i=found.length-1;i>=0;i--)if(found[i].ml&&blockAt.has(found[i].start))found.splice(i,1);
 /* 行をまたいだ開きの行（<button … > のように設定が何行も続く物）は、1つのまとまりとして読む。その中に当たった札は使わない */
 const mlOpen=found.filter(x=>(x.t.kind==='block'||x.t.kind==='if')&&/\n/.test(src.slice(x.start,x.end)));
 if(mlOpen.length)for(let i=found.length-1;i>=0;i--){const f=found[i];if(mlOpen.some(y=>y!==f&&f.start>y.start&&f.end<=y.end))found.splice(i,1)}
 found.sort((a,b)=>b.lit-a.lit||a.start-b.start||(b.end-b.start)-(a.end-a.start));
 const taken=[],acc=[];
 const free=(a,b)=>!taken.some(([s,e])=>a<e&&s<b);
 found.forEach(x=>{
  if(!free(x.start,x.end))return;
  if(x.t.kind==='block'||x.t.kind==='if'){
   /* 自分で閉じるタグ（<path … />）は、閉じの要らない物として読む */
   if(SC&&raw.slice(x.start,x.end).replace(/\s+$/,'').endsWith(SC)){x.selfclose=true;taken.push([x.start,x.end]);acc.push(x);return}
   const r=closeFind(x.t,x,src,raw,LR(lang));
   /* 閉じが見つからない開きの行は、閉じ忘れとして残す（辞書にない行にはしない） */
   if(!r){x.unclosed=true;taken.push([x.start,x.end]);acc.push(x);return}
   const marks=[r.close,...(r.elseMark?[r.elseMark]:[]),...(r.elifs||[]).map(e=>e.mark)];
   if(marks.some(mk=>!free(...mk)))return;
   Object.assign(x,r);taken.push(...marks)}
  taken.push([x.start,x.end]);acc.push(x)});
 acc.forEach(x=>{const t=x.t;
  if(t.kind==='chain_head'){const headEnd=x.end;mark(x.start,headEnd);let pos=x.end,multi=false;
   for(;;){let best=null;(t.chains||[]).forEach(cid=>{const r=matchAt(T(cid),src,pos,raw,lang);if(r&&(!best||r.lit>best.lit||(r.lit===best.lit&&r.end>best.end)))best=r});
    if(!best)break;const bt=T(best.tag);best.orig=raw.slice(best.start,best.end).trim();
    /* どれにも当たらない名前を受ける札（catch_all）：Laravel が最初から持っている名前なら「Laravel の道具（まだ辞書に無い）」にする */
    if(bt.catch_all&&(DICT[LR(lang).tool_names]||[]).includes(best.o[bt.catch_all])){mark(best.start,best.end);x.kids.push({tag:null,tool:true,name:best.o[bt.catch_all],orig:best.orig,start:best.start,end:best.end,kids:[]});pos=best.end;continue}
    if(bt.kind==='chain_block'){
     const CL=LR(lang).closure;if(!CL)break;
     let d=1,i=best.end;for(;i<src.length;i++){const ch=src[i];if(ch===CL.open)d++;else if(ch===CL.close){d--;if(d===0)break}}
     if(i>=src.length)break;
     const cm=new RegExp(CL.end,'y');cm.lastIndex=i;const mm=cm.exec(src);if(!mm)break;
     const b0=best.end;best.kids=parseNodes(raw.slice(b0,i),(bt.inner||[]).map(id=>({id,sec:x.sec})),(a,b)=>mark(b0+a,b0+b),lang);
     mark(best.start,best.end);mark(i,i+mm[0].length);best.end=i+mm[0].length;multi=true;
    }else mark(best.start,best.end);
    x.kids.push(best);pos=best.end}
   if(t.absorb)x.kids=x.kids.filter(k=>{const a=k.tag&&t.absorb[k.tag];if(!a)return true;x.o[a.to]=k.o[a.from];if(a.note)x.note=a.note;return false});
   const sm=/\s*;/y;sm.lastIndex=pos;const mm=sm.exec(src);if(mm)mark(pos,pos+mm[0].length);x.end=mm?pos+mm[0].length:pos;
   x.orig=multi?raw.slice(x.start,headEnd).trim()+' …;':raw.slice(x.start,x.end).trim();return}
  x.orig=raw.slice(x.start,x.end).trim();
  mark(x.start,x.end);if(x.close)mark(...x.close);if(x.elseMark)mark(...x.elseMark);
  /* 後半（elseif …）を、同じ札の節にして持たせる */
  if(x.elifs&&x.elifs.length){x._elifR=x.elifs.map(e=>e.inner);x.elifs=x.elifs.map(e=>{mark(...e.mark);const o={};t.slots.forEach(s=>o[s.key]='');Object.assign(o,e.o);return {tag:t.id,o,kids:[],elif:true,orig:raw.slice(...e.mark).trim()}})}
  else delete x.elifs});
 acc.sort((a,b)=>a.start-b.start);
 const holders=acc.filter(x=>x.inner),top=[];
 acc.forEach(x=>{
  let best=null,bestSize=Infinity,where=null;
  const tryR=(b,rg,w)=>{if(rg&&x.start>=rg[0]&&x.end<=rg[1]&&rg[1]-rg[0]<bestSize){best=b;bestSize=rg[1]-rg[0];where=w}};
  holders.forEach(b=>{if(b===x)return;
   tryR(b,b.inner,'kids');tryR(b,b.elsR,'els');(b._elifR||[]).forEach((rg,ei)=>tryR(b,rg,ei))});
  if(best){if(typeof where==='number')best.elifs[where].kids.push(x);else (best[where]=best[where]||[]).push(x)}else top.push(x)});
 return top;
}
/* 読み残しの行を拾う（札にも骨組みにも当たらなかった行） */
function unknownLines(code,src,cov,skel,lang){
 const raw=code.replace(/\r/g,'').split('\n');const unknown=[];let off=0;
 /* 外してよい use は、クラスより前にある物だけ。クラスの中の use（別の部品を借りる行）は辞書にない行に出す */
 const LRx=LR(lang),im=LRx.imports;const classAt=im&&im.class_start?src.split('\n').findIndex(l=>new RegExp(im.class_start).test(l)):-1;
 src.split('\n').forEach((l,li)=>{const o=off;off+=l.length+1;const tr=l.trim();if(!tr)return;
  if((im&&im.skip&&new RegExp(im.skip).test(tr)&&(classAt<0||li<classAt))||(LRx.skip_lines||[]).some(r=>new RegExp(r).test(tr)))return;
  if(skel.some(r=>r.test(l)))return;
  let left='';for(let i=0;i<l.length;i++)if(!cov[o+i])left+=l[i];
  if(left.replace(/[\s{}()\[\];,]/g,'')==='')return;
  unknown.push(raw[li].trim())});
 return unknown;
}
/* ファイルより小さいもの（メソッド・1行）を読む。札の束はファイルと同じものを使う */
function forwardSnippet(code,sec,lang){
 const raw=code.replace(/\r/g,''),src0=stripComments(raw,lang);
 const emb=embedRanges(src0,lang),src=blankEmbeds(src0,emb);
 const cov=new Uint8Array(src.length);const mark=(a,b)=>{for(let i=a;i<b;i++)cov[i]=1};
 const nodes=parseNodes(src,sec.tags.map(id=>({id,sec:sec.key})),mark,lang,emb.map(r=>[r.a,r.b]));
 const notRead=emb.length?readEmbeds(raw,emb,nodes,sec.key,mark):[];
 return {nodes,unknown:unknownLines(code,src0,cov,[],lang),src,lang,notRead};
}
/* ===== ファイルに埋め込んだ別の言語（Blade の <script> の中の JS など） =====
   埋め込みの決まりは、②の lang_rules の embeds（[{open, close, lang}]）に書く。
   ファイルの種類は外のファイルのまま。開き（open）と閉じ（close）の間の行だけを、lang の読み方の決まりと札で読む。
   lang の読み方の決まり（lang_rules）がまだ無い時は、その行を外の言語として読まず、「まだ読めない行」として分けて出す */
function embedRanges(src,lang){
 const out=[];
 (LR(lang).embeds||[]).forEach(e=>{if(!e||!e.open||!e.close||!e.lang)return;let o,c;try{o=new RegExp(e.open,'gi');c=new RegExp(e.close,'gi')}catch(_){return}
  let m;while((m=o.exec(src))){if(!m[0].length){o.lastIndex++;continue}const a=m.index+m[0].length;c.lastIndex=a;const z=c.exec(src);const b=z?z.index:src.length;
   if(!out.some(r=>a<r.b&&r.a<b))out.push({a,b,lang:e.lang});o.lastIndex=z?z.index+z[0].length:src.length}});
 return out.sort((x,y)=>x.a-y.a);
}
const hasRules=lg=>!!(DICT.lang_rules&&DICT.lang_rules[lg]);
/* 埋め込みの言語で読む札：その言語の技術が1行を読む時のファイルの種類の段の札。無ければ、その言語の札の全部 */
function embedTags(lg){const t=TECHS().find(x=>x.lang===lg),s=linesSec(t);if(s)return s.tags;return (DICT.tags||[]).filter(x=>x.lang===lg&&x.kind!=='chain'&&x.kind!=='chain_block').map(x=>x.id)}
/* 外のファイルの言語が埋め込みで使う札（メモを逆向きに読む時に、名前で探す先に足す） */
const embedIdsOf=lang=>(LR(lang).embeds||[]).filter(e=>e&&hasRules(e.lang)).flatMap(e=>embedTags(e.lang));
/* 埋め込みの所を、同じ長さの空白にした写し（外の言語の札と欄は、この写しで読む） */
const blankEmbeds=(src,emb)=>emb.reduce((s,r)=>s.slice(0,r.a)+s.slice(r.a,r.b).replace(/[^\n]/g,' ')+s.slice(r.b),src);
/* 埋め込みの所を読んで、外のファイルの札の木に入れる。読めない所は notRead に分ける */
function readEmbeds(raw,emb,tops,defSec,mark){
 const notRead=[];
 emb.forEach(r=>{
  if(!hasRules(r.lang)){mark(r.a,r.b);const L=raw.slice(r.a,r.b).split('\n').map(l=>l.trim()).filter(Boolean);if(L.length)notRead.push({lang:r.lang,lines:L});return}
  const inner=stripComments(raw.slice(r.a,r.b),r.lang);
  const ns=parseNodes(inner,embedTags(r.lang).map(id=>({id,sec:null})),(x,y)=>mark(r.a+x,r.a+y),r.lang);
  const shift=n=>{if(typeof n.start==='number'){n.start+=r.a;n.end+=r.a}};ns.forEach(shift);
  /* 入れる先：埋め込みの所を中に持つ一番内側の囲みの札（<script> の札など）。無ければ、前にある札と同じ段 */
  ns.forEach(x=>{
   let best=null,size=Infinity,where=null;
   const tryR=(b,rg,w)=>{if(rg&&x.start>=rg[0]&&x.end<=rg[1]&&rg[1]-rg[0]<size){best=b;size=rg[1]-rg[0];where=w}};
   flat(tops).forEach(b=>{if(b===x)return;tryR(b,b.inner,'kids');tryR(b,b.elsR,'els');(b._elifR||[]).forEach((rg,ei)=>tryR(b,rg,ei))});
   if(best){const arr=typeof where==='number'?best.elifs[where].kids:(best[where]=best[where]||[]);arr.push(x);arr.sort((p,q)=>(p.start||0)-(q.start||0));return}
   const prev=tops.filter(t=>t.start<=x.start).pop();x.sec=prev?prev.sec:defSec;tops.push(x);tops.sort((p,q)=>p.start-q.start)});
 });
 return notRead;
}
function forwardFile(f,code){
 const raw=code.replace(/\r/g,'');
 const src0=stripComments(raw,f.lang);
 /* 埋め込みの所は、外の言語では読まない（同じ長さの空白にした写しで、外の札と欄を読む） */
 const emb=embedRanges(src0,f.lang),src=blankEmbeds(src0,emb);
 const cov=new Uint8Array(src.length);const mark=(a,b)=>{for(let i=a;i<b;i++)cov[i]=1};
 const vals={},fieldVia={},fieldOrig={};
 f.fields.forEach(fd=>{vals[fd.key]='';
  if(fd.reads_all){const got=[];(fd.reads||[]).forEach(r=>{const re=new RegExp(r,'gm');let m;while((m=re.exec(src))){got.push(m.groups.v.trim())}});vals[fd.key]=[...new Set(got)].join(', ');return}
  const got=(fd.reads||[]).some((r,ri)=>{const m=new RegExp(r,'m').exec(src);if(!m)return false;
   let v=m.groups.v;if(fd.unfilter)v=unf(v,fd.unfilter);v=v.trim();if(fd.map)v=fd.map[v]!==undefined?fd.map[v]:v;
   vals[fd.key]=v;fieldVia[fd.key]=ri>0;fieldOrig[fd.key]=src.slice(m.index,src.indexOf('\n',m.index)<0?src.length:src.indexOf('\n',m.index)).trim();mark(m.index,m.index+m[0].length);return true});
  /* 読めなかった時の値（absent）がある欄は、その値にする */
  if(fd.reads&&!got&&fd.absent!=null)vals[fd.key]=fd.absent;
  if(!fd.reads&&fd.default!=null)vals[fd.key]=fd.default});
 const items=f.sections.flatMap(sec=>sec.tags.map(id=>({id,sec:sec.key})));
 const secs={};f.sections.forEach(s=>secs[s.key]=[]);
 const tops=parseNodes(src,items,mark,f.lang,emb.map(r=>[r.a,r.b]));
 const notRead=emb.length?readEmbeds(raw,emb,tops,f.sections[0].key,mark):[];
 tops.forEach(x=>secs[x.sec].push(x));
 /* 囲みを項目に変える（ルートの「ログインした人だけ」→ 各ルートの「使える人」）／古い書き方を直す（DB::table → Eloquent） */
 f.sections.forEach(sec=>{
  let ns=secs[sec.key];
  if(sec.group){const g=sec.group;
   ns=ns.flatMap(n=>n.tag===g.tag?(n.kids||[]).map(k=>{if(k.o)k.o[g.slot]=g.on;return k}):[n]);
   ns.forEach(n=>{const t=n.tag&&T(n.tag);const s=t&&t.slots.find(s=>s.key===g.slot);if(s&&!n.o[g.slot])n.o[g.slot]=s.default})}
  secs[sec.key]=rewriteNodes(ns);
 });
 /* 札に結びつかない use の行は、どんなクラスでも入る「use の行」の札（roles.use）にして、最初の段に残す */
 const IM=LR(f.lang).imports,useT=IM&&IM.role?ROLE(IM.role):null;
 if(useT&&T(useT)&&IM.line&&f.sections.length&&(f.code||[]).some(x=>/《@uses》/.test(typeof x==='string'?x:x.t))){
  const have=new Set(usesOf(f,fileGetter(f,vals,secs),secs).map(u=>u.replace(/\s+/g,' ').trim()));
  const sl=src.split('\n'),ca=IM.class_start?sl.findIndex(l=>new RegExp(IM.class_start).test(l)):-1;
  const extra=sl.slice(0,ca<0?sl.length:ca).map(l=>l.match(new RegExp(IM.line))).filter(Boolean).filter(m=>!have.has(fill(IM.show,k=>k==='name'?m[1].replace(/\s+/g,' '):'',{})));
  const k0=f.sections[0].key;secs[k0]=[...extra.map(m=>newNode(useT,[m[1]])),...secs[k0]];
 }
 const skel=[];
 [...(f.code||[]),...(f.patches||[]).flatMap(p=>p.code),...(f.skel_reads||[])].forEach(x=>{const s=typeof x==='string'?x:x.t;if(/《@/.test(s)||!s.trim())return;try{skel.push(new RegExp('^\\s*'+tplRegex(s.trim(),{}).re+'\\s*$'))}catch(e){}});
 /* 読み残しの行は、埋め込みの所も含めて、空白にする前の写し（src0）で拾う */
 const unknown=unknownLines(code,emb.length?src0:src,cov,skel,f.lang);
 return {vals,secs,unknown,fieldVia,fieldOrig,src,notRead};
}
/* 部品の意味（1行の中に含まれていたら説明を足す） */
function partsOf(text,lang,at){
 const out=[];
 (DICT.parts||[]).filter(p=>(!p.lang||p.lang===lang)&&(!p.only||p.only===at)).forEach(p=>{
  const R=tplRegex(p.pattern,{});const re=new RegExp(R.re,'g');let m;
  while((m=re.exec(text))){if(!m[0].length){re.lastIndex++;continue}const o={};R.keys.forEach(([k,fl])=>o[k]=unf(m.groups[gk(k)],fl));out.push({id:p.id,code:p.show?fill(p.show,k=>o[k],{}):m[0].trim(),meaning:fill(p.meaning,k=>o[k],{})})}});
 return out;
}
function detectFile(v){
 v=stripComments(String(v).replace(/\r/g,''));
 let best=null,score=0;
 DICT.files.forEach(f=>{let s=0;
  if((f.marks||[]).some(m=>v.includes(m)))s=f.marks.filter(m=>v.includes(m)).length*10+(f.marks_weight||0);
  if(f.detect&&new RegExp(f.detect,'m').test(v)&&!(f.detect_not&&new RegExp(f.detect_not,'m').test(v)))s=Math.max(s,f.detect_weight||5);
  if(s>0&&s>score){best=f;score=s}});
 return best;
}
const LANG=l=>(DICT.langs||{})[l]||l;
function detectFileMemo(v){const m=v.match(/^\s*【([^】]+)】/);if(!m)return null;return DICT.files.find(f=>f.name===m[1])||null}

/* ===== メソッド・1行の大きさで使う決まり（札の束はファイルと同じものを使う） ===== */
/* 役の札（メソッド・取り出し始め など）と、1行・メソッドを読む時に使うファイルの種類は、辞書の roles（②）に書く */
const ROLE=k=>(DICT.roles||{})[k];
/* 1行・メソッドを読む時の技術：②の looks（見分けの目印）が当たる技術。前提で画面の技術を選んでいる時は、それを先に試す */
const linesSec=t=>t&&t.lines_file&&F(t.lines_file)?F(t.lines_file).sections[0]:null;
function linesTech(v){
 const pf=PREMISE.sel!=='auto'&&PREMISE.front?TECHS().find(t=>t.id===PREMISE.front):null;
 const order=TECHS().filter(t=>t.looks).sort((a,b)=>(b.priority||0)-(a.priority||0));
 if(pf&&pf.looks){order.splice(order.indexOf(pf),1);order.unshift(pf)}
 for(const t of order)if(new RegExp(t.looks,'m').test(v))return t;
 return DEF_TECH();
}
function methodTech(v){const t=linesTech(v);return LR(t.lang).method?t:(TECHS().find(x=>x.method_lang)||DEF_TECH())}
const snippetSec=v=>linesSec(linesTech(v));

/* 戻り値：返す札（returns を持つ札）を、出てくる順に全部「／」でつなぐ（if の中も含む） */
const RET_SEP=' ／ ';
const retTags=()=>DICT.tags.filter(t=>t.returns);
function retsOf(kids){
 return flat(kids).filter(n=>n.tag&&T(n.tag).returns).map(n=>{const t=T(n.tag),g=nodeGet(n),c={slots:t.slots};return {form:tplText(t.returns.form,g,c),desc:tplText(t.returns.desc||t.returns.form,g,c)}});
}
function retOf(kids){const r=retsOf(kids);return {form:r.map(x=>x.form).join(RET_SEP),desc:r.map(x=>x.desc).join(RET_SEP)}}
/* まとめ：札の sum（まとめの言葉）を、出てくる順に「、」でつなぐ。つなぐ札は後ろの札の言葉を先に置く */
function sumOf(n){const t=n.tag&&T(n.tag);if(!t)return '';const own=t.sum?tplText(t.sum,nodeGet(n),{slots:t.slots}):'';
 if(t.kind==='chain_head')return [...new Set((n.kids||[]).map(sumOf).filter(Boolean))].join('')+own;
 return own}
const methodSum=n=>[...new Set((n.kids||[]).map(sumOf).filter(Boolean))].join('、');

/* メソッドのメモ */
function methodMemo(n){
 return ['【メソッド】'+n.o.name,'引数：'+(n.o.arg||''),'戻り値：'+retOf(n.kids).form,'まとめ：'+methodSum(n),'札：',...memoLines(n.kids,0,T(ROLE('method')))].join('\n');
}
/* メソッドの説明：いつ動くか・引数・戻り値・前提の条件・流れ・押さえる点 */
function methodInfo(n){
 const all=flat(n.kids),words=(DICT.words.args||{});
 const fields=all.filter(x=>x.tag===ROLE('request_get')).map(x=>x.o.field);
 /* 引数は1つずつ言い換える（ぴったり同じ → 形 → *） */
 const argWord=splitTop(n.o.arg).map(a=>wordFill(wordOf(words,a))||'').filter(Boolean).join('、');
 const conds=all.filter(x=>x.tag&&T(x.tag).cond_note).map(x=>({text:tplText(T(x.tag).tr,nodeGet(x),{slots:T(x.tag).slots}),id:x.tag}));
 const seen=new Set(),points=[];
 all.forEach(x=>{const t=x.tag&&T(x.tag);if(!t||!t.point)return;const p=tplText(t.point,nodeGet(x),{slots:t.slots});if(p&&!seen.has(p)){seen.add(p);points.push({text:p,id:t.id})}});
 return {
  when:tplText('《name|words:method》',k=>n.o[k],{}),sum:methodSum(n),
  args:n.o.arg?n.o.arg+(argWord?'：'+argWord:'')+(fields.length?'。'+fields.join('・')+' が入っている':''):'なし',
  ret:retOf(n.kids).desc,conds,points,
  flow:(n.kids||[]).filter(x=>x.tag).map(x=>tplText(T(x.tag).tr,nodeGet(x),{slots:T(x.tag).slots}))};
}
/* メソッドを貼った時：コードから札の木を作る。見つかったメソッドは全部、順に出す */
function forwardMethod(code){
 const mt=methodTech(code);const r=forwardSnippet(code,linesSec(mt),mt.lang);
 const methods=r.nodes.filter(n=>n.tag===ROLE('method'));
 return {...r,node:methods[0],methods};
}
/* 戻り値のメモから、返す札を作る（札の中に返す札が無い時だけ）。「／」で区切った物は1つずつ作る */
function ensureReturn(node,form){
 if(!form||retsOf(node.kids).length)return;
 form.split(/\s*／\s*/).filter(Boolean).forEach(one=>{
  for(const t of retTags()){const pat=t.returns.pattern||{};const R=tplRegex(t.returns.form,{},t.slots.map(s=>({...s,pattern:pat[s.key]||s.pattern})));const m=new RegExp('^'+R.re+'$').exec(one.trim());
   if(m){const nn=newNode(t.id,[]);R.keys.forEach(([k])=>nn.o[k]=m.groups[gk(k)].trim());node.kids.push(nn);return}}});
}
/* 意味の文から、キーワードで札を拾う。つなぐ札は「取り出し始め」の後ろにまとめる */
function keywordNodes(v){
 const found=DICT.tags.filter(t=>t.k).map(t=>({t,pos:Math.min(...t.k.map(k=>{const i=v.indexOf(k);return i<0?1e9:i}))})).filter(x=>x.pos<1e9).sort((a,b)=>a.pos-b.pos);
 const out=[];let chain=null;
 found.forEach(({t})=>{const n=newNode(t.id,[]);(t.start||[]).forEach(s=>n.kids.push(newNode(s.tag,s.values)));
  if(t.kind==='chain'){if(!chain){chain=newNode(ROLE('query'),[]);out.push(chain)}chain.kids.push(n)}else{chain=null;out.push(n)}});
 return out;
}
const guessName=nodes=>{const ids=new Set(flat(nodes).map(n=>n.tag));const g=(DICT.name_guess||[]).find(x=>x.tag==='*'||ids.has(x.tag));return g?g.method:'index'};
const guessArg=nodes=>{const ids=new Set(flat(nodes).map(n=>n.tag));return (DICT.arg_guess||[]).filter(g=>g.tags.some(t=>ids.has(t))).map(g=>g.arg).join(', ')};
/* メソッドのメモ（【メソッド】の段）を読む。札：が無い時は、まとめの文からキーワードで拾う */
function parseMethodMemo(v){
 return v.replace(/\r/g,'').split(/^【メソッド】/m).slice(1).map(b=>{
  const lines=b.split('\n'),name=lines[0].trim();
  const get=k=>{const m=b.match(new RegExp('^'+k+'[：:][ \\t]*(.*)$','m'));return m?m[1].trim():''};
  const ti=lines.findIndex(l=>/^札[：:]/.test(l.trim()));
  const kids=ti<0?keywordNodes(get('まとめ')):parseSecLines(lines.slice(ti+1).filter(l=>!/^【/.test(l)),linesSec(methodTech('')),methodTech('').lang);
  const node={tag:ROLE('method'),o:{name:name||guessName(kids),arg:get('引数'),ret:''},kids};
  ensureReturn(node,get('戻り値'));
  return node;
 });
}
/* 普通の文（メモの形でない）からメソッドを作る */
function sentenceMethod(v){
 const kids=keywordNodes(v);if(!kids.length)return null;
 return {tag:ROLE('method'),o:{name:guessName(kids),arg:guessArg(kids),ret:''},kids};
}
/* 1行（いくつかの行）を貼った時 */
function forwardLines(code){const t=linesTech(code);return forwardSnippet(code,linesSec(t),t.lang)}

