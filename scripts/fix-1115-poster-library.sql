-- 修正依頼1115 (6): 貼紙ライブラリの「＋貼紙を登録」した分を削除できるようにする（RPC signage.delete_poster_library_item）
-- 2026-11-16 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた（scripts/test-fix-1115-poster-library.sql）。
--
-- 目的: 貼紙ライブラリ（signage.signage_poster_library）は今まで無効にするだけで、行を消す手段が無かった（DELETE の GRANT・ポリシーが無い）。
--   申請で使われていない貼紙に限って、行を消せるようにする。表への DELETE の GRANT・ポリシーは足さず、判定はこの RPC に閉じ込める。
--   - 呼べるのは、有効な管理者（全件）と、有効な管理会社（自社分＝management_company_id が自社のものだけ。全社共通・他社分は不可）。
--     見つからない行・範囲外の行は同じ 42501 で断る（他社の行があるかどうかを漏らさない）。
--   - 申請（signage_entries）の 1枚目 poster_image がこの行の image_url と同じ（? 以降は無視）、または extra_posters に
--     library_id がこの行の要素（image_url が同じ要素も含める）があれば、23503「申請で使われているため削除できません。無効にしてください」。
--     （行を消すと、その申請の物件コード・user_id を後で変えたときに guard_entry_posters の確かめで保存が止まるため）
--   - 消したら storage_path を返す。画面はそのあと discardLibraryImage(storage_path) でファイルを片付ける
--     （Storage の管理会社用 DELETE ポリシーは poster_library_object_in_use で行が残っている間は消させない作りなので、行を先に消す）。
--   - 行は FOR UPDATE で取ってから判定する（同じ行の同時更新・同時削除と重ならない）。申請の新規 INSERT との同時実行は止めない
--     （guard_entry_posters はライブラリの行を読むだけ。重なったときは申請側に行の無い参照が残りうる。頻度は低いので許容）。
--
-- 権限: SECURITY DEFINER・search_path 固定。REVOKE ALL FROM PUBLIC, anon。GRANT EXECUTE TO authenticated, service_role。
-- 適用方法: ファイル全体を1つのクエリとして流す（psql なら psql -1 -f）。BEGIN/COMMIT は付けない。何度流しても同じ結果になる。
-- 適用順: fix-1115-templates.sql の後（依存は無いが、修正依頼1115 の SQL は templates を最初に当てる）。加算的なので、画面のデプロイより前に当てる。
--
-- 戻し手順:
--   DROP FUNCTION IF EXISTS signage.delete_poster_library_item(uuid);
--   NOTIFY pgrst, 'reload schema';
--   （消した行は戻らない。戻すと画面の「削除」が「関数がありません」で失敗するので、画面も前の版に戻す）

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION signage.delete_poster_library_item(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  v_lib signage.signage_poster_library;
  v_url text;
BEGIN
  SELECT * INTO v_lib FROM signage.signage_poster_library WHERE id = p_id FOR UPDATE;
  IF NOT FOUND
     OR NOT (signage.is_active_admin()
             OR (signage.is_active_management()
                 AND v_lib.management_company_id IS NOT NULL
                 AND v_lib.management_company_id = signage.current_management_company_id())) THEN
    RAISE EXCEPTION 'この貼紙は削除できません（見つからないか、削除する権限がありません）' USING ERRCODE = '42501';
  END IF;

  v_url := split_part(v_lib.image_url, '?', 1);
  IF EXISTS (
       SELECT 1 FROM signage.signage_entries e
        WHERE (e.poster_image IS NOT NULL AND split_part(e.poster_image, '?', 1) = v_url)
           OR EXISTS (
                SELECT 1 FROM jsonb_array_elements(
                         CASE WHEN jsonb_typeof(e.extra_posters) = 'array' THEN e.extra_posters ELSE '[]'::jsonb END) x
                 WHERE x ->> 'library_id' = p_id::text
                    OR split_part(x ->> 'image_url', '?', 1) = v_url)) THEN
    RAISE EXCEPTION '申請で使われているため削除できません。無効にしてください' USING ERRCODE = '23503';
  END IF;

  DELETE FROM signage.signage_poster_library WHERE id = p_id;
  RETURN v_lib.storage_path;
END;
$function$;

REVOKE ALL ON FUNCTION signage.delete_poster_library_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.delete_poster_library_item(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
