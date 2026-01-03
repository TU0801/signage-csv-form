-- ========================================
-- Migration 001: ステータスを3段階に変更
-- ========================================
-- 実行日: 2026-01-03
-- 目的: draft/submitted → draft/ready/exported に変更
-- ⚠️ 実行前に必ずバックアップを取得してください

-- ========================================
-- Step 1: 既存データ確認
-- ========================================

SELECT
    status,
    COUNT(*) as count
FROM signage_entries
GROUP BY status
ORDER BY status;

-- 期待される結果:
-- draft: X件
-- submitted: Y件
-- exported: Z件（制約違反の可能性あり）

-- ========================================
-- Step 2: 制約削除
-- ========================================

ALTER TABLE signage_entries
  DROP CONSTRAINT IF EXISTS signage_entries_status_check;

-- ========================================
-- Step 3: 既存データ移行
-- ========================================

-- submitted → ready に変更
UPDATE signage_entries
SET status = 'ready'
WHERE status = 'submitted';

-- 移行結果確認
SELECT
    status,
    COUNT(*) as count
FROM signage_entries
GROUP BY status
ORDER BY status;

-- 期待される結果:
-- draft: X件
-- ready: Y件（旧 submitted）
-- exported: Z件

-- ========================================
-- Step 4: 新制約追加
-- ========================================

ALTER TABLE signage_entries
  ADD CONSTRAINT signage_entries_status_check
  CHECK (status IN ('draft', 'ready', 'exported'));

-- ========================================
-- Step 5: 最終検証
-- ========================================

-- 制約確認
SELECT
    conname,
    pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'signage_entries_status_check';

-- データ確認
SELECT
    status,
    COUNT(*) as count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM signage_entries
GROUP BY status
ORDER BY status;

-- ========================================
-- ロールバック手順（問題が発生した場合）
-- ========================================

-- ROLLBACK SCRIPT (DO NOT EXECUTE unless needed):
/*
-- 1. 新制約削除
ALTER TABLE signage_entries
  DROP CONSTRAINT IF EXISTS signage_entries_status_check;

-- 2. データを元に戻す
UPDATE signage_entries
SET status = 'submitted'
WHERE status = 'ready';

-- 3. 旧制約復元
ALTER TABLE signage_entries
  ADD CONSTRAINT signage_entries_status_check
  CHECK (status IN ('draft', 'submitted'));
*/
