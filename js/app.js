/* ===== 画面 ===== */
const $=s=>document.querySelector(s);
const inp=$('#in'),out=$('#out'),judge=$('#judge'),steps=$('#featSteps');
let tab='code',override='auto',errSource=null,errOv=null,missing=[],picked=null;
try{missing=JSON.parse(localStorage.getItem('dict-missing')||'[]')}catch(e){}
/* 未登録の1件ごとに、どのタブで出たかを覚える（書き出したファイルで、JSON2か3か・どの束かを決める手がかりにする） */
const TAB_NAME={code:'コードの読み取り',feat:'機能解説',err:'エラー'};
let missingFrom={};try{missingFrom=JSON.parse(localStorage.getItem('dict-missing-from')||'{}')||{}}catch(e){}
const saveMissing=()=>{try{localStorage.setItem('dict-missing',JSON.stringify(missing));localStorage.setItem('dict-missing-from',JSON.stringify(missingFrom))}catch(e){}};

const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const idb=s=>`<span class="id">${esc(s)}</span>`;
const cmd=(c,d)=>`<div class="cmd"><div class="cmdb"><button class="copy cc" data-cmd="${esc(c)}">コピー</button><pre class="cmd-c">${esc(c)}</pre></div>${d?`<p class="cmd-d">${esc(d)}</p>`:''}</div>`;
const codeBlock=c=>`<div class="codeb"><button class="copy cc" data-cmd="${esc(c)}">コピー</button><pre>${esc(c)}</pre></div>`;
const where=s=>s===DICT.error_any?s+'出る':s+'で出る';
const circled=n=>'①②③④⑤⑥⑦⑧⑨⑩'[n-1]||String(n);

const BROKEN=()=>!!(window.DICT_LOAD&&(DICT_LOAD.refs.length||DICT_LOAD.errs.some(e=>e.orphan)));
function addMissing(s){
 if(BROKEN())return;
 s=String(s).trim();if(!s||missing.includes(s))return;
 missing.push(s);missingFrom[s]=TAB_NAME[tab]||'不明';saveMissing();
 renderMissing();
}
function renderMissing(){
 $('#missN').textContent=missing.length;
 $('#missList').innerHTML=(BROKEN()?'<li class="miss">辞書の作りに誤りがあるので、直すまで未登録の一覧に足しません（上の帯を見てください）</li>':'')+(missing.map(m=>`<li><code>${esc(m)}</code> <span class="mfrom">${esc(missingFrom[m]||'不明')}</span></li>`).join('')||'<li style="color:var(--sub)">まだありません</li>');
}
/* 辞書にない行の中の ->〇〇( のうち、Laravel が最初から持っている名前に印を付ける */
const toolNote=l=>LANGS_WITH('call').flatMap(lg=>{const R=LR(lg);return [...new Set([...String(l).matchAll(new RegExp(R.call,'g'))].map(m=>m[1]).filter(n=>(DICT[R.tool_names]||[]).includes(n)))].map(n=>`\n ・${fill(R.call_show||'《name》',k=>k==='name'?n:'',{})} → ${R.tool_label}（まだ辞書に無い）`)}).join('');
const TOOL=()=>(LANGS_WITH('tool_label').map(l=>LR(l).tool_label)[0]||'道具');
const missHtml=(lines,note)=>lines.map(l=>`<pre>${esc(l)}\n ↑ <span class="miss">この行は辞書にありません</span>${esc(toolNote(l))}</pre>`).join('')+`<p class="note">${note||'未登録の一覧に残しました。'}</p>`;
/* 閉じが見つからない開きの行（閉じ忘れ）。辞書にない行とは別の欄に出し、未登録の一覧には入れない */
const unclosedOf=nodes=>flat(nodes).filter(n=>n.unclosed);
const unclosedHtml=nodes=>{const u=unclosedOf(nodes);return u.length?`<h3>閉じが見つからない行</h3>${u.map(n=>`<pre>${esc(n.orig||'')}\n ↑ <span class="miss">閉じが見つかりません（閉じ忘れかも）</span></pre>`).join('')}<p class="note">この行は未登録の一覧には入れません。メモには「${UNCLOSED}〇〇」で残し、完成コードには開きの行をそのまま出します。</p>`:''};
/* つなぎの中で見つけた「Laravel の道具（まだ辞書に無い）」を未登録の一覧に入れる */
const addTools=nodes=>flat(nodes).filter(n=>n.tool).forEach(n=>addMissing(`${n.orig}（${TOOL()}・まだ辞書に無い）`));
const fromMark=t=>t&&t.from?`【${t.from}】`:'';

/* ---------- 訳の並び ---------- */
function trHtml(trs,lang,noParts){
 return `<ul class="trl ft">${trs.map(x=>{
  const pad=`style="--d:${x.depth*18}px"`;
  if(x.miss)return `<li ${pad}><span class="miss">${esc(x.name)}（辞書にない札）</span></li>`;
  if(x.tool)return `<li ${pad}><code>${esc(x.orig||x.name)}</code> → <span class="miss">${esc(TOOL())} ${esc(x.name)}（まだ辞書に無い）</span></li>`;
  const shown=x.els?(x.orig||x.code):(x.orig||x.code);
  const alt=x.unclosed?`<span class="alt"><span class="miss">閉じが見つかりません（閉じ忘れかも）</span></span>`:x.note?`<span class="alt">${esc(x.note)}</span>`:x.via?`<span class="alt">${esc(DICT.via_label||'')}<code>${esc(x.code)}</code></span>`:'';
  /* 埋め込みの言語の札（Blade の <script> の中の JS など）は、その言語の部品と、外のファイルの言語の部品（@json など）の両方を見る */
  const pts=x.els||noParts?[]:(x.tag.lang&&x.tag.lang!==lang?[...partsOf(shown,x.tag.lang,'file'),...partsOf(shown,lang,'file')].filter((p,i,a)=>a.findIndex(q=>q.id===p.id&&q.code===p.code)===i):partsOf(shown,lang,'file'));
  return `<li ${pad}><code>${esc(shown)}</code> → ${esc(x.tr)}【${esc(x.tag.name)}】${fromMark(x.tag)}${idb(x.tag.id)}${alt}${pts.map(p=>`<span class="pt">・<code>${esc(p.code)}</code> → ${esc(p.meaning)}${idb(p.id)}</span>`).join('')}</li>`}).join('')}</ul>`;
}
function fieldTr(f,vals,via){
 const get=k=>vals[k];
 return f.fields.filter(fd=>fd.tr).map(fd=>{
  return `<li>【${esc(fd.label)}】${esc(tplText(fd.tr,get,{slots:f.fields}))}${via&&via[fd.key]?viaNote(f,fd,get):''}</li>`}).join('');
}
/* 2番目からの読み方で読んだ欄に添える一言（欄の via_note に書く） */
const viaNote=(f,fd,get)=>fd.via_note?`<span class="alt">${esc(tplText(fd.via_note.t,get,{slots:f.fields}))}${fd.via_note.code?` <code>${esc(tplText(fd.via_note.code,get,{slots:f.fields}))}</code>`:''}</span>`:'';

/* ---------- 穴を埋める欄（札の木の全部） ---------- */
function slotsHtml(slots,o,pre){
 return `<div class="slots">${slots.map(s=>{const v=o[s.key]==null?'':o[s.key];
  /* 選ぶ穴に、選び肢に無い値（読めない決まりなど）が入っている時は、その値を選び肢に足して残す。ほかの値に置き換えない */
  const keep=s.options&&v!==''&&!s.options.some(op=>optV(op)===v)?`<option value="${esc(v)}" selected>元の行のまま：${esc(v)}</option>`:'';
  if(s.options)return `<label class="slot"><span>${esc(s.label)}</span><select data-k="${pre}${s.key}">${keep}${s.options.map(op=>{const ov=optV(op);return `<option value="${esc(ov)}"${ov===v?' selected':''}>${esc(op&&op.label?op.label+'（'+ov+'）':ov)}</option>`}).join('')}</select></label>`;
  return `<label class="slot"><span>${esc(s.label)}</span><input data-k="${pre}${s.key}" value="${esc(v)}"></label>`}).join('')}</div>`;
}
let boxN=0;
function nodeBoxes(nodes,d){
 const H=[];
 (nodes||[]).forEach(n=>{
  const i=boxN++;n._i=i;
  if(!n.tag){addMissing(n.name);H.push(`<div class="tagbox" style="margin-left:${d*14}px"><span class="miss">${esc(n.name)}（辞書にない札）</span></div>`);return}
  const t=T(n.tag);
  H.push(`<div class="tagbox" style="margin-left:${d*14}px"><div class="vh">${n.unclosed?UNCLOSED:''}${esc(t.name)}${idb(t.id)}</div>${t.slots.length?slotsHtml(t.slots,n.o,`n${i}.`):''}</div>`);
  H.push(nodeBoxes(n.kids,d+1));
  (n.elifs||[]).forEach(e=>{const ei=boxN++;e._i=ei;H.push(`<div class="tagbox" style="margin-left:${d*14}px"><div class="vh">${esc(t.elif_name||'そうでなければ、もし')}</div>${slotsHtml(t.slots,e.o,`n${ei}.`)}</div>`);H.push(nodeBoxes(e.kids,d+1))});
  if(n.els&&n.els.length){H.push(`<div class="vh" style="margin-left:${d*14}px">${esc(t.else_name||'そうでなければ')}</div>`);H.push(nodeBoxes(n.els,d+1))}});
 return H.join('');
}
function readBoxes(root,nodes){flat(nodes).forEach(n=>{if(n._i===undefined)return;root.querySelectorAll(`[data-k^="n${n._i}."]`).forEach(i=>{n.o[i.dataset.k.split('.')[1]]=i.value.trim()})})}
const onEdit=(root,fn)=>root.querySelectorAll('.slots input,.slots select').forEach(i=>{i.oninput=fn;i.onchange=fn});

/* ---------- ファイル：正向き ---------- */
function head(f,vals,secs){
 const get=fileGetter(f,vals,secs);
 const p=tplText(f.path,get,{slots:f.fields}),c=f.cmd?tplText(f.cmd,get,{slots:f.fields}):'';
 return `<p class="note" style="margin:0">${esc(f.name)}のファイル${idb(f.id)}</p>
<h3>ファイル：${esc(p)}</h3>${c?cmd(c,'このファイルを作るコマンド'):''}
<p style="margin:6px 0 0;font-size:14px">${esc(tplText(f.summary,get,{slots:f.fields}))}</p>${f.patch?'<p class="note" style="margin:4px 0 0">ファイル全体は作り直しません。ほかの行はそのまま残します。</p>':''}`;
}
function linesView(f,r){
 const get=k=>r.vals[k];
 const fl=f.fields.filter(fd=>fd.tr&&r.fieldOrig[fd.key]).map(fd=>`<li><code>${esc(r.fieldOrig[fd.key])}</code> → ${esc(tplText(fd.tr,get,{slots:f.fields}))}【${esc(fd.label)}】${r.fieldVia[fd.key]?viaNote(f,fd,get):''}</li>`).join('');
 const trs=[];f.sections.forEach(sec=>renderSec(r.secs[sec.key],'',trs,0));
 const opens=(f.patches||[]).filter(p=>p.code.length>1&&!/《/.test(p.code[0])&&r.src.includes(p.code[0])).map(p=>`<li><code>${esc(p.code[0])} … ${esc(p.code[p.code.length-1])}</code> → ここから閉じるまでが「${esc(p.label)}」の並び</li>`).join('');
 return `<p class="note" style="margin:0">${esc(f.name)}${idb(f.id)}</p>
<p style="margin:6px 0 0;font-size:14px">${esc(f.path)} の中の行。1行〜数行ずつ貼って読みます（ファイルごとは貼らない）</p>
<h3>1行ごとの訳</h3><ul class="trl ft">${fl}${opens}</ul>${trs.length?trHtml(trs,f.lang):''}`+
 (r.unknown.length?`<h3>辞書にない行</h3>${missHtml(r.unknown)}`:'');
}
/* 埋め込みの所（Blade の <script> の中など）のうち、その言語の読み方の決まりがまだ無くて読んでいない行。未登録の一覧には入れない */
function notReadHtml(nr,lang){
 const O=LANG(lang);
 return (nr||[]).map(x=>`<h3>${esc(LANG(x.lang))} の行（まだ読めません）</h3><pre>${esc(x.lines.join('\n'))}</pre><p class="note">${esc(O)}の中に埋め込んだ ${esc(LANG(x.lang))} です。${esc(O)}として読まず、${esc(LANG(x.lang))} として読む所です。土台（dict/tech/）に ${esc(LANG(x.lang))} の読み方の決まりが無いので、まだ読んでいません。未登録の一覧には入れません。メモと完成コードには入りません。</p>`).join('');
}
function forwardView(f,v){
 const r=forwardFile(f,v);
 r.unknown.forEach(addMissing);
 const all=Object.values(r.secs).flat();addTools(all);
 if(f.lines_only){const memo=partMemo(f,r);out.innerHTML=linesView(f,r)+(memo?`<h3>メモ（逆向きに貼ると、置き換える所ごとの形が出る）</h3>${codeBlock(memo)}`:'')+unclosedHtml(all);return}
 const memo=fileMemo(f,r.vals,r.secs);
 const trs=[];renderFile(f,r.vals,r.secs,trs);
 out.innerHTML=head(f,r.vals,r.secs)+
 `<h3>メモ（逆向きに貼ると、このファイルに戻る）</h3>${codeBlock(memo)}
<h3>読み方</h3><ul class="trl ft">${fieldTr(f,r.vals,r.fieldVia)}</ul>${trHtml(trs,f.lang)}`+
 unclosedHtml(all)+
 (r.unknown.length?`<h3>辞書にない行</h3>${missHtml(r.unknown,'未登録の一覧に残しました。メモと完成コードには入りません。')}`:'')+
 notReadHtml(r.notRead,f.lang)+
 (LR(f.lang).css?cssFromScreenHtml(v.replace(/\r/g,'').split('\n'),all,f.lang):'');
}

/* ---------- ファイル：逆向き ---------- */
/* 一部だけ置き換える種類：置き換える所ごとに、コードとその行の訳を出す */
function patchHtml(f,vals,secs,present){
 const get=k=>vals[k];
 const on=p=>{if(!present||!present.size)return true;const fd=p.field&&f.fields.find(x=>x.key===p.field);if(fd)return present.has(fd.label);const sk=(String(p.lines&&p.code||'')).match(/《@(\w+)》/);
  const pt=(f.patches||[]).find(x=>x.label===p.label),key=pt&&[].concat(pt.code).map(c=>typeof c==='string'?c:c.t).join('\n').match(/《@(\w+)》/);const sec=key&&f.sections.find(x=>x.key===key[1]);return sec?present.has(sec.label):true};
 return renderPatches(f,vals,secs).filter(on).map((p,i)=>{
  const fd=p.field&&f.fields.find(x=>x.key===p.field);
  const ftr=fd&&fd.tr?`<ul class="trl ft"><li><code>${esc(p.lines.join(' '))}</code> → ${esc(tplText(fd.tr,get,{slots:f.fields}))}【${esc(fd.label)}】</li></ul>`:'';
  return `<div class="vstep"><div class="vh">置き換え${i+1}：${esc(p.label)}</div><p class="note" style="margin:2px 0">${esc(f.path)} の中の ${esc(p.find)} を探して、この形に置き換える</p>${codeBlock(p.lines.join('\n'))}${ftr}${p.trs.length?trHtml(p.trs,f.lang):''}</div>`}).join('');
}
function reverseView(f,v){
 const p=parseFileMemo(v);
 if(!p||p.f!==f){out.innerHTML='<p><span class="miss">メモの1行目が、このファイルの種類ではありません</span></p>';return}
 const {vals,secs,present}=p;
 const warn=(p.badHeads||[]).map(h=>{addMissing('【'+h.head+'】（'+f.name+'にない見出し）');return `<p><span class="miss">【${esc(h.head)}】は${esc(f.name)}にない見出しです。下の${h.lines}行は読んでいません</span>（使える見出し：${f.sections.map(x=>'【'+esc(x.label)+'】').join('')}）</p>`}).join('');
 boxN=0;
 const boxes=f.sections.map(sec=>`<div class="sechd">【${esc(sec.label)}】</div>`+nodeBoxes(secs[sec.key],0)).join('');
 const all=Object.values(secs).flat();
 out.innerHTML=`<p class="note" style="margin:0">${esc(f.name)}の完成コード${idb(f.id)}</p>${warn}<h3>穴を埋める</h3>
${f.fields.length?`<div class="tagbox"><div class="vh">ファイル全体</div>${slotsHtml(f.fields,vals,'f.')}</div>`:''}${boxes}
<div id="rfo"></div>`;
 const upd=()=>{
  out.querySelectorAll('[data-k^="f."]').forEach(i=>vals[i.dataset.k.slice(2)]=i.value.trim());
  readBoxes(out,all);
  MISS_TAGS=[];const trs=[];const code=renderFile(f,vals,secs,trs).join('\n');
  out.querySelector('#rfo').innerHTML=`<h3>完成</h3>`+head(f,vals,secs)+(f.patch?patchHtml(f,vals,secs,present):codeBlock(code)+`<h3>1行ごとの訳</h3><ul class="trl ft">${fieldTr(f,vals)}</ul>${trHtml(trs,f.lang)}`)+missTagHtml()+(LR(f.lang).css?cssFromScreenHtml(code.split('\n'),all,f.lang):'');
 };
 onEdit(out,upd);upd();
}

/* ---------- 1行：正向き ---------- */
function lineView(v){
 const r=forwardLines(v);r.unknown.forEach(addMissing);addTools(r.nodes);
 if(!r.nodes.length){const nr=notReadHtml(r.notRead,r.lang);return nr?(r.unknown.length?missHtml(r.unknown):'')+nr:missHtml(r.unknown)}
 const trs=[];renderSec(r.nodes,'',trs,0);
 const top=trs.filter(x=>x.depth===0&&!x.miss&&!x.tool),inner=trs.filter(x=>x.depth>0||x.miss||x.tool);
 const parts=[];top.forEach(x=>partsOf(x.orig||x.code,r.lang,'line').forEach(p=>{if(!parts.some(q=>q.id===p.id&&q.code===p.code))parts.push(p)}));
 return top.map(x=>`<pre>${esc(x.orig||x.code)}\n ↑ ${esc(x.tr)}${esc(fromMark(x.tag))}${x.unclosed?'（閉じが見つかりません。閉じ忘れかも）':''}</pre>`).join('')+
  (inner.length?`<h3>中の行</h3>${trHtml(inner,r.lang)}`:'')+
  (parts.length?`<h3>部品ごとの意味</h3><ul>${parts.map(p=>`<li><code>${esc(p.code)}</code> → ${esc(p.meaning)}${idb(p.id)}</li>`).join('')}</ul>`:'')+
  unclosedHtml(r.nodes)+
  (r.unknown.length?`<h3>辞書にない行</h3>${missHtml(r.unknown)}`:'')+
  notReadHtml(r.notRead,r.lang);
}

/* ---------- メソッド：正向き ---------- */
function methodView(v){
 const r=forwardMethod(v);
 if(!r.node)return lineView(v);
 r.unknown.forEach(addMissing);addTools(r.methods);
 const one=n=>{const info=methodInfo(n);
  const trs=[];renderSec([n],'',trs,0);
  const flow=info.flow.map((t,i,a)=>(i===0?'まず、':i===a.length-1?'最後に、':'次に、')+t+'。').join('');
  return `<h3>まとめ</h3><p>${esc(info.when)}に動く処理。${esc(info.sum)}${info.sum?'。':''}${idb('words.method:'+n.o.name)}</p>
<table class="kv"><tr><th>引数</th><td>${n.o.arg?`<code>${esc(n.o.arg)}</code>`:''}${esc(info.args.slice(n.o.arg.length))}</td></tr>
<tr><th>戻り値</th><td>${esc(info.ret||'なし')}</td></tr></table>
${info.conds.length?`<h3>前提の条件</h3><ul>${info.conds.map(c=>`<li>${esc(c.text)}${idb(c.id)}</li>`).join('')}</ul>`:''}
<h3>流れ</h3><p>${esc(flow)}</p>
${info.points.length?`<h3>押さえる点</h3><ul>${info.points.map(p=>`<li>${esc(p.text)}${idb(p.id)}</li>`).join('')}</ul>`:''}
<details class="inner"><summary>1行ごとの対応</summary>${trHtml(trs,methodTech(v).lang,true)}</details>`};
 /* メソッドが2つ以上の時は、メソッドごとに区切って全部出す。メモは【メソッド】ごとに並べる */
 const body=r.methods.length>1?r.methods.map((n,i)=>`<div class="mbox"><p class="sh">メソッド${i+1}：${esc(n.o.name)}</p>${one(n)}</div>`).join(''):one(r.node);
 return body+`<h3>メモ（逆向きに貼ると、このメソッドに戻る）</h3>${codeBlock(r.methods.map(methodMemo).join('\n\n'))}`+
 unclosedHtml(r.methods)+
 (r.unknown.length?`<h3>辞書にない行</h3>${missHtml(r.unknown)}`:'');
}

/* ---------- 1行：逆向き ---------- */
function rlineView(v){
 const c=DICT.tags.filter(t=>t.k).map(t=>({t,n:t.k.filter(k=>v.includes(k)).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n).slice(0,5).map(x=>x.t);
 if(!c.length){addMissing(v);return '<p><span class="miss">近いコードの形がありません</span></p><p class="note">未登録の一覧に残しました。</p>'}
 const mk=t=>{const n=newNode(t.id,[]);(t.start||[]).forEach(s=>n.kids.push(newNode(s.tag,s.values)));return n};
 setTimeout(()=>{
  const draw=()=>{const t=c[+out.querySelector('input[name=rc]:checked').value],n=mk(t);
   boxN=0;out.querySelector('#rvf').innerHTML=n.kids.length?nodeBoxes([n],0):(n._i=boxN++,slotsHtml(t.slots,n.o,'n0.'));
   const upd=()=>{readBoxes(out,[n]);const trs=[];const L=renderSec([n],'',trs,0);
    out.querySelector('#rvo').innerHTML=codeBlock(L.join('\n'))+(n.kids.length?`<h3>1行ごとの訳</h3>${trHtml(trs,t.lang,true)}`:`<p class="tr">↑ ${esc(trs[0].tr)}${idb(t.id)}</p>`)};
   onEdit(out.querySelector('#rvf'),upd);upd()};
  out.querySelectorAll('input[name=rc]').forEach(r=>r.onchange=draw);draw()},0);
 return `<h3>近い形（一致が多い順）</h3><div class="cand">${c.map((t,i)=>`<label><input type="radio" name="rc" value="${i}" ${i?'':'checked'}> ${esc(t.name)}<small>${esc(renderSec([mk(t)],'',null,0).join(' ').replace(/\s+/g,' ').trim())}</small></label>`).join('')}</div>
<h3>穴を埋める</h3><div id="rvf"></div><h3>完成</h3><div id="rvo"></div>`;
}

/* ---------- メソッド：逆向き ---------- */
function rmethodView(v){
 const ms=/^\s*【メソッド】/m.test(v)?parseMethodMemo(v):[sentenceMethod(v)].filter(Boolean);
 if(!ms.length){addMissing(v);return '<p><span class="miss">役割の札が見つかりません</span></p><p class="note">未登録の一覧に残しました。</p>'}
 setTimeout(()=>build(),0);
 function build(){
  boxN=0;
  out.querySelector('#rmb').innerHTML=ms.map((m,mi)=>`<div class="mbox"><div class="slots">
<label class="slot"><span>メソッドの名前</span><input data-m="${mi}.name" value="${esc(m.o.name)}"></label>
<label class="slot"><span>引数</span><input data-m="${mi}.arg" value="${esc(m.o.arg)}"></label>
<label class="slot"><span>戻り値（${esc([...new Set(retTags().map(t=>t.returns.hint).filter(Boolean))].join('／'))}）</span><input data-m="${mi}.ret" value="${esc(retOf(m.kids).form)}"></label></div>
${nodeBoxes(m.kids,0)}</div>`).join('');
  const upd=()=>{ms.forEach((m,mi)=>{const g=k=>{const i=out.querySelector(`input[data-m="${mi}.${k}"]`);return i?i.value.trim():''};m.o.name=g('name')||'index';m.o.arg=g('arg');readBoxes(out,m.kids)});
   MISS_TAGS=[];const trs=[];const code=ms.map(m=>renderSec([m],'',trs,0).join('\n')).join('\n\n');
   out.querySelector('#rmo').innerHTML=codeBlock(code)+missTagHtml()+`<h3>1行ごとの訳</h3>${trHtml(trs.filter(x=>!(x.tag&&x.tag.id===ROLE('method'))).map(x=>({...x,depth:0})),methodTech('').lang,true)}`};
  onEdit(out.querySelector('#rmb'),upd);
  out.querySelectorAll('input[data-m]').forEach(i=>{if(i.dataset.m.endsWith('.ret'))i.onchange=()=>{if(i.dataset.done)return;i.dataset.done='1';const m=ms[+i.dataset.m.split('.')[0]];readBoxes(out,m.kids);
   m.kids=m.kids.filter(n=>!(n.tag&&T(n.tag).returns));ensureReturn(m,i.value);setTimeout(build,0)};else i.oninput=upd});
  upd();
 }
 return `<h3>拾った役割の札</h3>${ms.flatMap(m=>flat(m.kids)).filter(n=>n.tag).map(n=>`<span class="chip">${esc(T(n.tag).name)}</span>`).join('')}
<h3>穴を埋める</h3><div id="rmb"></div><h3>完成</h3><div id="rmo"></div>`;
}

/* ---------- コードの読み取り：見分ける係 ---------- */
function detectCode(v){
 const fm=detectFileMemo(v);if(fm)return 'r:'+fm.id;
 if(/^\s*【/m.test(v))return 'rmethod';
 const codeLike=LANGS_WITH('code_marks').some(l=>LR(l).code_marks.some(r=>new RegExp(r,'m').test(v)));
 if(!codeLike){const n=DICT.tags.filter(t=>t.k&&t.k.some(k=>v.includes(k))).length;return n>=2?'rmethod':'rline'}
 const f=detectFile(v);if(f)return 'f:'+f.id;
 {const mt=methodTech(v),mr=LR(mt.lang).method;if(mr&&new RegExp(mr).test(v))return 'method'}
 return 'line';
}
const MODE={line:'1行',method:'メソッド'};
DICT.files.forEach(f=>{MODE['f:'+f.id]=f.lines_only?f.name:'ファイル（'+f.name+'）'});
Object.assign(MODE,{rline:'1行（逆向き）',rmethod:'メソッド（逆向き）'});
DICT.files.forEach(f=>{MODE['r:'+f.id]=(f.lines_only?f.name:'ファイル（'+f.name+'）')+'（逆向き）'});
function runCode(v){
 const auto=detectCode(v),m=override==='auto'?auto:override;
 const fileOf=m.includes(':')?DICT.files.find(f=>f.id===m.slice(2)):null;
 const lang=m.startsWith('r')?'日本語':LANG(fileOf?fileOf.lang:linesTech(v).lang);
 judge.innerHTML=`<span><b>${lang}・${MODE[m]}</b>として読みました${override==='auto'?'':'（手で変更）'}</span>
 <span>読み方を変える <select id="ov"><option value="auto">自動（${MODE[auto]}）</option>${Object.keys(MODE).map(k=>`<option value="${k}">${MODE[k]}</option>`).join('')}</select></span>`;
 $('#ov').value=override;$('#ov').onchange=e=>{override=e.target.value;run()};
 if(m.startsWith('f:')){forwardView(fileOf,v);return}
 if(m.startsWith('r:')){reverseView(fileOf,v);return}
 out.innerHTML={line:lineView,method:methodView,rline:rlineView,rmethod:rmethodView}[m](v);
}

/* ---------- エラー ---------- */
function hits(w,text){const L=text.split('\n'),has=x=>new RegExp(x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');
 if(w.type==='has_all')return L.some(l=>w.words.every(x=>has(x).test(l)));
 if(w.type==='has')return w.words.some(x=>has(x).test(text));
 if(w.type==='lacks')return !w.words.some(x=>has(x).test(text));
 return false}
/* 見分ける文字が当たるエラーのうち、見分ける文字が一番長い（詳しい）物を選ぶ */
/* 見分ける文字は、行き先の見分けと同じく、大文字と小文字を区別しない */
function errPick(v){const lv=String(v).toLowerCase();return (DICT.errors||[]).filter(e=>e&&e.match&&lv.includes(String(e.match).toLowerCase())).sort((a,b)=>b.match.length-a.match.length)[0]||null}
/* 貼ったエラー文から部品を抜き出す。取れなかった部品は「（部品の名前）」にする */
function errParts(e,v){const o={};(e.extract||[]).forEach(x=>{let m=null;try{m=new RegExp(x.re).exec(v)}catch(_){}o[x.key]=m&&m.groups&&m.groups.v?m.groups.v:'（'+x.label+'）'});return o}
function runErr(v){
 const e=errPick(v);
 if(e){
  const parts=errParts(e,v),g=k=>parts[k]!==undefined?parts[k]:'（'+k+'）',F2=s=>fill(String(s==null?'':s),g,{});
  const src=errOv||e.source;
  judge.innerHTML=`<span><b>${esc(where(src))}エラー</b>として読みました（${errOv?'手で変更':`<code>${esc(e.found_by||e.match)}</code> で判定`}）</span>
  <span>読み方を変える <select id="ov">${(DICT.error_sources||[]).map(s=>`<option${s===src?' selected':''}>${esc(s)}</option>`).join('')}</select></span>`;
  /* 選び直すと、判定と出どころの表示だけが変わる。未登録の一覧は増やさない */
  $('#ov').onchange=ev=>{errOv=ev.target.value;run()};
  const causes=e.causes.map(c=>typeof c==='string'?{text:c}:c);
  out.innerHTML=`<p style="margin:0 0 6px">出どころ：${esc(where(src))}エラー${idb(e.id)}</p>
<h3>何が起きたか</h3><ol>${e.happened.map(h=>`<li>${esc(F2(h))}</li>`).join('')}</ol>
<p><b>止まった工程：</b>${circled(e.stopped.step)}（${esc(F2(e.stopped.at))}）。${esc(F2(e.stopped.note))}</p>
<h3>原因の候補（可能性が高い順）</h3><ol class="causes">${causes.map((c,k)=>`<li data-k="${k+1}">${esc(F2(c.text))} <span class="st">残っている</span><div class="why hide">なぜ出たか：${esc(F2(c.why||''))}</div></li>`).join('')}</ol>
<h3>確かめる手順</h3><p class="note">コマンドを実行して、出た結果を下の欄に貼ると、当てはまる行き先が光ります。</p>
${e.steps.map((s,i)=>`<div class="vstep" data-i="${i}"><div class="vh">手順${i+1}<span class="now-l"></span></div>${cmd(F2(s.cmd),F2(s.desc))}
<div class="vres"><textarea class="res" rows="3" placeholder="結果をここに貼る" aria-label="手順${i+1}の結果"></textarea><button class="copy none">何も出なかった</button></div>
${s.branches.map((b,j)=>`<div class="branch" data-j="${j}">${esc(F2(b.text))}</div>`).join('')}</div>`).join('')}`;
  const st=e.steps.map(()=>({t:'',empty:false}));
  const hitOf=(i,j)=>{const w=e.steps[i].branches[j].when,s=st[i];const ww={...w,words:(w.words||[]).map(F2)};return s.empty?w.type==='empty':(!!s.t.trim()&&w.type!=='empty'&&hits(ww,s.t))};
  /* 光った行き先をたどる：手順〇へ → その手順へ／確定・辞書の外 → そこで止まる。消えた候補・確定した候補を出す */
  const refresh=()=>{
   let cur=0,stop=-1,kind=null,conf=0;const drop=new Set(),seen=new Set();
   while(cur>=0&&cur<e.steps.length&&!seen.has(cur)){seen.add(cur);
    const j=e.steps[cur].branches.findIndex((b,jj)=>hitOf(cur,jj));if(j<0)break;
    const b=e.steps[cur].branches[j];(b.drops||[]).forEach(d=>drop.add(d));
    if(b.go==='step'){cur=b.step-1;continue}
    stop=cur;kind=b.go;if(b.go==='cause')conf=b.cause;break}
   out.querySelectorAll('.vstep').forEach(el=>{const i=+el.dataset.i;
    el.querySelectorAll('.branch').forEach((bd,j)=>bd.classList.toggle('hit',hitOf(i,j)));
    el.classList.toggle('now',stop<0&&i===cur);el.classList.toggle('stop',i===stop);
    el.querySelector('.now-l').textContent=stop<0&&i===cur?'　← 今やる手順':i===stop?(kind==='cause'?'　ここで止まりました（確定）':'　ここで止まりました（辞書の外）'):''});
   out.querySelectorAll('.causes li').forEach(li=>{const k=+li.dataset.k;
    const s=conf?(k===conf?'確定':'消えた'):kind==='outside'?'消えた':drop.has(k)?'消えた':'残っている';
    li.querySelector('.st').textContent=s;li.querySelector('.st').className='st st-'+({'確定':'ok','消えた':'gone','残っている':'left'}[s]);
    li.querySelector('.why').classList.toggle('hide',s!=='確定')})};
  out.querySelectorAll('.vstep').forEach(el=>{
   const i=+el.dataset.i,ta=el.querySelector('.res');
   const judgeStep=empty=>{st[i]={t:ta.value,empty};refresh()};
   ta.addEventListener('input',()=>judgeStep(false));
   ta.addEventListener('paste',()=>setTimeout(()=>judgeStep(false),0));
   el.querySelector('.none').onclick=()=>{ta.value='';judgeStep(true)};
  });
  refresh();
  return;
 }
 if(!errSource){
  judge.innerHTML=`<div class="ask">出どころが判定できませんでした。どこで出ましたか？<br>${(DICT.error_sources||[]).filter(s=>s!==DICT.error_any).map(s=>`<button data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  judge.querySelectorAll('button').forEach(b=>b.onclick=()=>{errSource=b.dataset.s;run()});
  out.innerHTML='<div class="empty">出どころを選ぶと結果が出ます</div>';return;
 }
 judge.innerHTML=`<span><b>${esc(errSource)}</b>のエラーとして読みました（手で選択）</span>`;
 addMissing('['+errSource+'] '+v.split('\n')[0]);
 out.innerHTML=`<pre>${esc(v.split('\n')[0])}</pre><p><span class="miss">このエラーは辞書にありません</span></p><p class="note">未登録の一覧に残しました。</p>`;
}

/* ===== 画面から CSS を丸ごと出す（見た目のひな形は 辞書の styles、土台は css_base、言葉は words.css） =====
   1. 画面の中の class を全部拾う（要素の種類も一緒に）
   2. 札が見た目を持つ（looks）class は、その見た目。それ以外は class の名前の終わりの言葉 → 要素の種類 の順にひな形を当てる（言葉の方が詳しいので先）
   3. 外枠の画面と、ひな形で common の印を付けた物は common.css、それ以外はその画面の CSS（@section('css') で読む名前）
   4. どのひな形にも当たらない class は CSS に入れず、「見た目が決まっていない class」に出す */
const STY=id=>(DICT.styles||[]).find(s=>s.id===id);
function styleFor(c,el){
 let best=null,bl=-1;
 (DICT.styles||[]).forEach(s=>(s.words||[]).forEach(w=>{if(c.endsWith(w)&&w.length>bl){best=s;bl=w.length}}));
 if(best)return {st:best,by:'言葉'};
 const e=(DICT.styles||[]).find(s=>(s.el||[]).includes(el));
 return e?{st:e,by:'要素'}:null;
}
function looksOf(nodes){
 const m={};flat(nodes).forEach(n=>{const t=n.tag&&T(n.tag);if(t&&t.looks)Object.entries(t.looks).forEach(([c,id])=>{const cls=fill(c,nodeGet(n),{slots:t.slots});if(cls)m[cls]=id})});
 return m;
}
function cssCfg(lang){return LR(lang).css||(LANGS_WITH('css').map(l=>LR(l).css)[0])||{}}
function cssPath(c,cf){return cf.path||((c.dir||'')+cf.name+(c.ext||''))}
function cssPlan(screens){
 const c=cssCfg(screens[0]&&screens[0].lang);
 const vars=(DICT.css_base||[]);
 const varLines=()=>{const L=[],trs=[];if(vars.length){L.push(':root {');vars.forEach(b=>{L.push(`    ${b.name}: ${b.value};`);trs.push({sel:':root',code:`${b.name}: ${b.value};`,tr:`この値を変えると、${b.label}が全部変わる（土台）`})});L.push('}','')}return {L,trs}};
 /* class の文字に見た目を入れる出し方：CSS のファイルは色の変数の1つだけ */
 if(c.form==='class'){const v=varLines();while(v.L.length&&v.L[v.L.length-1]==='')v.L.pop();return [{name:c.vars_name||'vars',path:c.vars_path,lines:v.L,trs:v.trs,unknown:[]}]}
 const files={},fixed=c.fixed||[],common=c.common||'common';
 const fileOf=name=>files[name]||(files[name]={name,rules:[],unknown:[],sels:new Set(),order:Object.keys(files).length});
 screens.forEach(s=>{
  const text=s.lines.join('\n');
  const isLayout=c.layout?new RegExp(c.layout,'i').test(text):false;
  const own=isLayout?common:((c.own?[...text.matchAll(new RegExp(c.own,'g'))].map(x=>x[1]).find(n=>!fixed.includes(n)):null)||c.fallback||'page');
  if(isLayout)fileOf(common);else fileOf(own);
  const looks=looksOf(s.nodes||[]),seen=new Set();
  if(!c.tag_re)return;
  for(const em of text.matchAll(new RegExp(c.tag_re,'g'))){
   const el=em[1].toLowerCase(),cm=c.class_re?em[2].match(new RegExp(c.class_re)):null;if(!cm)continue;
   cm[1].split(/\s+/).filter(x=>x&&!(c.skip_class&&new RegExp(c.skip_class).test(x))).forEach(cl=>{
    if(seen.has(cl))return;seen.add(cl);
    const hit=looks[cl]&&STY(looks[cl])?{st:STY(looks[cl]),by:'札'}:styleFor(cl,el);
    const st=hit&&hit.st,name=st&&(st.common||isLayout)?common:own,Fl=fileOf(name);
    if(!st){if(!Fl.unknown.includes(cl))Fl.unknown.push(cl);return}
    (st.rules||[]).forEach(r=>{const sel='.'+cl+(r.sel||'');if(Fl.sels.has(sel))return;Fl.sels.add(sel);Fl.rules.push({sel,props:r.props,st,by:hit.by})});
   });
  }
 });
 return Object.values(files).sort((a,b)=>(a.name===common?-1:b.name===common?1:a.order-b.order)).map(Fl=>{
  const L=[],trs=[];
  if(Fl.name===common){const v=varLines();L.push(...v.L);trs.push(...v.trs)}
  Fl.rules.forEach(r=>{L.push(r.sel+' {');r.props.forEach(p=>{L.push(`    ${p.p}: ${p.v};`);trs.push({sel:r.sel,code:`${p.p}: ${p.v};`,tr:`この値を変えると、${r.st.name}の${cssWord(p.p)}が変わる`,st:r.st,by:r.by})});L.push('}','')});
  while(L.length&&L[L.length-1]==='')L.pop();
  return {name:Fl.name,path:cssPath(c,Fl),lines:L,trs,unknown:Fl.unknown};
 });
}
const cssWord=p=>{const w=wordOf((DICT.words||{}).css||{},p);return w?wordFill(w,''):p};
function cssTrHtml(cf){
 const by={};cf.trs.forEach(t=>{(by[t.sel]=by[t.sel]||[]).push(t)});
 return `<details class="inner"><summary>決まりごとの「ここを変えると何が変わるか」（${cf.trs.length}行）</summary><ul class="trl ft">${Object.entries(by).map(([sel,ts])=>`<li><code>${esc(sel)}</code>${ts[0].st?` → ${esc(ts[0].st.name)}（ひな形 ${esc(ts[0].st.id)}・${esc(ts[0].by)}で当てた）`:''}<ul>${ts.map(t=>`<li><code>${esc(t.code)}</code> → ${esc(t.tr)}</li>`).join('')}</ul></li>`).join('')}</ul></details>`+
 (cf.unknown.length?`<h3>見た目が決まっていない class（${esc(cf.name)}.css）</h3><p class="note">どのひな形にも当たらないので、CSS に入れていません：${cf.unknown.map(c=>`<code>${esc(c)}</code>`).join(' ')}</p>`:'');
}
function cssFromScreenHtml(lines,nodes,lang){
 const fs=cssPlan([{lines,nodes,lang}]);
 return `<h3>この画面の CSS（画面の class から出した物）</h3>`+fs.map(cf=>instr(`<code>${esc(cf.path)}</code> に入れる物`)+codeBlock(cf.lines.join('\n'))+cssTrHtml(cf)).join('');
}
/* 辞書にない札：完成コードには入れず、コードの外の欄に出す */
let MISS_TAGS=[];
function missTagHtml(){
 const u=[...new Set(MISS_TAGS)];MISS_TAGS=[];
 u.forEach(n=>{if(!missing.includes(n)&&!missing.includes(n+'（辞書にない札）'))addMissing(n+'（辞書にない札）')});
 return u.length?`<h3>辞書にない札</h3><ul>${u.map(n=>`<li><span class="miss">${esc(n)}</span></li>`).join('')}</ul><p class="note">完成コードには入れていません。未登録の一覧に入れました。</p>`:'';
}

/* ---------- 機能解説 ---------- */
/* アプリの値の一覧：①自分で決める値（questions）／②Laravel の決まりで決まる値（derived）／③②を上書きした値（印を付ける）。
   値はブラウザに残す（読み書きに失敗しても動く）。貼り直しても消さない。消すのはリセットだけ */
const VKEY='dict-app-values';
let ans={},ovr={},valsDirty=false,featShown=false;
(function(){try{const s=JSON.parse(localStorage.getItem(VKEY)||'null');if(s&&typeof s==='object'){ans=s.ans||{};ovr=s.ovr||{}}}catch(e){}})();
function saveVals(){try{localStorage.setItem(VKEY,JSON.stringify({ans,ovr}))}catch(e){}}
const QDEF=k=>(DICT.questions||[]).find(q=>q.key===k);
const DDEF=k=>(DICT.derived||[]).find(d=>d.key===k);
function featGetter(noOvr){
 const vals={},memo={};
 const get=k=>{
  const q=QDEF(k);if(q)return ans[k]!==undefined?ans[k]:(q.type==='table'?(q.default||[]):(q.default==null?'':q.default));
  const d=DDEF(k);
  if(d){if(!noOvr&&ovr[k]&&ans[k]!==undefined&&ans[k]!=='')return ans[k];if(k in memo)return memo[k];memo[k]='';
   /* N-1：作る元の値が1つでも空なら、この値も空にする（空のまま作ると create__table のように名前が消えるため。空なら値の名前で出る） */
   const refs=[...String(d.t).matchAll(/《([^》|]+)/g)].map(m=>m[1]);if(refs.some(r=>!tv(get(r))))return memo[k]='';
   const sv=PH;PH=null;try{memo[k]=tplText(d.t,get,{})}finally{PH=sv}return memo[k]}
  if(picked&&picked.has(k))return '1';
  return vals[k]!==undefined?vals[k]:'';
 };
 {const sv=PH;PH=null;try{(DICT.values||[]).forEach(x=>{vals[x.key]=tplText(x.t,get,{})})}finally{PH=sv}}
 return get;
}
/* 値を変えた時：手順を全部出し直し、もう出した後なら「貼り直しが要る」を出す */
/* 値の名前：値の一覧の欄の名前から、「は？」と後ろのかっこ書きを外した物 */
const valName=k=>{const q=QDEF(k)||DDEF(k);return q?'（'+String(q.text).replace(/は？$/,'').replace(/（[^（）]*）$/,'').trim()+'）':''};
function valsChanged(){saveVals();if(featShown)valsDirty=true;renderFeatOut();syncVals()}
function syncVals(){
 const get=featGetter(),ae=document.activeElement;
 document.querySelectorAll('[data-v],[data-q]').forEach(i=>{if(i===ae)return;const k=i.dataset.v||i.dataset.q;const v=get(k);if(typeof v==='string'&&i.value!==v)i.value=v});
 document.querySelectorAll('.seg').forEach(s=>s.querySelectorAll('button').forEach(b=>b.classList.toggle('on',get(s.dataset.k)===b.dataset.v)));
 const w=$('#vwarn');if(w)w.classList.toggle('hide',!valsDirty);
}
function valRows(get){
 return [...(DICT.questions||[]).filter(q=>condOk(q.if,get)).map(q=>({...q,kind:1})),
  ...(DICT.derived||[]).filter(d=>condOk(d.if,get)).map(d=>({...d,kind:2}))];
}
function tableInput(q,get){
 const rows=get(q.key)||[];
 return `<div class="vtw"><table class="vt"><tr>${q.cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}<th></th></tr>${rows.map((r,i)=>`<tr>${q.cols.map(c=>`<td>${c.options?`<select data-c="${q.key}.${i}.${c.key}">${c.options.map(o=>`<option value="${esc(optV(o))}" ${String(r[c.key]==null?'':r[c.key])===optV(o)?'selected':''}>${esc((typeof o==='object'&&o.label)||optV(o)||'—')}</option>`).join('')}</select>`:`<input data-c="${q.key}.${i}.${c.key}" value="${esc(r[c.key]==null?'':r[c.key])}">`}</td>`).join('')}<td><button class="vdel" data-del="${q.key}.${i}" title="この行を消す">×</button></td></tr>`).join('')}</table></div><button class="vadd" data-add="${q.key}">行を足す</button>`;
}
function renderVals(){
 const box=$('#vals');if(!box)return;
 if(tab!=='feat'||!picked||!picked.size||!inp.value.trim()){box.classList.add('hide');box.innerHTML='';return}
 box.classList.remove('hide');
 const get=featGetter(),base=featGetter(true);
 const rows=valRows(get);
 box.innerHTML=`<div class="card-h"><span>アプリの値の一覧</span><span><button class="copy" id="vIO">書き出す・読み込む</button> <button class="copy" id="vReset">リセット</button></span></div>
<p class="vwarn ${valsDirty?'':'hide'}" id="vwarn">値を変えたので、全部の手順をその値で出し直しました。もう貼った所は貼り直しが要ります。</p>
<div class="vio hide" id="vioBox"><textarea id="vio" spellcheck="false"></textarea><button class="copy" id="vLoad">この中身を読み込む</button></div>
<table class="vl">${rows.map(v=>{const k3=v.kind===2&&ovr[v.key];
  return `<tr><td class="vk">${v.kind===1?'① 自分で決める':k3?'③ 決まりと違えた':'② 決まりで決まる'}</td><td><div class="vname">${esc(v.text)}${v.kind===2?`<small>（決まり：${esc(tplText(v.t,base,{}))}）</small>`:''}</div>${
  v.type==='table'?tableInput(v,get):v.type==='choice'?`<select data-v="${v.key}">${v.choices.map(c=>`<option value="${esc(c.v)}" ${get(v.key)===c.v?'selected':''}>${esc(c.v)}.${esc(c.label)}</option>`).join('')}</select>`:
  `<input data-v="${v.key}" value="${esc(get(v.key))}">`}${k3?'<span class="vmark">決まりと違う</span>':''}</td></tr>`}).join('')}</table>`;
 box.querySelectorAll('[data-v]').forEach(i=>{const k=i.dataset.v;
  const set=()=>{if(DDEF(k)){const b=tplText(DDEF(k).t,featGetter(true),{});if(i.value===''||i.value===b){delete ovr[k];delete ans[k]}else{ovr[k]=1;ans[k]=i.value}}else ans[k]=i.value;valsChanged()};
  i.oninput=set;i.onchange=()=>{set();renderVals()}});
 box.querySelectorAll('[data-c]').forEach(i=>{const [k,ri,c]=i.dataset.c.split('.');
  const set=()=>{const rs=(get(k)||[]).map(r=>({...r}));rs[+ri][c]=i.value;ans[k]=rs;valsChanged()};i.oninput=set;i.onchange=set});
 box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const k=b.dataset.add;ans[k]=[...(get(k)||[]),{}];valsChanged();renderVals()});
 box.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const [k,ri]=b.dataset.del.split('.');const rs=(get(k)||[]).slice();rs.splice(+ri,1);ans[k]=rs;valsChanged();renderVals()});
 $('#vReset').onclick=()=>{ans={};ovr={};valsDirty=false;featShown=false;saveVals();runFeat(featV)};
 $('#vIO').onclick=()=>{const b=$('#vioBox');b.classList.toggle('hide');$('#vio').value=JSON.stringify({ans,ovr},null,1)};
 $('#vLoad').onclick=()=>{try{const s=JSON.parse($('#vio').value);ans=s.ans||{};ovr=s.ovr||{};valsChanged();runFeat(featV)}catch(e){toast('読み込めませんでした（形が違います）')}};
}
function runFeat(v){
 featV=v;
 const hitsK=Object.keys(DICT.keywords||{}).filter(k=>DICT.keywords[k].some(w=>v.includes(w)));
 const ranked=(DICT.examples||[]).map(c=>({...c,n:c.words.filter(w=>hitsK.includes(w)).length})).filter(c=>c.n>0).sort((a,b)=>b.n-a.n).slice(0,5);
 judge.innerHTML=`<span><b>機能解説</b>として読みました（キーワード ${hitsK.length}個）</span>`;
 if(!ranked.length){addMissing(v);steps.innerHTML='';renderVals();out.innerHTML='<p><span class="miss">近い例文がありません</span></p><p class="note">入力文を未登録の一覧に残しました。</p>';return}
 if(!picked){picked=new Set(ranked.filter(c=>c.n>=2&&c.auto!==false).map(c=>c.id));picked.forEach(applySets)}
 const get=featGetter();
 steps.innerHTML=`<div class="step"><div class="lbl">① 拾ったキーワード</div>${hitsK.map(h=>`<span class="chip">${esc(h)}</span>`).join('')}</div>
<div class="step cand"><div class="lbl">② 候補の例文（一致が多い順・複数選べる）</div>${ranked.map(c=>`<label><input type="checkbox" data-id="${c.id}" ${picked.has(c.id)?'checked':''}> ${esc(c.text)}<small>一致${c.n}</small>${idb(c.id)}</label>`).join('')}</div>
<div class="step"><div class="lbl">③ 前提の質問（選んだ例文に付いているもの。答えはアプリの値の一覧に入る）</div>
${(DICT.questions||[]).filter(q=>condOk(q.if,get)&&q.type!=='table').map(q=>q.type==='text'?`<div class="q">${esc(q.text)} <input data-q="${q.key}" value="${esc(get(q.key))}"></div>`:
 `<div class="q">${esc(q.text)} <span class="seg" data-k="${q.key}">${q.choices.map(c=>`<button data-v="${esc(c.v)}">${esc(c.v)}.${esc(c.label)}</button>`).join('')}</span></div>`).join('')}
</div>`;
 steps.querySelectorAll('input[type=checkbox]').forEach(c=>c.onchange=()=>{if(c.checked){picked.add(c.dataset.id);applySets(c.dataset.id)}else picked.delete(c.dataset.id);runFeat(v)});
 steps.querySelectorAll('.seg').forEach(s=>{s.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',get(s.dataset.k)===b.dataset.v);b.onclick=()=>{ans[s.dataset.k]=b.dataset.v;saveVals();if(featShown)valsDirty=true;runFeat(v)}})});
 steps.querySelectorAll('input[data-q]').forEach(i=>i.oninput=()=>{const q=QDEF(i.dataset.q);ans[q.key]=i.value||q.default||'';valsChanged()});
 renderVals();renderFeatOut();
}
/* 例文を選んだ時に、値の一覧に入れる値（済んだ機能の印など） */
function applySets(id){const ex=(DICT.examples||[]).find(e=>e.id===id);if(ex&&ex.sets){Object.assign(ans,ex.sets);saveVals()}}
/* ===== 作業の地図：作業の種類は 辞書の kinds に書いた7つ（コマンド・新しく作る・中身を全部置き換える・探して置き換える・決まった位置に足す・CSS・確かめる）。
   書くコードは札を呼び出し、アプリの値を札の穴に入れて作る。表の形の値は、行の数だけ札を繰り返す（each） ===== */
let featV='';
const fieldDefaults=f=>Object.fromEntries((f?f.fields:[]).map(fd=>[fd.key,fd.default==null?'':fd.default]));
const fillSet=(set,get)=>Object.fromEntries(Object.entries(set||{}).map(([k,v])=>[k,tplText(v,get,{})]));
const rowsOf=v=>Array.isArray(v)?v:plist(v).map(one=>({one,name:one}));
const rowGet=(row,ri,get)=>k=>k==='one'?String(row.one!=null?row.one:(row.name||'')):k==='i'?String(ri+1):k.startsWith('r.')?(row[k.slice(2)]==null?'':String(row[k.slice(2)])):get(k);
/* 札を呼び出して節にする。each は表の行の数だけ繰り返す。辞書に無い札は節にして、完成コードの外の欄に出す */
/* 前提の版の印が付いた札・ファイルの種類があれば、そちらを使う（S5） */
function preferId(box,id){const v=premiseVersion();if(!v||!id)return id;const alt=(DICT[box]||[]).find(x=>x&&x.for===id&&x.ver===v);return alt?alt.id:id}
function callNodes(it,get,lang){
 if(it.each){const sub=it.items||[{...it,each:null}];const rs=rowsOf(get(it.each));
  /* 表の形の値が空の時は、繰り返す行の代わりに値の名前を1回出す（D28） */
  if(!rs.length&&PH){const p=PH(it.each);return p?[{tag:null,ph:true,name:p,o:{},kids:[]}]:[]}
  return rs.flatMap((row,ri)=>{const g=rowGet(row,ri,get);return it.items&&it.if&&!condOk(it.if,g)?[]:sub.flatMap(x=>callNodes(x,g,lang))})}
 if(it.if&&!condOk(it.if,get))return [];
 if(it.piece)return workItems((DICT.pieces||{})[it.piece],get,lang);
 const tid=preferId('tags',it.tag);
 if(!T(tid)){const name=fill(it.name||it.tag||'',get,{});addMissing(name+'（辞書にない札）');return [{tag:null,name,lang:lang||DICT.default_lang,o:{},kids:[]}]}
 const n=newNode(tid,[]);Object.assign(n.o,fillSet(it.set,get));if(it.nouse&&(it.nouse===true||condOk(it.nouse,get)))n.nouse=true;
 n.kids=(it.kids||[]).flatMap(k=>callNodes(k,get,lang));
 if(it.els)n.els=it.els.flatMap(k=>callNodes(k,get,lang));
 return [n];
}
function callNode(it,get,lang){return callNodes(it,get,lang)[0]||null}
function workItems(items,get,lang){return [].concat(items||[]).flatMap(it=>callNodes(it,get,lang))}
/* 部品（pieces）を呼ぶ：ファイル1つ分の形（file・vals・secs）を、作業の中で何度でも使う */
function resolveW(w){if(!w||!w.from)return w;const p=(DICT.pieces||{})[w.from];return p?{...p,...w,from:null,vals:{...(p.vals||{}),...(w.vals||{})}}:w}
function buildFile(w,get){
 w=resolveW(w);const f=w&&F(preferId('files',w.file));if(!f)return null;
 const vals={...fieldDefaults(f),...fillSet(w.vals,get)},secs={};
 f.sections.forEach(s=>secs[s.key]=workItems((w.secs||{})[s.key],get,f.lang));
 return {f,vals,secs};
}
const filePath=b=>tplText(b.f.path,fileGetter(b.f,b.vals,b.secs),{slots:b.f.fields});
/* その作業で使った札が持つ use の行だけ（ファイルの種類の既定の use は入れない） */
const tagUses=nodes=>[...new Set(flat(nodes).filter(n=>n.tag&&!n.nouse).flatMap(n=>{const t=T(n.tag);return t.uses?tplLines(t.uses,nodeGet(n),{slots:t.slots}).filter(Boolean):[]}))].sort();
/* 組み上げたファイルから、find を1行目に含む札のまとまりを取り出す */
function pickNode(b,find){
 for(const n of flat(Object.values(b.secs).flat())){if(!n.tag)continue;const L=renderSec([n],'',null,0);if(L.length&&L[0].includes(find))return {n,L}}
 return null;
}
const sp=s=>/^[!-~]/.test(s)?' '+s:s;
/* 位置の言葉：《〇〇》があれば、作業に書いた〇〇の値を入れる */
const POS=(w,T2)=>{const l=(DICT.positions||{})[w.at];if(l==null)return w.at;return /《/.test(l)?tplText(l,k=>w[k]!=null?T2(w[k]):'',{}):l};
const instr=s=>`<p class="cmd-d wh">${s}</p>`;
/* 探す元の行：コードブロックと同じ形で、コピーは付けない。下に小さく「これを書き換える」 */
const findHtml=(t,range)=>`<div class="findb"><pre>${esc(t)}</pre></div><p class="cmd-d find-l">これを書き換える${range?`（${range}）`:''}</p>`;
/* 探して置き換える：最初に「どのファイルの中か」を大きく出す */
const editHead=path=>`<p class="fileh wh"><b class="fileh-n">${esc(path)}</b> の中で書き換える</p>`;
const RANGE={line:'',block:'この行から、閉じるまでのまとまり',to:'1行目から2行目まで'};
function usesHtml(path,nodes,lang){const u=LR(lang).uses_out?tagUses(nodes):[];return u.length?codeBlock(u.join('\n'))+instr(`<code>${esc(path)}</code> の${esc(sp(POS({at:'uses'})))}に、これを貼る`):''}
function workHtml(w0,get){
 const w=resolveW(w0),T2=x=>tplText(x,get,{});
 if(w.kind==='cmd'){
  if(w.tag){const n=callNode({tag:w.tag,set:w.set},get,DICT.cmd_lang);if(!n||!n.tag)return `<p><span class="miss">${esc(w.tag)}（辞書にない札）</span></p>`;const t=T(n.tag);return cmd(renderSec([n],'',null,0).join('\n'),tplText(t.tr,nodeGet(n),{slots:t.slots}))+idb(t.id)}
  return cmd(T2(w.cmd),T2(w.desc));
 }
 if(w.kind==='check'){
  return `<div class="chk"><p class="chk-h wh">ここを開いて、これが出れば完成</p>${w.open?`<p class="chk-o">開く：<b class="chk-t">${esc(T2(w.open))}</b></p>`:''}${w.press?`<p class="chk-o">押す・入れる：<b class="chk-t">${esc(T2(w.press))}</b></p>`:''}<ul class="chk-e">${[].concat(w.expect||[]).map(e=>`<li>${esc(T2(e))}</li>`).join('')}</ul></div>`;
 }
 if(w.kind==='new'||w.kind==='replace'){
  const b=buildFile(w,get);if(!b){addMissing((w.file||w.from)+'（辞書にないファイルの種類）');return `<p><span class="miss">${esc(w.file||w.from)}（辞書にないファイルの種類）</span></p>`}
  const code=renderFile(b.f,b.vals,b.secs,null).join('\n');
  return codeBlock(code)+instr(`<code>${esc(filePath(b))}</code> ${w.kind==='new'?'を新しく作って、これを貼る':'の中身を全部これに置き換える'}`);
 }
 if(w.kind==='edit'||w.kind==='add'){
  const b=(w.file||w.pick)?buildFile(w.pick?{...resolveW({from:w.pick}),...(w.file?{file:w.file}:{})}:w,get):null;
  const path=w.path?T2(w.path):b?filePath(b):'';
  const lang=b?b.f.lang:(w.lang||DICT.default_lang);
  let nodes=[],lines=[];
  if(w.patch){const ps=renderPatches(b.f,b.vals,b.secs).filter(p=>p.label===w.patch);
   return ps.map(p=>{const pt=(b.f.patches||[]).find(x=>x.label===p.label)||{};return editHead(path)+findHtml(pt.start||p.find,RANGE[pt.until==='block'?'block':'line'])+codeBlock(p.lines.join('\n'))}).join('')||`<p><span class="miss">置き換える所「${esc(w.patch)}」が無い</span></p>`}
  if(w.sec&&b){nodes=b.secs[w.sec]||[];lines=secLines(b.f,w.sec,nodes,'',null)}
  else if(w.pick&&w.find){const r=pickNode(b,T2(w.find));if(!r){addMissing(`${T2(w.find)}（取り出すまとまりが無い）`);return `<p><span class="miss">${esc(T2(w.find))} で始まるまとまりが、作った形の中に無い</span></p>`}nodes=[r.n];lines=r.L}
  else{nodes=workItems(w.code,get,lang);lines=renderSec(nodes,'',null,0)}
  const u=w.nouses?'':usesHtml(path,nodes,lang);
  if(w.kind==='add'&&w.at==='uses'){const ul=tagUses(nodes);return codeBlock(ul.join('\n'))+instr(`<code>${esc(path)}</code> の${esc(sp(POS(w,T2)))}に、これを貼る`)}
  if(w.kind==='add')return u+codeBlock(lines.join('\n'))+instr(`<code>${esc(path)}</code> の${esc(sp(POS(w,T2)))}に、これを貼る`);
  const ft=w.to?T2(w.find)+'\n…\n'+T2(w.to):T2(w.find);
  return editHead(path)+u+findHtml(ft,RANGE[w.to?'to':w.until==='line'?'line':'block'])+codeBlock(lines.join('\n'));
 }
 if(w.kind==='css'){
  const screens=(w.screens||[]).map(s=>{const b=buildFile(s,get);return b&&{lines:renderFile(b.f,b.vals,b.secs,null),nodes:Object.values(b.secs).flat(),lang:b.f.lang}}).filter(Boolean);
  return cssPlan(screens).filter(cf=>!w.only||w.only.includes(cf.name)).map(cf=>{const mode=(w.modes||{})[cf.name]||w.mode||'new';
   return codeBlock(cf.lines.join('\n'))+instr(`<code>${esc(cf.path)}</code> ${mode==='replace'?'の中身を全部これに置き換える':'を新しく作って、これを貼る'}`)+cssTrHtml(cf)}).join('');
 }
 return `<p><span class="miss">作業の種類「${esc(w.kind)}」は辞書にありません</span></p>`;
}
/* 対応表の「例え話の文」：貼った文を区切り、例文の見出し語（keywords の言い換えも含む）を含む区切りをそのまま出す */
function storyOf(r){
 if(r.fixed!=null)return r.fixed;
 const ws=(r.words||[]).flatMap(k=>(DICT.keywords||{})[k]||[k]);
 const seg=featV.split(/[。、，,\n]/).map(s=>s.trim()).filter(Boolean).find(s=>ws.some(w=>s.includes(w)));
 return seg||'（'+r.action+'）';
}
/* 手順：例文が持つ手順だけを出す（どの例文も持たない手順は、条件だけで出す）。画面の技術の印（front）が付いた手順は、前提の画面の技術の時だけ出す */
function pickSteps(get){
 const own=new Set(),owned=new Set();(DICT.examples||[]).forEach(e=>(e.steps||[]).forEach(id=>{owned.add(id);if(picked&&picked.has(e.id))own.add(id)}));
 const pf=premiseFront();
 return (DICT.steps||[]).filter(s=>(owned.has(s.id)?own.has(s.id):true)&&(!s.front||(pf&&s.front===pf.id))&&condOk(s.if,get));
}
function renderFeatOut(){
 if(!picked||!picked.size){out.innerHTML='<div class="empty">候補の例文を選ぶと結果が出ます</div>';return}
 MISS_TAGS=[];PH=valName;
 try{
 const get=featGetter(),T2=x=>tplText(x,get,{});
 const rows=(DICT.rows||[]).filter(r=>condOk(r.if,get)),st=pickSteps(get);
 const body=st.map((s,i)=>`<div class="vstep"><div class="vh">手順${i+1}</div><p class="sh">${esc(T2(s.title))}</p>${(s.do||[]).filter(w=>condOk(w.if,get)).map(w=>`<div class="wk">${(DICT.kinds||{})[w.kind]?`<span class="wkk">${esc(DICT.kinds[w.kind])}</span>`:''}${workHtml(w,get)}</div>`).join('')}</div>`).join('');
 out.innerHTML=`<h3>対応表</h3><table><tr><th>例え話の文</th><th>動作の種類</th><th>どのファイルに足すか</th></tr>${rows.map(r=>`<tr><td>${esc(storyOf(r))}</td><td>${esc(r.action)}</td><td>${esc(r.file)}</td></tr>`).join('')}</table>
<h3>指示書（上から順にやる）</h3>${body}${missTagHtml()}`;
 }finally{PH=null}
 featShown=true;
}

/* ---------- タブ・見本・操作 ---------- */
function renderSamples(){
 const mb=$('#mockbar');if(!mb)return;mb.innerHTML='';let g=null;
 (DICT.samples||[]).filter(s=>s.tab===tab).forEach(s=>{
  if(s.group&&s.group!==g){g=s.group;const h=document.createElement('span');h.className='grp';h.textContent=g;mb.appendChild(h)}
  const b=document.createElement('button');b.textContent='例を貼る：'+s.label;b.onclick=()=>{inp.value=s.text;errSource=null;errOv=null;override='auto';picked=null;if(s.vals){Object.assign(ans,s.vals);saveVals()}run()};mb.appendChild(b)});
}
function setTab(t){
 tab=t;override='auto';errSource=null;errOv=null;picked=null;
 document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
 renderSamples();run();
}
/* ---------- 前提（版・画面の技術） ---------- */
function premiseOptions(){
 const vt=VER_TECH(),vs=vt?vt.versions:[{id:'',name:''}],fr=FRONTS().length?FRONTS():[null],o=[['auto','自動']];
 vs.forEach(v=>fr.forEach(f=>o.push([v.id+'|'+(f?f.id:''),[v.name,f&&f.name].filter(Boolean).join('・')])));
 return o;
}
function premiseAuto(v){
 const vt=VER_TECH();let ver=null;
 if(vt&&tab==='code')for(const x of vt.versions){if((x.marks||[]).some(r=>new RegExp(r,'m').test(v))){ver=x.id;break}}
 PREMISE.autoMarked=!!ver;PREMISE.autoVer=ver||(vt&&vt.default_version)||null;
 let fr=null;
 if(tab==='code'){const t=linesTech(v);if(t.front)fr=t.id;const f=detectFile(v);if(f){const ft=TECHS().find(t=>t.lang===f.lang);if(ft&&ft.front)fr=ft.id}}
 PREMISE.autoFront=fr||(FRONT_DEF()?FRONT_DEF().id:null);
}
function premiseText(){
 const vt=VER_TECH(),vid=premiseVersion(),vn=vt&&((vt.versions.find(x=>x.id===vid)||{}).name),f=premiseFront();
 const s=[vn,f&&f.name].filter(Boolean).join('・');if(!s)return '';
 return `（前提：${s}${PREMISE.sel!=='auto'?'・手で選択':(tab==='code'&&!PREMISE.autoMarked?'／版の目印なし':'')}）`;
}
function initPremise(){
 const sel=$('#premise');if(!sel)return;
 sel.innerHTML=premiseOptions().map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('');
 sel.value=PREMISE.sel;
 sel.onchange=()=>{PREMISE.sel=sel.value;if(sel.value!=='auto'){const [ver,front]=sel.value.split('|');PREMISE.ver=ver||null;PREMISE.front=front||null}run()};
}
function run(){
 const v=inp.value.trim();
 if(v)premiseAuto(v);
 steps.classList.toggle('hide',tab!=='feat'||!v);
 if(!v){judge.innerHTML='';renderVals();out.innerHTML='<div class="empty">まだ何も貼られていません</div>';return}
 if(tab!=='feat')renderVals();
 if(tab==='code')runCode(v);else if(tab==='err')runErr(v);else runFeat(v);
 const pt=premiseText();if(pt){const h=`<span class="pre" id="premiseNow">${esc(pt)}</span>`,f=judge.querySelector('span');if(f)f.insertAdjacentHTML('beforeend',h);else judge.insertAdjacentHTML('beforeend',h)}
}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('on');setTimeout(()=>e.classList.remove('on'),1000)}
function copyText(t){(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('コピーしました'),()=>{const r=document.createRange();r.selectNodeContents(out);const sel=getSelection();sel.removeAllRanges();sel.addRange(r);toast('選択しました。Ctrl+Cでコピー')})}
function copyAll(){if(!inp.value.trim())return;copyText('```\n'+out.innerText.trim()+'\n```')}
function clearAll(){inp.value='';errSource=null;errOv=null;override='auto';picked=null;run();inp.focus()}
out.addEventListener('click',e=>{const b=e.target.closest('.cc');if(b)copyText(b.dataset.cmd)});
inp.addEventListener('paste',()=>{errSource=null;errOv=null;override='auto';picked=null;setTimeout(run,0)});
inp.addEventListener('input',()=>{if(!inp.value.trim())run()});
$('#clear').onclick=clearAll;
$('#edit').onclick=()=>{inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length)};
$('#copy').onclick=copyAll;
$('#missCopy').onclick=()=>copyText('次のものを辞書に足してください。\n'+missing.map(m=>'- '+m).join('\n'));
/* 未登録の一覧をファイルに書き出す（JSON。AIに渡して辞書に足してもらう物） */
function exportMissing(){
 if(!missing.length){toast('未登録の一覧は空です');return}
 const d=new Date(),p=n=>String(n).padStart(2,'0'),stamp=`${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
 const body={kind:'dict-missing',note:'プログラミング辞書の未登録の一覧。辞書に無かった行・文・エラー。辞書のJSONにして足す物',exported_at:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,count:missing.length,
  dict:(window.DICT_LOAD&&DICT_LOAD.state.loaded)||[],items:missing.map(m=>({text:m,tab:missingFrom[m]||'不明'}))};
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'}));a.download=`dict-missing-${stamp}.json`;
 document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);toast('書き出しました');
}
$('#missExport').onclick=exportMissing;
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();clearAll()}
 else if(e.ctrlKey&&e.shiftKey&&e.key==='Enter'){e.preventDefault();copyAll()}
 else if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();picked=null;run()}
 else if(e.altKey&&['1','2','3'].includes(e.key)){e.preventDefault();setTab(['code','feat','err'][+e.key-1])}
});
/* 辞書の状態：人が読む形（できること・入っているアプリ×機能・土台）と、JSONを作る人向けの詳しい一覧 */
const FUNC_NAME={translate:'翻訳',feature:'機能解説',error:'エラー'};
const fileBase=p=>String(p).replace(/^.*\//,'').replace(/\.json$/,'');
function bundleName(base,label){if(label)return label.replace(/\s*×\s*/g,' × ');const m=base.match(/^(.*)-([a-z]+)$/);return m?`${m[1]} × ${FUNC_NAME[m[2]]||m[2]}`:base}
const listCut=(a,n)=>a.length>n?a.slice(0,n).join('・')+` ほか${a.length-n}件`:a.join('・');
function renderState(){
 const R=window.DICT_LOAD||{state:{loaded:[],applied:[],last:'',files:[]}},st=R.state;
 const up=st.uploaded||[],ad=st.added||[],fi=st.files||[];
 const ex=DICT.examples||[],er=DICT.errors||[],fl=DICT.files||[];
 $('#stateSum').textContent=`読み取り ファイル${fl.length}種類・機能解説 例文${ex.length}件・エラー${er.length}件${up.length?`・入れたファイル ${up.length}`:''}`;
 /* この辞書でできること（タブごと） */
 const techTxt=[...TECHS()].sort((a,b)=>(b.default?1:0)-(a.default?1:0)).map(t=>{const vs=(t.versions||[]).map(v=>v.id);return esc(t.name)+(vs.length?`（版 ${esc(vs.join('・'))} を見分ける${t.default_version?`。目印が無ければ ${esc(t.default_version)}`:''}）`:'')+(t.front?'（画面）':'')}).join('・')||'なし';
 const none='<span class="sv-none">まだ入っていません</span>';
 const card=(h,body)=>`<div class="sv-card"><div class="sv-h">${h}</div><div class="sv-b">${body}</div></div>`;
 const can=card('コードの読み取り',fl.length?`読める技術：${techTxt}<br>読めるファイル ${fl.length}種類・読める書き方 ${(DICT.tags||[]).length}個<br><span class="sv-sub">${esc(listCut(fl.map(f=>f.name),8))}</span>`:none)+
  card('機能解説',ex.length?`作れる物 ${ex.length}件<br><span class="sv-sub">${esc(listCut(ex.map(x=>x.text),5))}</span>`:none)+
  card('エラー',er.length?`分かるエラー ${er.length}件<br><span class="sv-sub">${esc(listCut(er.map(x=>x.found_by||x.match),6))}</span>`:none);
 /* 入っているアプリ×機能（束）と土台 */
 const bundles={};fi.filter(f=>!f.base).forEach(f=>{const b=fileBase(f.path);(bundles[b]=bundles[b]||[]).push(f)});
 const badge=fs=>fs.some(f=>!f.ok)?'<span class="sv-tag sv-bad">読めていません</span>':fs.some(f=>f.uploaded)?'<span class="sv-tag sv-up">このタブで入れた</span>':'<span class="sv-tag">公開ページ</span>';
 const what=fs=>{const c={};fs.forEach(f=>Object.entries(f.counts||{}).forEach(([k,v])=>c[k]=(c[k]||0)+v));
  return [c.tags&&`読める書き方 ${c.tags}個`,c.files&&`ファイルの種類 ${c.files}`,c.parts&&`部品の意味 ${c.parts}`,c.examples&&`例文 ${c.examples}`,c.steps&&`手順 ${c.steps}`,c.errors&&`エラー ${c.errors}`,c.styles&&`見た目 ${c.styles}`].filter(Boolean).join('・')||'中身なし'};
 const rows=Object.entries(bundles).map(([b,fs])=>{const lb=(fs.find(f=>f.label)||{}).label;return `<div class="sv-row"><span>${esc(bundleName(b,lb))}</span><span class="sv-sub">${esc(what(fs))} ${badge(fs)}</span></div>`}).join('');
 const bf=fi.filter(f=>f.base),bases=bf.map(f=>`${esc(fileBase(f.path)==='base'?'共通':(f.techName||fileBase(f.path)))}${!f.ok?'（読めていません）':f.uploaded?'（このタブで入れた）':''}`);
 $('#stateHuman').innerHTML=`<p class="sv-t">この辞書でできること</p><div class="sv-grid">${can}</div>
<p class="sv-t">入っているアプリ×機能</p>${rows||'<p class="sv-none">まだ入っていません</p>'}
<p class="sv-sub" style="margin:6px 0 0">土台（技術ごとの読み方の決まり）：${bases.join('・')||'なし'}</p>`;
 /* JSONを作る人向け：読んだファイル・数・修正の番号 */
 $('#stateList').innerHTML=[`読み込んだファイル：${st.emptyIndex?'（目次なし。空の目次で読んだ）':'dict/index.json（目次）'}、${st.loaded.join('、')}${st.applied.length?'、'+st.applied.join('、'):''}`,`修正ファイル：${st.applied.length?st.applied.join('、'):'なし'}`,`札の数：${(DICT.tags||[]).length}`,`ファイルの種類：${fl.map(f=>f.name).join('・')}`,`エラーの数：${er.length}`,`機能解説の例文の数：${ex.length}`,`手順の数：${(DICT.steps||[]).length}`,`最後に足した修正の番号：${st.last||'なし'}`,...(up.length?[`入れたファイル（このタブを閉じると消えます）：${up.join('、')}`]:[]),...(ad.length?[`目次（index.json）に無いので、目次の最後に足して読んだファイル：${ad.join('、')}。GitHubに置く時は index.json にも足してください`]:[])].map(t=>`<li>${esc(t)}</li>`).join('');
}
/* 読み込みで飛ばした物・名前で呼んだ先が無い所：消せない帯で知らせる */
function renderDictErr(){
 const box=$('#dictErr');if(!box)return;const R=window.DICT_LOAD;if(!R)return;
 const items=[...R.errs.map(e=>e.n!=null?`${e.file}・${e.n}件目・${e.id}・${e.reason}`:e.line!=null?`${e.file}・${e.line}行目・${e.reason}`:`${e.file}・${e.reason}`),...R.refs.map(r=>r.text)];
 if(!items.length){box.classList.add('hide');box.innerHTML='';return}
 box.innerHTML='<b>辞書のファイルに、そのままでは使えない所があります（その分は飛ばしました）</b><ul>'+items.map(t=>`<li>${esc(t)}</li>`).join('')+'</ul>';
 box.classList.remove('hide');
}
/* 開いた時に、未登録の一覧を引き直し、もう辞書で読める行を外す（10/26 の決定） */
function recheckMissing(){
 const before=missing.length;
 missing=missing.filter(m=>{if(/（[^（）]*）$/.test(m))return true;try{const r=forwardLines(m);return !(r.nodes.length&&!r.unknown.length)}catch(e){return true}});
 if(missing.length!==before){Object.keys(missingFrom).forEach(k=>{if(!missing.includes(k))delete missingFrom[k]});saveMissing()}
}
recheckMissing();initPremise();renderDictErr();renderSamples();renderMissing();renderState();
(function(){let h='';try{h=decodeURIComponent(location.hash.slice(1))}catch(e){}if(!h)return;const m=h.match(/^(code|feat|err):([\s\S]*)$/);if(m){tab=m[1];inp.value=m[2]}else inp.value=h;setTab(tab)})();
