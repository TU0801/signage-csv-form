# Signage CSV Form 開発指示書

---

## 背景・経緯

### 現状のシステム

このプロジェクトは、マンション点検・工事案内用のCSV生成Webアプリケーション。既存のExcelマクロファイル（`CSV作成用.xlsm`）をWeb化したもので、以下の機能を持つ：

- 物件・端末選択（27物件、複数端末）
- 受注先選択（4業者、緊急連絡先自動取得）
- 点検工事案内選択（39種類）
- 日時設定、プレビュー表示
- CSV生成・ダウンロード

現在はGitHub Pagesでホスティングされており、バニラHTML/CSS/JavaScriptで実装されている。

### お客さんの課題・要望

**課題:**
- お客さんはこのWebフォームを複数のユーザー（30〜50人、複数の会社）に展開して入力してもらい、CSVを受け取るフローで運用している
- **ユーザーが1件1件入力するのが大変**という声が上がっている
- 「Excelのように入力できたらいいのに」という要望があった

**制約:**
- ITに疎いユーザーがCSVを直接触るのは危険（フォーマット崩れ、不正データ混入のリスク）
- サイネージに取り込むデータなので、**バリデーションが必須**
- マスターデータ（物件、受注先、点検種別）に基づいた入力制御が必要

### 検討した選択肢

| 選択肢 | 検討結果 |
|--------|----------|
| Excel + Power Query | マスター更新が面倒、バリデーション弱い、VBA依存 → 却下 |
| Webスプレッドシート風UI | マスター常に最新、バリデーション完全制御、環境不問 → **採用** |
| デスクトップアプリ | インストール必要、更新配布が面倒 → 却下 |

### ホスティング・バックエンドの検討

| 選択肢 | 検討結果 |
|--------|----------|
| GitHub Pages + SQLite | GitHub Pagesはサーバーサイド不可 → 却下 |
| Railway / Render | 無料枠に時間制限（500〜750時間/月）→ 常時起動だと月末に止まる → 却下 |
| Supabase | 認証・DB・API全部揃い、GitHub Pagesのままでクライアントサイドから直接利用可能 → **採用** |

**Supabaseを選んだ理由:**
- サーバーサイド言語（Node.js等）不要でブラウザから直接API呼び出し可能
- 認証機能が組み込み
- RLS（Row Level Security）でユーザーごとのアクセス制御が可能
- 既存のSupabaseプロジェクト（無料枠）を流用できる

### ユーザーが本当に欲しいもの

1. **マスターデータに基づいた入力制御** - 物件、端末、受注先、点検種別をドロップダウンで選択
2. **リアルタイムバリデーション** - 不正データをサイネージに入れさせない
3. **一括入力（複数行を効率的に入力）** - Excelのようなスプレッドシート風UI
4. **複数ユーザーのデータを一元管理** - 管理者が全ユーザーの入力データを確認・CSVダウンロード

### 決定事項

- **1件入力**と**一括入力**を選べるようにする（別URLでもOK）
- データは**サーバー（Supabase）に保存**
- 複数ユーザー/会社が入力したものを**管理者が一つのデータとして見れる**
- **ユーザー数: 30〜50人**
- **認証: メール/パスワード**（管理者がパスワードを発行してユーザーに配布）
- **マスターデータ更新: 管理者がWeb画面から**
- **承認フロー: 不要**（ユーザー入力で確定）
- **既存Supabaseプロジェクトを流用**、テーブル名に `signage_` プレフィックスをつけて分離

---

## プロジェクト概要

マンション点検・工事案内用のCSV生成Webアプリケーションに、以下の機能を追加する：
- ユーザー認証（ログイン機能）
- データベース保存（Supabase）
- 一括入力UI（スプレッドシート風）
- 管理者画面

## 技術スタック

- **フロントエンド**: バニラHTML/CSS/JavaScript（既存継続）
- **バックエンド**: Supabase（BaaS）
  - 認証: Supabase Auth
  - データベース: PostgreSQL
  - API: 自動生成REST API
- **ホスティング**: GitHub Pages（フロントのみ）
- **テスト**: Playwright E2E

## Supabase設定

既存のSupabaseプロジェクトを使用する。
テーブル名には `signage_` プレフィックスをつけて、他データと分離する。

### 環境変数（.env.example）

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

---

## Phase 1: Supabaseテーブル作成

### 1.1 テーブル設計SQL

以下のSQLをSupabaseのSQL Editorで実行する。

```sql
-- ========================================
-- signage_profiles: ユーザープロファイル
-- ========================================
CREATE TABLE signage_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  company_name TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 新規ユーザー登録時に自動でプロファイル作成するトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.signage_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ========================================
-- signage_entries: 点検データ（メイン）
-- ========================================
CREATE TABLE signage_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_code TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  emergency_contact TEXT,
  inspection_type TEXT NOT NULL,
  template_no TEXT,
  inspection_start DATE,
  inspection_end DATE,
  display_start_date DATE,
  display_start_time TEXT,
  display_end_date DATE,
  display_end_time TEXT,
  display_duration INTEGER DEFAULT 10,
  announcement TEXT,
  remarks TEXT,
  poster_type TEXT DEFAULT 'template' CHECK (poster_type IN ('template', 'custom')),
  poster_position TEXT DEFAULT '4',
  frame_no TEXT DEFAULT '1',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_signage_entries_updated_at
  BEFORE UPDATE ON signage_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- signage_master_properties: 物件マスター
-- ========================================
CREATE TABLE signage_master_properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_code TEXT NOT NULL UNIQUE,
  property_name TEXT NOT NULL,
  terminals JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- signage_master_vendors: 受注先マスター
-- ========================================
CREATE TABLE signage_master_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name TEXT NOT NULL UNIQUE,
  emergency_contact TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- signage_master_inspection_types: 点検種別マスター
-- ========================================
CREATE TABLE signage_master_inspection_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_name TEXT NOT NULL UNIQUE,
  template_no TEXT NOT NULL,
  template_image TEXT,
  default_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- Row Level Security (RLS) 設定
-- ========================================

-- signage_profiles
ALTER TABLE signage_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON signage_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON signage_profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON signage_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- signage_entries
ALTER TABLE signage_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own entries"
  ON signage_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entries"
  ON signage_entries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entries"
  ON signage_entries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entries"
  ON signage_entries FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all entries"
  ON signage_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all entries"
  ON signage_entries FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete all entries"
  ON signage_entries FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- マスターデータ（誰でも読み取り可能）
ALTER TABLE signage_master_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_master_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE signage_master_inspection_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read properties"
  ON signage_master_properties FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read vendors"
  ON signage_master_vendors FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read inspection_types"
  ON signage_master_inspection_types FOR SELECT
  USING (true);

-- 管理者のみマスターデータ更新可能
CREATE POLICY "Admins can manage properties"
  ON signage_master_properties FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage vendors"
  ON signage_master_vendors FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage inspection_types"
  ON signage_master_inspection_types FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM signage_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

### 1.2 マスターデータ投入SQL

```sql
-- ========================================
-- 受注先マスターデータ
-- ========================================
INSERT INTO signage_master_vendors (vendor_name, emergency_contact) VALUES
  ('山本クリーンシステム', '092-XXX-XXXX'),
  ('日本オーチス・エレベータ', '0120-XXX-XXX'),
  ('えん建物管理', '092-XXX-XXXX'),
  ('西日本ビルテクノサービス', '092-XXX-XXXX');

-- ========================================
-- 物件マスターデータ
-- ========================================
INSERT INTO signage_master_properties (property_code, property_name, terminals) VALUES
  ('2010', 'エンクレストガーデン福岡', '["センター棟", "イースト棟", "ウエスト棟", "サウス棟"]'),
  ('2020', 'アソシアグロッツォ博多', '["本館"]'),
  ('2030', 'エンクレスト天神STAGE', '["本館"]'),
  ('2040', 'エンクレストネオ博多駅南', '["本館"]'),
  ('2050', 'エンクレスト博多駅東', '["本館"]'),
  ('2060', 'ラフィネス博多', '["本館"]'),
  ('2070', 'エンクレスト博多LIBERTY', '["本館"]'),
  ('2080', 'LANDIC K-01', '["本館"]'),
  ('2090', 'エンクレスト大濠公園', '["本館"]'),
  ('2100', 'エンクレスト赤坂', '["Ａ棟", "Ｂ棟"]'),
  ('2110', 'エンクレスト薬院', '["本館"]'),
  ('2120', 'エンクレスト天神南PURE', '["本館"]'),
  ('2130', 'エンクレスト博多Rey', '["本館"]'),
  ('2140', 'エンクレスト中洲川端駅前', '["本館"]'),
  ('2150', 'エンクレスト博多GATE', '["本館"]'),
  ('2160', 'エンクレスト博多Belle', '["本館"]');

-- ========================================
-- 点検種別マスターデータ（39種類）
-- ========================================
INSERT INTO signage_master_inspection_types (inspection_name, template_no, template_image, default_text) VALUES
  ('エレベーター定期点検', '1', 'elevator_inspection.png', 'エレベーターの定期点検を実施いたします。'),
  ('建築設備定期点検', '2', 'building_inspection.png', '建築設備の定期点検を実施いたします。'),
  ('機械式駐車場点検', '3', 'mechanical_parking.png', '機械式駐車場の点検を実施いたします。'),
  ('消防設備点検', '4', 'fire_equipment.png', '消防設備の点検を実施いたします。'),
  ('消防設備工事', '5', 'fire_construction.png', '消防設備の工事を実施いたします。'),
  ('特定建築物定期調査', '6', 'building_survey.png', '特定建築物の定期調査を実施いたします。'),
  ('給水ポンプ点検', '7', 'water_pump.png', '給水ポンプの点検を実施いたします。'),
  ('排水管清掃', '8', 'drain_cleaning.png', '排水管の清掃を実施いたします。'),
  ('貯水槽清掃', '9', 'water_tank.png', '貯水槽の清掃を実施いたします。'),
  ('定期清掃', '10', 'cleaning.png', '定期清掃を実施いたします。'),
  ('特別清掃', '11', 'special_cleaning.png', '特別清掃を実施いたします。'),
  ('ガス設備定期点検', '12', 'gas_inspection.png', 'ガス設備の定期点検を実施いたします。'),
  ('電気設備点検', '13', 'electrical_inspection.png', '電気設備の点検を実施いたします。'),
  ('防犯カメラ点検', '14', 'security_camera.png', '防犯カメラの点検を実施いたします。'),
  ('自動ドア点検', '15', 'auto_door.png', '自動ドアの点検を実施いたします。'),
  ('宅配ボックス点検', '16', 'delivery_box.png', '宅配ボックスの点検を実施いたします。'),
  ('インターホン点検', '17', 'intercom.png', 'インターホンの点検を実施いたします。'),
  ('空調設備点検', '18', 'air_conditioning.png', '空調設備の点検を実施いたします。'),
  ('受水槽点検', '19', 'receiving_tank.png', '受水槽の点検を実施いたします。'),
  ('雑排水槽清掃', '20', 'wastewater_tank.png', '雑排水槽の清掃を実施いたします。'),
  ('植栽の消毒作業', '21', 'disinfection_tree.png', '植栽の消毒作業を実施いたします。'),
  ('植栽剪定', '22', 'tree_pruning.png', '植栽の剪定を実施いたします。'),
  ('外壁点検', '23', 'exterior_wall.png', '外壁の点検を実施いたします。'),
  ('屋上点検', '24', 'rooftop.png', '屋上の点検を実施いたします。'),
  ('共用灯LED化工事', '25', 'led_construction.png', '共用灯のLED化工事を実施いたします。'),
  ('駐輪場整理', '26', 'bicycle_arrangement.png', '駐輪場の整理を実施いたします。'),
  ('放置自転車撤去', '27', 'bicycle_removal.png', '放置自転車の撤去を実施いたします。'),
  ('館内一斉清掃', '28', 'building_cleaning.png', '館内の一斉清掃を実施いたします。'),
  ('ゴミ置場清掃', '29', 'garbage_area.png', 'ゴミ置場の清掃を実施いたします。'),
  ('害虫駆除', '30', 'pest_control.png', '害虫駆除を実施いたします。'),
  ('鳩対策', '31', 'pigeon_control.png', '鳩対策を実施いたします。'),
  ('簡易専用水道検査', '32', 'water_inspection.png', '簡易専用水道の検査を実施いたします。'),
  ('漏水調査', '33', 'leak_inspection.png', '漏水調査を実施いたします。'),
  ('外構補修工事', '34', 'exterior_repair.png', '外構の補修工事を実施いたします。'),
  ('塗装工事', '35', 'painting.png', '塗装工事を実施いたします。'),
  ('防水工事', '36', 'waterproofing.png', '防水工事を実施いたします。'),
  ('アンケート', '37', 'questionnaire.png', 'アンケートのお願いです。'),
  ('お知らせ', '38', 'notice.png', 'お知らせです。'),
  ('その他', '39', 'other.png', '');

-- ========================================
-- 初期管理者ユーザーの設定（Supabase Authでユーザー作成後に実行）
-- ========================================
-- 管理者のUUIDを取得して実行
-- UPDATE signage_profiles SET role = 'admin' WHERE email = 'admin@example.com';
```

---

## Phase 2: ファイル構成

```
signage-csv-form/
├── index.html              # 1件入力（既存改修）
├── bulk.html               # 一括入力（新規）
├── admin.html              # 管理者画面（新規）
├── login.html              # ログイン画面（新規）
├── css/
│   ├── style.css           # 既存スタイル
│   └── bulk.css            # 一括入力用スタイル（新規）
├── js/
│   ├── script.js           # 既存スクリプト（改修）
│   ├── supabase-client.js  # Supabase初期化（新規）
│   ├── auth.js             # 認証処理（新規）
│   ├── bulk.js             # 一括入力処理（新規）
│   └── admin.js            # 管理者画面処理（新規）
├── .env.example            # 環境変数サンプル（新規）
└── supabase/
    └── schema.sql          # テーブル定義SQL（新規）
```

---

## Phase 3: 各画面の実装仕様

### 3.1 ログイン画面 (login.html)

**機能:**
- メールアドレス/パスワードでログイン
- ログイン成功後、index.htmlにリダイレクト
- 管理者がユーザー作成（Supabase管理画面で実施）

**UI要素:**
- メールアドレス入力
- パスワード入力
- ログインボタン
- エラーメッセージ表示

**処理フロー:**
```
1. メール/パスワード入力
2. supabase.auth.signInWithPassword()
3. 成功 → localStorage にセッション保存 → index.html へ
4. 失敗 → エラーメッセージ表示
```

### 3.2 1件入力画面 (index.html) - 既存改修

**追加機能:**
- ログインチェック（未ログインならlogin.htmlへ）
- マスターデータをSupabaseから取得
- 保存先をSupabaseに変更
- ログアウトボタン追加

**改修ポイント:**
- `PROPERTIES`, `VENDORS`, `INSPECTION_TYPES` をSupabaseから取得
- データ追加時に `signage_entries` テーブルにINSERT
- CSVダウンロードはSupabaseのデータから生成

### 3.3 一括入力画面 (bulk.html) - 新規

**UI:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  点検CSV一括入力                               [ログアウト]          │
├──────────────────────────────────────────────────────────────────────┤
│ [+ 行追加] [選択行を削除] [Excelから貼り付け]    登録件数: 5件      │
├────┬────────┬────────┬──────────┬─────────────────┬────────┬────────┤
│ ☑ │物件    │ 端末   │  受注先  │  点検種別       │開始日  │ 状態   │
├────┼────────┼────────┼──────────┼─────────────────┼────────┼────────┤
│ ☐ │ ▼ 2010│ ▼ A棟  │ ▼ 山本..│ ▼ エレベーター..│01/15   │ ✓ OK  │
│ ☐ │ ▼ 2020│ ▼ 本館 │ ▼ 日本..│ ▼ 機械式駐車場..│01/20   │ ✓ OK  │
│ ☐ │ ▼ 2030│ ▼      │ ▼ えん..│ ▼ 定期清掃     │        │ ⚠ 未入力│
└────┴────────┴────────┴──────────┴─────────────────┴────────┴────────┘
│                                                                      │
│ [一括保存]                           [CSVダウンロード] [CSVコピー]   │
└──────────────────────────────────────────────────────────────────────┘
```

**機能:**
- 行の追加/削除
- ドロップダウンでマスターデータから選択
- 物件選択時に端末IDを絞り込み
- 受注先選択時に緊急連絡先を自動設定
- セルごとのバリデーション
- エラー行はCSV出力から除外
- Excelからのコピペ対応（Tab区切り）

**データフロー:**
```
1. マスターデータをSupabaseから取得
2. 行を追加/編集
3. リアルタイムバリデーション
4. [一括保存] → signage_entries に複数INSERT
5. [CSVダウンロード] → 既存と同じフォーマットでCSV生成
```

### 3.4 管理者画面 (admin.html) - 新規

**タブ構成:**
1. **データ一覧** - 全ユーザーの入力データ確認
2. **CSVエクスポート** - 期間/物件でフィルタしてCSVダウンロード
3. **マスター管理** - 物件/受注先/点検種別の追加・編集
4. **ユーザー管理** - ユーザー一覧・権限変更

**データ一覧タブ:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ フィルタ: [物件▼] [期間: ___〜___] [会社名▼]        [検索]          │
├──────────────────────────────────────────────────────────────────────┤
│ 登録者    │ 物件      │ 点検種別        │ 開始日   │ 登録日時       │
├───────────┼───────────┼─────────────────┼──────────┼────────────────┤
│ user1@... │ 2010      │ エレベーター... │ 01/15    │ 2025/01/10     │
│ user2@... │ 2020      │ 機械式駐車場... │ 01/20    │ 2025/01/11     │
└───────────┴───────────┴─────────────────┴──────────┴────────────────┘
│                                        [選択したデータをCSVダウンロード] │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Phase 4: Supabase連携JS (supabase-client.js)

```javascript
// supabase-client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 認証状態の取得
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ログイン
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

// ログアウト
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ユーザープロファイル取得
export async function getProfile() {
  const user = await getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('signage_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
}

// 管理者チェック
export async function isAdmin() {
  const profile = await getProfile();
  return profile?.role === 'admin';
}

// マスターデータ取得
export async function getMasterProperties() {
  const { data, error } = await supabase
    .from('signage_master_properties')
    .select('*')
    .order('property_code');
  if (error) throw error;
  return data;
}

export async function getMasterVendors() {
  const { data, error } = await supabase
    .from('signage_master_vendors')
    .select('*')
    .order('vendor_name');
  if (error) throw error;
  return data;
}

export async function getMasterInspectionTypes() {
  const { data, error } = await supabase
    .from('signage_master_inspection_types')
    .select('*')
    .order('template_no');
  if (error) throw error;
  return data;
}

// 点検データCRUD
export async function getEntries() {
  const { data, error } = await supabase
    .from('signage_entries')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createEntry(entry) {
  const user = await getUser();
  const { data, error } = await supabase
    .from('signage_entries')
    .insert({ ...entry, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createEntries(entries) {
  const user = await getUser();
  const entriesWithUser = entries.map(e => ({ ...e, user_id: user.id }));
  const { data, error } = await supabase
    .from('signage_entries')
    .insert(entriesWithUser)
    .select();
  if (error) throw error;
  return data;
}

export async function updateEntry(id, entry) {
  const { data, error } = await supabase
    .from('signage_entries')
    .update(entry)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEntry(id) {
  const { error } = await supabase
    .from('signage_entries')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// 管理者用: 全データ取得
export async function getAllEntries(filters = {}) {
  let query = supabase
    .from('signage_entries')
    .select(`
      *,
      signage_profiles!inner(email, company_name)
    `)
    .order('created_at', { ascending: false });

  if (filters.propertyCode) {
    query = query.eq('property_code', filters.propertyCode);
  }
  if (filters.startDate) {
    query = query.gte('inspection_start', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('inspection_start', filters.endDate);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

---

## Phase 5: 認証処理 (auth.js)

```javascript
// auth.js
import { supabase, getUser, signIn, signOut, getProfile, isAdmin } from './supabase-client.js';

// ページ読み込み時の認証チェック
export async function requireAuth() {
  const user = await getUser();
  if (!user) {
    window.location.href = '/login.html';
    return null;
  }
  return user;
}

// 管理者専用ページのチェック
export async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;

  const admin = await isAdmin();
  if (!admin) {
    alert('管理者権限が必要です');
    window.location.href = '/index.html';
    return null;
  }
  return user;
}

// ログインフォーム処理
export async function handleLogin(email, password) {
  try {
    await signIn(email, password);
    window.location.href = '/index.html';
  } catch (error) {
    throw new Error('ログインに失敗しました: ' + error.message);
  }
}

// ログアウト処理
export async function handleLogout() {
  await signOut();
  window.location.href = '/login.html';
}

// セッション監視
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    window.location.href = '/login.html';
  }
});
```

---

## Phase 6: テスト仕様

### 6.1 認証テスト (tests/auth.spec.js)

```javascript
test.describe('認証機能', () => {
  test('未ログインでindex.htmlにアクセスするとlogin.htmlにリダイレクト', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page).toHaveURL(/login\.html/);
  });

  test('正しい認証情報でログインできる', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'password123');
    await page.click('#login-button');
    await expect(page).toHaveURL(/index\.html/);
  });

  test('間違った認証情報でエラーが表示される', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'wrongpassword');
    await page.click('#login-button');
    await expect(page.locator('.error-message')).toBeVisible();
  });

  test('ログアウトするとlogin.htmlにリダイレクト', async ({ page }) => {
    // ログイン後
    await page.click('#logout-button');
    await expect(page).toHaveURL(/login\.html/);
  });
});
```

### 6.2 一括入力テスト (tests/bulk.spec.js)

```javascript
test.describe('一括入力機能', () => {
  test.beforeEach(async ({ page }) => {
    // ログイン処理
  });

  test('行を追加できる', async ({ page }) => {
    await page.goto('/bulk.html');
    await page.click('#add-row-button');
    await expect(page.locator('tr.data-row')).toHaveCount(1);
  });

  test('物件を選択すると端末が絞り込まれる', async ({ page }) => {
    await page.goto('/bulk.html');
    await page.click('#add-row-button');
    await page.selectOption('.property-select', '2010');
    const terminals = await page.locator('.terminal-select option').allTextContents();
    expect(terminals).toContain('センター棟');
  });

  test('必須項目未入力でエラー表示', async ({ page }) => {
    await page.goto('/bulk.html');
    await page.click('#add-row-button');
    await page.click('#save-button');
    await expect(page.locator('.error-indicator')).toBeVisible();
  });

  test('一括保存でデータがDBに保存される', async ({ page }) => {
    await page.goto('/bulk.html');
    // データ入力
    await page.click('#save-button');
    await expect(page.locator('.success-message')).toBeVisible();
  });

  test('CSVダウンロードで正しいフォーマットが出力される', async ({ page }) => {
    await page.goto('/bulk.html');
    // データ入力
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#download-csv-button'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
```

### 6.3 管理者画面テスト (tests/admin.spec.js)

```javascript
test.describe('管理者画面', () => {
  test('一般ユーザーはアクセスできない', async ({ page }) => {
    // 一般ユーザーでログイン
    await page.goto('/admin.html');
    await expect(page).toHaveURL(/index\.html/);
  });

  test('管理者は全ユーザーのデータが見える', async ({ page }) => {
    // 管理者でログイン
    await page.goto('/admin.html');
    await expect(page.locator('table tbody tr')).toHaveCount.above(0);
  });

  test('フィルタでデータを絞り込める', async ({ page }) => {
    await page.goto('/admin.html');
    await page.selectOption('#filter-property', '2010');
    await page.click('#search-button');
    // 結果確認
  });

  test('CSVエクスポートできる', async ({ page }) => {
    await page.goto('/admin.html');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-csv-button'),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
```

---

## Phase 7: デプロイ手順

### 7.1 Supabase設定

1. Supabaseダッシュボードでプロジェクトを開く
2. SQL Editor で `schema.sql` を実行
3. SQL Editor でマスターデータ投入SQLを実行
4. Authentication > Users で管理者ユーザーを作成
5. SQL Editor で管理者のroleを更新:
   ```sql
   UPDATE signage_profiles SET role = 'admin' WHERE email = 'admin@example.com';
   ```
6. Settings > API から URL と anon key をコピー

### 7.2 フロントエンド設定

1. `js/supabase-client.js` の `SUPABASE_URL` と `SUPABASE_ANON_KEY` を設定
2. GitHub Pagesにデプロイ

### 7.3 テスト実行

```bash
# ローカルサーバー起動
npm run serve

# テスト実行
npm test

# ブラウザ表示付きテスト
npm run test:headed
```

---

## 注意事項

1. **セキュリティ**: `SUPABASE_ANON_KEY` はクライアントサイドに公開されるが、RLSで保護されているため問題ない

2. **マスターデータ**: 緊急連絡先などの実際の値は、本番環境で正しい値に置き換えること

3. **画像ファイル**: 点検種別の画像は既存の `images/` フォルダのものを使用

4. **既存フォームとの互換性**: CSVフォーマットは既存と完全に同一にすること

---

## 作業チェックリスト

- [ ] Supabaseでテーブル作成
- [ ] Supabaseでマスターデータ投入
- [ ] Supabaseで管理者ユーザー作成
- [ ] login.html 作成
- [ ] bulk.html 作成
- [ ] admin.html 作成
- [ ] supabase-client.js 作成
- [ ] auth.js 作成
- [ ] bulk.js 作成
- [ ] admin.js 作成
- [ ] 既存 index.html 改修
- [ ] 既存 script.js 改修
- [ ] bulk.css 作成
- [ ] E2Eテスト作成
- [ ] テスト実行・修正
- [ ] GitHub Pagesデプロイ
- [ ] 動作確認

---

## 参考: 既存マスターデータの場所

現在のマスターデータは `js/script.js` 内の以下の変数に定義されている：
- `PROPERTIES`: 物件・端末データ
- `VENDORS`: 受注先データ
- `INSPECTION_TYPES`: 点検種別データ

これらを参照してSupabaseのマスターデータを作成すること。
