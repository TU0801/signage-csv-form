---
name: file-structure
description: プロジェクトのファイル構成と各ファイルの役割。ファイル探索時に参照。
allowed-tools: Read, Glob, Grep
---

# ファイル構成

```
signage-csv-form/
├── index.html / bulk.html / admin.html / login.html
├── css/style.css, bulk.css
├── js/
│   ├── config.js, version.js, supabase-client.js
│   ├── script.js (1件入力), admin.js, admin-masters.js, admin-settings.js
│   └── bulk.js, bulk-state.js, bulk-table.js, bulk-data.js, bulk-modals.js
├── docs/
│   ├── SPECIFICATION.md, FAILURE_PATTERNS.md, METRICS.md
│   ├── NEXT_SESSION_TODO.txt, QUALITY_REVIEW_2026-03-01.md
│   └── issues/
├── tests/ (Playwright E2E)
├── supabase/ (スキーマ・マイグレーション)
└── .claude/skills/
```

## ルール
- 1ファイル500行以下目標、800行超で分割検討
- テスト命名: XX-機能名.spec.js
