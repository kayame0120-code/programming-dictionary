// 辞書JSONの型 6章「検品の決まり」のうち、検品表に無い2つ（照合を札の書き分けごとに・機能解説5通りをモックの組み立てと比べる）
// 使い方：node tests/spec6-checks.js
const E=require('../js/engine.js'),fs=require('fs'),S=require('./samples.js');
const D=E.buildDict(fs.readFileSync(require('path').join(__dirname,'../dict/entries.json'),'utf8'),[]).dict;
const sq=s=>String(s).replace(/\s+/g,'');
// 照合：札ごと・書き分けごとに、既定値で組んだ1行から札と穴の値が取り戻せるか
let bad=[],n=0;
for(const t of D.tags){
  const vs=[];
  if(t.kind==='line'||t.kind==='chain'){
    const conds=(Array.isArray(t.code)?t.code:[t.code]).filter(x=>x&&typeof x==='object'&&x.if);
    if((Array.isArray(t.code)?t.code:[]).some(x=>x&&x.each)){continue;}
    if(!conds.length) vs.push({});
    for(const c of conds){const o={};for(const x of [].concat(c.if)){let m;if(m=x.match(/^([^!=]+)=(.*)$/))o[m[1]]=m[2];else if(x[0]==='!')o[x.slice(1)]='';}vs.push(o);}
  } else continue;
  for(const set of vs){
    n++;
    const node=E.makeNode(t,set);
    const line=E.renderNodes([node],'stmt',0,D).join('\n');
    const back=t.kind==='chain'?E.parseStmts('$x = Memo::where(\'a\', $b)'+line+';','stmt',D)[0].kids.slice(-1)[0]:E.parseStmt(line,'stmt',D)[0];
    const ok=back&&back.tag===t.name&&JSON.stringify(back.o)===JSON.stringify(node.o);
    if(!ok)bad.push(`${t.id} ${JSON.stringify(set)} → ${back&&back.tag} ${back&&JSON.stringify(back.o)}`);
  }
}
console.log(`照合 ${n}通り 不一致 ${bad.length}`);bad.forEach(b=>console.log(' ',b));
// 機能解説：モックの renderFeatOut をそのまま写した物差しと比べる（5通り）
function mock(ans,p){const n=ans.name,N=n.charAt(0).toUpperCase()+n.slice(1),q=s=>`'${s}'`;const addr=p.includes('ex-authuser')&&ans.info==='A'&&ans.where==='A'&&ans.has==='B';const st=[],ctl=[];
 if(p.includes('ex-show'))ctl.push('item');if(p.includes('ex-authuser'))ctl.push('user');const auth=p.includes('ex-authonly');
 if(addr){st.push({h:'マイグレーション：users テーブルに住所の欄を足す',code:`Schema::table('users', function (Blueprint $table) {\n    $table->string('postcode')->nullable();\n    $table->string('address')->nullable();\n    $table->string('building')->nullable();\n});`});st.push({h:'モデル：User で住所の欄を書き込めるようにする',code:`'postcode',\n'address',\n'building',`});}
 if(ctl.length)st.push({h:`コントローラー：${N}Controller に create を足す`,code:`use App\\Models\\Item;${ctl.includes('user')?'\nuse Illuminate\\Support\\Facades\\Auth;':''}\n\npublic function create(Item $item)\n{\n${ctl.includes('user')?'    $user = Auth::user();\n':''}    return view('${n}.create', compact(${ctl.map(q).join(', ')}));\n}`});
 if(ctl.length||auth)st.push({h:'ルート：URLと係をつなぐ',code:`Route::get('/${n}/{item}', [${N}Controller::class, 'create'])${auth?"->middleware('auth')":''}->name('${n}.create');`});
 if(addr)st.push({h:'仕上げ：設計図どおりにDBを作り変える',code:''});return st;}
const {ranked}=E.featRank(S.feat,D);const sel=E.featDefaultSelection(ranked);
const combos=[['住所・users・無い',{name:'purchase',info:'A',where:'A',has:'B'}],['住所の欄がある',{name:'purchase',info:'A',where:'A',has:'A'}],['名前だけ',{name:'purchase',info:'B',where:'A',has:'B'}],['別のテーブル',{name:'purchase',info:'A',where:'B',has:'B'}],['名前 order',{name:'order',info:'A',where:'A',has:'B'}]];
for(const [lbl,a] of combos){const mine=E.featResult(S.feat,D,sel,a).steps,m=mock(a,sel);
 const ok=mine.length===m.length&&mine.every((s,i)=>s.title===m[i].h&&sq(s.code)===sq(m[i].code));
 console.log(`機能解説 ${lbl}：${ok?'一致':'不一致'}（手順 ${mine.map(s=>s.title.split('：')[0]).join('→')}）`);}
