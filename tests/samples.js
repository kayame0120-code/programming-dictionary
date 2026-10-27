// 検品表0章の見本（モックの「例を貼る」と Notion「貼り付け例と結果の具体例」からそのまま）
const S = {};
S.line = `return view('purchase.edit', compact('shippingAddress', 'item_id'));`;
S.method = `public function index(Request $request)
{
    $keyword = $request->keyword;
    $tab     = $request->tab;

    $items = Item::when(auth()->check(), function($q) {
                    $q->where('user_id', '!=', auth()->id());
                })
                ->when($keyword, function($q, $keyword) {
                    $q->where('name', 'like', '%' . $keyword . '%');
                })
                ->when($tab === 'mylist' && auth()->check(), function($q) {
                    $q->whereHas('likes', function($q) {
                        $q->where('user_id', auth()->id());
                    });
                })
                ->with('purchases')
                ->get();

    return view('item.index', compact('keyword', 'tab', 'items'));
}`;
S.back = `<?php

namespace App\\Http\\Controllers;

use App\\Models\\Item;
use Illuminate\\Support\\Facades\\Auth;

class LikeController extends Controller
{
    public function toggle(Item $item)
    {
        $user = Auth::user();

        if ($user->likes()->where('item_id', $item->id)->exists()) {
            $user->likes()->detach($item->id);
        } else {
            $user->likes()->attach($item->id);
        }

        return redirect()->back();
    }
}`;
S.front = `@extends('layouts.app')

@section('content')
<div class="login">
    <h1 class="login__title">ログイン</h1>

    <form class="login__form" action="/login" method="POST">
        @csrf

        <div class="login__group">
            <label class="login__label" for="email">メールアドレス</label>
            <input class="login__input" type="email" id="email" name="email" value="{{ old('email') }}">
            @error('email')
                <p class="login__error">{{ $message }}</p>
            @enderror
        </div>

        <div class="login__group">
            <label class="login__label" for="password">パスワード</label>
            <input class="login__input" type="password" id="password" name="password">
            @error('password')
                <p class="login__error">{{ $message }}</p>
            @enderror
        </div>

        <button class="login__button" type="submit">ログインする</button>
    </form>

    <a class="login__link" href="/register">会員登録はこちら</a>
</div>
@endsection`;
S.noLine = `$total = collect($rows)->sum('price');`;
S.memoMethod = `【メソッド】index
引数：Request $request
戻り値：画面 item.index
まとめ：値を受け取り、条件で絞り込んで取り出し、画面に渡す
札：
受け取る：keyword / keyword
受け取る：tab / tab
取り出し始め：items / Item
  条件付き：auth()->check()
    絞り込む：user_id / 違う / auth()->id()
  条件付き：$keyword / $keyword
    絞り込む：name / 含む / $keyword
  条件付き：$tab === 'mylist' && auth()->check()
    関係で絞る：likes
      絞り込む：user_id / 同じ / auth()->id()
  まとめて取る：purchases
  実行する：全部
渡す：item.index / keyword, tab, items`;
S.memoBack = `【係】いいねを付け外しする係
【コントローラー】LikeController
【モデル】Item
【認証】いる
【ルート】
【メソッド】toggle
引数：Item $item
戻り値：元のページ
まとめ：ログイン中の人を用意し、いいね済みかで分かれて、外すか付け、元のページへ移動する
札：
用意する：user
分かれる：$user->likes()->where('item_id', $item->id)->exists()
  外す：user / likes / $item->id
そうでなければ
  付ける：user / likes / $item->id
移動する：`;
S.memoFront = `【画面】ログイン画面
【ファイル】
【親レイアウト】layouts.app
【クラス名】login
【送信先】POST /login
【入力を残す】する
【エラー表示】する
【画面の要素】
見出し：ログイン
入力欄：メールアドレス / email / email
入力欄：パスワード / password / password
ボタン：ログインする
リンク：会員登録はこちら / /register`;
S.memoCrud = `【係】メモの一覧を出す係
【コントローラー】MemoController
【モデル】Memo
【認証】いる
【ルート】GET /memos
【メソッド】index
引数：Request $request
戻り値：画面 memos.index
まとめ：検索の文字を受け取り、タイトルで絞り込んで一覧を取り出し、画面に渡す`;
S.sentSave = `入力をチェックして、メモを保存し、一覧へ移動する`;
S.rline = `画面に渡して表示する`;
S.err = `SQLSTATE[42S02]: Base table or view not found: 1146 Table 'laravel_db.items' doesn't exist`;
S.errUnknown = `Something unexpected happened while processing`;
S.feat = `店員さんが、お客さんが選んだ商品のカードを取り出す。ログインしているお客さんの住所メモも一緒に用意して、購入画面係に渡す。`;
// 具体例ページの期待コード
S.expStore = `public function store(Request $request)
{
    $request->validate([
        'title' => 'required|max:255',
        'body' => 'nullable',
    ]);
    Memo::create($request->only(['title', 'body']));
    return redirect()->route('memos.index');
}`;
S.expCrudRoute = `Route::get('/memos', [MemoController::class, 'index'])->middleware('auth');`;
S.expCrudCtl = `<?php

namespace App\\Http\\Controllers;

use App\\Models\\Memo;
use Illuminate\\Http\\Request;

class MemoController extends Controller
{
    public function index(Request $request)
    {
        $keyword = $request->keyword;
        $memos = Memo::where('title', 'like', '%' . $keyword . '%')
            ->get();
        return view('memos.index', compact('memos'));
    }
}`;
S.expFeatRows = [
  ['（住所の欄が無い）', 'テーブルに欄を足す', 'マイグレーション・モデル'],
  ['お客さんが選んだ商品のカードを取り出す', 'URLの番号から商品を1件取り出す', 'ルート・コントローラー'],
  ['ログインしているお客さんの住所メモも用意する', 'ログイン中の人の情報を取り出す', 'コントローラー'],
  ['購入画面係に渡す', '画面に渡す', 'コントローラー'],
  ['（ログインしている人だけ）', '未ログインならログイン画面へ飛ばす', 'ルート']
];
S.expFeatSteps = [
  { title: 'マイグレーション：users テーブルに住所の欄を足す', cmds: ['php artisan make:migration add_address_to_users_table --table=users'], code: `Schema::table('users', function (Blueprint $table) {
    $table->string('postcode')->nullable();
    $table->string('address')->nullable();
    $table->string('building')->nullable();
});` },
  { title: 'モデル：User で住所の欄を書き込めるようにする', cmds: [], code: `'postcode',
'address',
'building',` },
  { title: 'コントローラー：PurchaseController に create を足す', cmds: ['php artisan make:controller PurchaseController'], code: `use App\\Models\\Item;
use Illuminate\\Support\\Facades\\Auth;

public function create(Item $item)
{
    $user = Auth::user();
    return view('purchase.create', compact('item', 'user'));
}` },
  { title: 'ルート：URLと係をつなぐ', cmds: [], code: `Route::get('/purchase/{item}', [PurchaseController::class, 'create'])->middleware('auth')->name('purchase.create');` },
  { title: '仕上げ：設計図どおりにDBを作り変える', cmds: ['php artisan migrate'], code: '' }
];
module.exports = S;
