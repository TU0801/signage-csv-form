-- 修正依頼1024 本番確認の不具合⑦の残り: 管理会社アカウントのエラーログが保存されない
-- 2026-10-25 作成。適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。何度流しても同じ結果になる。
--
-- 原因: signage.signage_error_logs の INSERT ポリシー authenticated_insert は signage.is_active_member()（role が admin か user）
--   だけを通す。2026-10-21 の点検ポータルで足した管理会社（role='management'）は入っていないので、管理会社の画面のエラーは
--   42501 で拒否され、連番だけが進んで行は残らない（ローカルで再現: 管理会社の JWT で POST → 403、id が欠番になる）。
-- 対応: 既存のポリシーは変えず、管理会社用の INSERT ポリシーを追加する（条件は既存と同じく本人の行か user_id なし）。
--   読み取り（admin_select）は今どおり管理者だけ。
--
-- 戻し方: DROP POLICY IF EXISTS mgmt_insert ON signage.signage_error_logs;

SET lock_timeout = '5s';

DROP POLICY IF EXISTS mgmt_insert ON signage.signage_error_logs;
CREATE POLICY mgmt_insert ON signage.signage_error_logs
  FOR INSERT TO authenticated
  WITH CHECK (signage.is_active_management() AND ((user_id IS NULL) OR (user_id = auth.uid())));
