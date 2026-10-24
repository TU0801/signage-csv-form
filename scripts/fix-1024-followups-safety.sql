-- 修正依頼1024 後続 担当 safety: 点検報告書の表から、使っていない書き込み権限を外す
-- 2026-10-24 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、表のロックが取れないときは待ち続けずに失敗させる。
-- 何度流しても同じ結果になる（冪等）。
--
-- 本番の今の権限（2026-10-24 に読み取りで確認。pg_class.relacl）:
--   {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--   signage スキーマの default privileges で、anon・authenticated に INSERT / UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER まで付いている。
--   書き込みを止めているのは RLS（ポリシーは SELECT の "Scoped members can read inspection reports" だけ）で、
--   TRUNCATE は RLS の対象外なので、authenticated の誰でも表を空にできる状態だった。
-- アプリの書き込みはすべて SECURITY DEFINER の RPC（portal_register_report / portal_update_report / portal_review_report、
-- 所有者 postgres）経由で、表へ直接書くクライアントは無い（v2/src は lib/api/portal.ts fetchInspectionReports の select だけ。
-- supabase/functions・v1 js/ は表を参照しない）。なので読み取りだけを残す。
--
-- 戻し手順（本番の元の状態へ）:
--   GRANT ALL ON signage.signage_inspection_reports TO anon, authenticated, service_role;

SET lock_timeout = '5s';

REVOKE ALL ON signage.signage_inspection_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON signage.signage_inspection_reports TO authenticated;
GRANT ALL ON signage.signage_inspection_reports TO service_role;
