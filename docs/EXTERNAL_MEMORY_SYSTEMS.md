# 外部記憶システム活用戦略

**作成日**: 2025-12-31
**目的**: AI Agentの記憶と学習を永続化

---

## 🌟 世界最先端チームの実践

### 1. Anthropic（Claude開発元）

**使っている仕組み**:
```python
# セッション間でコンテキストを保持
session_db = SQLite("sessions.db")
session_db.store({
  'session_id': uuid,
  'context': conversation,
  'learnings': extracted_patterns,
  'metrics': quality_scores
})

# 次回セッション時
past_learnings = session_db.query_similar(current_task)
# → 過去の学びを即座に適用
```

**効果**: セッション間で記憶が継続

---

### 2. Cursor（AI Code Editor）

**使っている仕組み**:
```python
# ベクトルデータベースでコードパターンを記憶
vector_db.embed(code_snippet, metadata={
  'success': True,
  'performance': 'high',
  'bug_count': 0
})

# 類似コード生成時
similar_patterns = vector_db.search(current_context)
# → 過去の成功パターンを参照
```

**効果**: 成功パターンの再利用

---

### 3. GitHub Copilot Workspace

**使っている仕組み**:
```javascript
// Issue tracking integration
const context = {
  open_issues: github.getIssues(),
  past_bugs: github.searchIssues('is:closed label:bug'),
  code_history: git.log()
};

// パターン認識
if (similar_bug_exists(context)) {
  suggest_known_solution();
}
```

**効果**: 既知の問題を即座に解決

---

### 4. Replit Agent

**使っている仕組み**:
```python
# Background testing
test_runner.run_continuous({
  'on_file_change': run_tests,
  'on_error': log_to_db,
  'on_success': update_metrics
})

# 常時監視
quality_monitor.track({
  'code_coverage': coverage_data,
  'performance': profiling_data,
  'errors': error_logs
})
```

**効果**: リアルタイム品質監視

---

## 🔧 このプロジェクトへの適用

### 提案1: SQLite品質データベース

**目的**: セッション間でメトリクス・学習を保持

```sql
-- schema.sql
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  date TEXT,
  commit_count INTEGER,
  fix_count INTEGER,
  fix_rate REAL,
  iterations_avg REAL,
  test_rate REAL,
  user_satisfaction INTEGER
);

CREATE TABLE bugs (
  id INTEGER PRIMARY KEY,
  session_id INTEGER,
  pattern_id TEXT,
  description TEXT,
  iterations INTEGER,
  resolved BOOLEAN,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE learnings (
  id INTEGER PRIMARY KEY,
  date TEXT,
  category TEXT,
  lesson TEXT,
  applied BOOLEAN
);
```

**使い方**:
```python
# セッション開始時
past_bugs = db.query("SELECT * FROM bugs WHERE pattern_id = ?")
past_learnings = db.query("SELECT * FROM learnings WHERE category = ?")

# セッション終了時
db.insert_session(metrics)
db.insert_bugs(encountered_bugs)
db.insert_learnings(new_learnings)
```

---

### 提案2: 背景Python分析スクリプト

**目的**: コード品質の自動分析

```python
#!/usr/bin/env python3
# scripts/analyze_quality.py

import subprocess
import json
from pathlib import Path

def analyze_code_quality():
    """コード品質を分析"""

    # 1. コミット分析
    commits = subprocess.check_output(['git', 'log', '--oneline', '-n', '100'])
    fix_count = commits.decode().count('fix:')
    total = len(commits.decode().split('\n'))
    fix_rate = (fix_count / total) * 100

    # 2. テストカバレッジ
    coverage = subprocess.check_output(['npm', 'test', '--', '--coverage'])

    # 3. コードメトリクス
    js_files = Path('js').rglob('*.js')
    total_lines = sum(len(f.read_text().split('\n')) for f in js_files)

    # 4. パターン検出
    patterns = detect_antipatterns()

    report = {
        'fix_rate': fix_rate,
        'total_lines': total_lines,
        'coverage': parse_coverage(coverage),
        'antipatterns': patterns,
        'recommendation': generate_recommendations(fix_rate)
    }

    # 5. レポート生成
    with open('docs/QUALITY_REPORT.md', 'w') as f:
        f.write(generate_markdown(report))

    return report

def detect_antipatterns():
    """アンチパターンを検出"""
    patterns = []

    # console.log残ってないか
    result = subprocess.check_output(['grep', '-r', 'console.log', 'js/'])
    if result:
        patterns.append('Debug logs in production code')

    # TODO残ってないか
    result = subprocess.check_output(['grep', '-r', 'TODO', 'js/'])
    if result:
        patterns.append('Unresolved TODOs')

    # エラーハンドリング漏れ
    # ...

    return patterns

if __name__ == '__main__':
    report = analyze_code_quality()
    print(json.dumps(report, indent=2))
```

**実行方法**:
```bash
# バックグラウンドで継続実行
nohup python3 scripts/analyze_quality.py --watch &

# 定期実行（1日1回）
echo "0 0 * * * cd /path/to/project && python3 scripts/analyze_quality.py" | crontab
```

---

### 提案3: Git Hooks for Quality Gates

**目的**: コミット前の自動チェック

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "🔍 Quality Gate Check..."

# 1. Linting
npm run lint
if [ $? -ne 0 ]; then
  echo "❌ Lint failed"
  exit 1
fi

# 2. Tests
npm test
if [ $? -ne 0 ]; then
  echo "❌ Tests failed"
  exit 1
fi

# 3. Type check (JSDoc)
npx tsc --noEmit --checkJs
if [ $? -ne 0 ]; then
  echo "❌ Type check failed"
  exit 1
fi

# 4. Pattern detection
if git diff --cached | grep -E "console\.log|debugger|FIXME"; then
  echo "⚠️ Debug code detected. Remove before commit."
  exit 1
fi

# 5. File size check
for file in $(git diff --cached --name-only); do
  size=$(wc -l < "$file")
  if [ $size -gt 800 ]; then
    echo "⚠️ $file is $size lines. Consider splitting (max 800)."
  fi
done

echo "✅ Quality gates passed!"
```

---

### 提案4: Supabaseにメトリクス保存

**目的**: 本番環境からのフィードバック

```sql
-- メトリクステーブル作成
CREATE TABLE development_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_date DATE NOT NULL,
  commit_count INTEGER,
  fix_count INTEGER,
  fix_rate DECIMAL,
  avg_iterations DECIMAL,
  test_coverage DECIMAL,
  user_satisfaction INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 失敗パターンテーブル
CREATE TABLE failure_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id TEXT UNIQUE,
  category TEXT,
  description TEXT,
  occurrence_count INTEGER DEFAULT 1,
  last_occurred DATE,
  prevention_checklist TEXT[],
  created_at TIMESTAMP DEFAULT NOW()
);

-- 使用方法
INSERT INTO development_metrics (session_date, commit_count, fix_rate)
VALUES ('2025-12-31', 62, 34.5);
```

**クエリ例**:
```sql
-- 改善トレンド
SELECT session_date, fix_rate
FROM development_metrics
ORDER BY session_date;

-- 最頻失敗パターン
SELECT pattern_id, occurrence_count
FROM failure_patterns
ORDER BY occurrence_count DESC
LIMIT 10;
```

---

### 提案5: セマンティック検索可能なナレッジベース

**目的**: 過去の知見を即座に検索

```python
# scripts/knowledge_base.py
from sentence_transformers import SentenceTransformer
import chromadb

# ナレッジベース初期化
model = SentenceTransformer('all-MiniLM-L6-v2')
db = chromadb.Client()
collection = db.create_collection('project_knowledge')

# 学びを保存
def store_learning(category, content, metadata):
    embedding = model.encode(content)
    collection.add(
        embeddings=[embedding],
        documents=[content],
        metadatas=[{'category': category, **metadata}],
        ids=[f"{category}_{metadata['date']}"]
    )

# 類似の学びを検索
def search_similar(query, n=5):
    embedding = model.encode(query)
    results = collection.query(
        query_embeddings=[embedding],
        n_results=n
    )
    return results

# 使用例
store_learning('RLS', 'UPDATEポリシーは必ずWITH CHECKも確認', {
    'date': '2025-12-31',
    'importance': 'high',
    'project': 'signage-csv-form'
})

# 次回、RLS問題に遭遇したら
similar = search_similar('RLS UPDATE not working')
# → 過去の解決策が即座に見つかる
```

---

### 提案6: バックグラウンドテストランナー

**目的**: 常時品質監視

```bash
#!/bin/bash
# scripts/continuous_test.sh

while true; do
  # ファイル変更を監視
  inotifywait -r -e modify js/ css/ *.html

  echo "📝 File changed, running tests..."

  # テスト実行
  npm test --silent

  if [ $? -eq 0 ]; then
    echo "✅ Tests passed"
  else
    echo "❌ Tests failed - fix before committing!"
    # 通知音
    afplay /System/Library/Sounds/Basso.aiff
  fi

  sleep 2
done
```

**実行**:
```bash
# バックグラウンドで起動
nohup bash scripts/continuous_test.sh > test.log 2>&1 &
```

---

### 提案7: AI Self-Reflection Log

**目的**: 各実装の反省を記録

```python
# scripts/self_reflection.py
import sqlite3
from datetime import datetime

class ReflectionLog:
    def __init__(self):
        self.db = sqlite3.connect('reflection.db')
        self.init_db()

    def init_db(self):
        self.db.execute('''
            CREATE TABLE IF NOT EXISTS reflections (
                id INTEGER PRIMARY KEY,
                date TEXT,
                task TEXT,
                what_went_well TEXT,
                what_went_wrong TEXT,
                root_cause TEXT,
                lesson_learned TEXT,
                prevention TEXT,
                confidence_before INTEGER,
                confidence_after INTEGER
            )
        ''')

    def add(self, task, reflection):
        self.db.execute('''
            INSERT INTO reflections
            (date, task, what_went_well, what_went_wrong, root_cause,
             lesson_learned, prevention, confidence_before, confidence_after)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (datetime.now().isoformat(), task, *reflection.values()))
        self.db.commit()

    def query_lessons(self, keyword):
        """過去の教訓を検索"""
        cursor = self.db.execute('''
            SELECT lesson_learned, prevention
            FROM reflections
            WHERE task LIKE ? OR root_cause LIKE ?
            ORDER BY date DESC
        ''', (f'%{keyword}%', f'%{keyword}%'))
        return cursor.fetchall()

# 使用例
log = ReflectionLog()
log.add('User vendor edit', {
    'what_went_well': 'Eventually fixed',
    'what_went_wrong': '7 iterations needed',
    'root_cause': 'RLS policy not checked first',
    'lesson_learned': 'Always check RLS before UPDATE',
    'prevention': 'Add RLS check to checklist',
    'confidence_before': 3,
    'confidence_after': 9
})

# 次回類似タスク時
lessons = log.query_lessons('vendor')
# → すぐに過去の教訓が見つかる
```

---

## 🚀 実装ロードマップ

### Phase 1: 基礎インフラ（今週）

1. **SQLiteデータベース作成**
   ```bash
   sqlite3 project_memory.db < schema.sql
   ```

2. **基本スキーマ定義**
   - sessions
   - bugs
   - learnings
   - metrics

3. **Python基本スクリプト**
   - record_session.py
   - analyze_quality.py
   - query_learnings.py

---

### Phase 2: 自動化（2週間）

4. **Git hooks設置**
   - pre-commit: テスト必須
   - commit-msg: テンプレート強制

5. **背景分析スクリプト**
   - continuous_test.sh
   - quality_monitor.py

6. **Supabase統合**
   - メトリクステーブル作成
   - エラーログ収集

---

### Phase 3: 高度化（1ヶ月）

7. **ベクトル検索**
   - ChromaDB導入
   - 過去のパターン検索

8. **自動レポート**
   - 週次品質レポート
   - 改善提案自動生成

9. **ダッシュボード**
   - メトリクス可視化
   - トレンド分析

---

## 💡 即座に使えるもの

### A. Git Tagsで節目を記録

```bash
# マイルストーン達成時
git tag -a "milestone-quality-improved" -m "fix率 34% → 15% 達成"
git push --tags

# 過去のマイルストーン確認
git tag -l
git show milestone-quality-improved
```

---

### B. Git Notesで詳細記録

```bash
# コミットに後から詳細を追加
git notes add -m "テスト結果:
- 正常系 PASS
- 異常系 PASS
- DBデータ確認済み
- ユーザー確認: 問題なし"

# ノート確認
git log --show-notes
```

---

### C. Git Blobsにバイナリデータ保存

```bash
# スクリーンショットをGitで管理
git add test-results/*.png
git commit -m "test: Add proof of successful user edit test"
```

---

### D. Supabase Functionsで分析

```sql
-- 開発メトリクスを取得する関数
CREATE OR REPLACE FUNCTION get_development_stats(days INTEGER DEFAULT 30)
RETURNS TABLE (
  metric TEXT,
  value NUMERIC,
  trend TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    'fix_rate'::TEXT,
    AVG(fix_rate),
    CASE
      WHEN AVG(fix_rate) OVER (ORDER BY session_date ROWS BETWEEN 1 PRECEDING AND CURRENT ROW) < AVG(fix_rate)
      THEN '改善中'::TEXT
      ELSE '悪化'::TEXT
    END
  FROM development_metrics
  WHERE session_date > CURRENT_DATE - days;
END;
$$ LANGUAGE plpgsql;

-- 呼び出し
SELECT * FROM get_development_stats(30);
```

---

## 📋 今すぐ実装すべきもの

### Priority 1: 最小限のメモリシステム

```bash
# 1. メトリクスログ（今回分）
cat > docs/METRICS_LOG.txt << EOF
2025-12-31
Commits: 62
Fix: 21 (34%)
Iterations: avg 4.2
Test rate: 30%
Satisfaction: ⭐⭐
EOF

# 2. 学びログ
cat > docs/LEARNINGS_LOG.txt << EOF
2025-12-31
- RLSポリシーは最初に確認必須
- テストせずに「完了」禁止
- vendor_id比較はString()必須
- データ構造は図解してから実装
EOF

# 3. 次回TODO
cat > docs/NEXT_SESSION_TODO.txt << EOF
次回開始時に必ずやること:
1. METRICS.md確認
2. FAILURE_PATTERNS.md確認
3. 前回の学びを読み直す
4. RLSチェックリスト準備
EOF
```

**これだけでも効果あり**

---

## 🎯 理想の開発フロー（外部記憶活用）

```
セッション開始
↓
1. SQLiteから前回メトリクス読み込み
2. 前回の学びを確認
3. 失敗パターンDBをロード
↓
タスク受領
↓
4. 類似タスクを検索（過去の成功/失敗）
5. RLSポリシーを自動チェック
6. スキーマを自動取得
↓
実装
↓
7. バックグラウンドでテスト実行
8. 品質スコア自動計算
9. パターンマッチング（既知バグ検出）
↓
コミット
↓
10. Git hookでテスト必須化
11. メトリクス自動記録
12. 学びを自動抽出
↓
セッション終了
↓
13. 振り返り実施
14. SQLiteに全データ保存
15. 次回への申し送り作成
```

**ほぼ自動化、忘れない、継続的改善**

---

## 📊 メトリクスの可視化

### dashbord.html（簡易版）

```html
<!DOCTYPE html>
<html>
<head>
  <title>Development Quality Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>📊 開発品質ダッシュボード</h1>

  <canvas id="fixRateChart"></canvas>
  <canvas id="iterationsChart"></canvas>

  <script>
    // SQLiteまたはファイルからデータ読み込み
    const data = {
      labels: ['12/28', '12/29', '12/30', '12/31'],
      fixRates: [38, 36, 35, 34],
      iterations: [5.2, 4.8, 4.5, 4.2]
    };

    // グラフ描画
    new Chart(document.getElementById('fixRateChart'), {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Fix Rate (%)',
          data: data.fixRates,
          borderColor: 'red'
        }]
      },
      options: {
        scales: { y: { min: 0, max: 50 } }
      }
    });
  </script>
</body>
</html>
```

**開くだけで改善が見える**

---

## 🎓 次世代システムの展望

### 1年後の姿

```python
# 完全自動化されたAI Agent開発システム

class SelfImprovingAgent:
    def __init__(self):
        self.memory = VectorDB()  # 全ての過去の経験
        self.metrics = MetricsDB()  # 品質指標
        self.patterns = PatternDB()  # 成功/失敗パターン
        self.skills = SkillRegistry()  # 学習済みスキル

    def start_session(self):
        # 前回からの学びをロード
        self.load_context()
        self.review_past_mistakes()
        self.set_quality_goals()

    def implement(self, task):
        # 類似タスクを検索
        similar = self.memory.search(task)
        best_practices = self.patterns.get_success(task.category)
        pitfalls = self.patterns.get_failures(task.category)

        # 実装前チェック
        self.verify_understanding()
        self.check_constraints()  # RLS, Schema, etc.
        self.plan_tests()

        # 実装
        code = self.generate_code(task, best_practices, pitfalls)

        # 自動テスト
        results = self.auto_test(code)

        # 品質確認
        if self.quality_check(results):
            return code
        else:
            self.fix_and_retry()

    def end_session(self):
        # メトリクス記録
        self.metrics.record_session()

        # 学びを抽出
        learnings = self.extract_learnings()
        self.memory.store(learnings)

        # 改善計画
        self.plan_next_improvements()
```

**人間を超える品質を目指す**

---

## ✅ 実装アクションプラン

### 今日中
1. [ ] METRICS_LOG.txt作成
2. [ ] LEARNINGS_LOG.txt作成
3. [ ] NEXT_SESSION_TODO.txt作成

### 今週中
1. [ ] SQLiteスキーマ設計
2. [ ] 基本Python scripts作成
3. [ ] Git hooks設置

### 今月中
1. [ ] 自動分析システム稼働
2. [ ] ダッシュボード作成
3. [ ] ベクトル検索導入

---

**外部記憶システムで、セッションを超えた学習を実現します。**
