# 束の記録：app02-translate

| 項目 | 中身 |
| --- | --- |
| 束の名前 | app02-translate（app02×翻訳） |
| アプリのリポジトリ | kayame0120-code/app02_todo（コードは src/ の中） |
| 保存番号 | 0dc2dfc4c26965111ff826a0fbb27223f69906fc（TODOアプリ完成 CRUD・セッション・バリデーション実装） |
| 配られた時の形の保存 | 8db897189ae51e3166e07f3d2b6795b78c6e33cd（push） |
| 技術と版 | Laravel 8（composer.json の laravel/framework ^8.75、composer.lock は v8.83.8）・Blade・CSS |
| 作った日 | 2026-11-19 |
| 束のファイル | dict/content/app02-translate.json（JSON2 は無し） |

## 読んだファイルの一覧（files.txt。src/ からの置き場所）

```txt
app/Http/Controllers/TaskController.php
app/Http/Requests/TodoRequest.php
app/Models/Task.php
database/migrations/2026_04_04_091002_create_tasks_table.php
public/css/common.css
public/css/index.css
resources/views/index.blade.php
resources/views/layouts/app.blade.php
routes/web.php
```

## 外したファイルと理由

| ファイル | 理由 |
| --- | --- |
| public/css/sanitize.css | スキル3章で外すと決まっている物 |

- 決め方：保存 8db8971（Laravel の雛形が最初に入った保存）と 0dc2dfc を、空白の違いを無視して比べた。見たフォルダは app/・routes/web.php・database/migrations・database/seeders・database/factories・resources/views・public/css
- 比べて出た物は上の9本と sanitize.css の10本。道具が自動で作ったままのファイル・コメントの行しか変わっていないファイルは無かった
