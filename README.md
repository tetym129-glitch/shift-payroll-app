# 一福 シフト提出アプリ

スタッフがスマホのブラウザからシフト希望を提出できるWebアプリです。

## 機能

**スタッフ側**
- 名前を選んでログイン（パスワード不要）
- 日ごとに「昼 / 夜 / 1日 / ×」を選択
- 希望時間の入力
- 提出後もいつでも修正可能
- 締切日の表示
- 管理者からのリマインド通知

**管理者側（PIN認証）**
- 提出状況の一覧（提出済み・未提出を色分け表示）
- 各スタッフの詳細シフトを確認
- 未提出者 / 全員へのリマインド送信
- スタッフの追加・削除
- 対象月・締切日の設定
- 過去の提出データ閲覧

---

## セットアップ手順

### ① Node.js のインストール確認
```bash
node -v  # v18以上推奨
```

### ② 依存パッケージのインストール
```bash
cd shift-app
npm install
```

### ③ Notion インテグレーションの作成
1. https://www.notion.so/my-integrations にアクセス
2. 「新しいインテグレーション」を作成（名前は何でもOK）
3. 「インテグレーショントークン」をコピーしておく（`secret_xxx...`）

### ④ Notion に親ページを作成
1. Notion を開いて新しいページを作成（例：「シフト管理」）
2. ページを開いた状態で「...」メニュー →「コネクト」→ 作ったインテグレーションを接続
3. URLの末尾からページIDをコピー
   例: `https://www.notion.so/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   → `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` の形式

### ⑤ Notion データベースを自動作成
```bash
NOTION_API_KEY=secret_xxx node setup-notion.js <ページID>
```

完了すると `.env.local` が自動生成されます。

### ⑥ ローカルで動作確認
```bash
npm run dev
```
http://localhost:3000 をスマホのブラウザで開いて確認してください。

---

## Vercel へのデプロイ

### ① GitHub にリポジトリを作成してプッシュ
```bash
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/あなたのユーザー名/shift-app.git
git push -u origin main
```

### ② Vercel にデプロイ
1. https://vercel.com にアクセスしてログイン（GitHubアカウントでOK）
2. 「New Project」→ 作成したリポジトリを選択
3. 「Environment Variables」に以下を設定：

| 変数名 | 値 |
|--------|-----|
| `NOTION_API_KEY` | `secret_xxx...` |
| `NOTION_STAFF_DB_ID` | `.env.local` に記載のID |
| `NOTION_SHIFTS_DB_ID` | `.env.local` に記載のID |
| `NOTION_SETTINGS_DB_ID` | `.env.local` に記載のID |
| `NOTION_NOTIFICATIONS_DB_ID` | `.env.local` に記載のID |
| `ADMIN_PIN` | お好きな数字（例: `5678`） |

4. 「Deploy」ボタンを押す
5. デプロイ完了後、発行されたURL（例: `https://shift-app-xxx.vercel.app`）をスタッフに共有

---

## 使い方

### スタッフへの共有
- Vercel で発行された URL を LINE などで共有するだけ
- スマホのホーム画面に追加しておくとアプリのように使える
  （Safari: 「共有」→「ホーム画面に追加」）

### 毎月の運用
1. 管理者画面 → 設定 → 対象月・締切日を設定
2. スタッフにURLを送ってシフト提出を依頼
3. 提出状況を確認。未提出者には「リマインド送信」
4. 締切後に管理者画面から全員の希望を確認してシフトを作成

### 管理者PINの変更
Vercelの環境変数 `ADMIN_PIN` を変更してください（デフォルト: `1234`）。
