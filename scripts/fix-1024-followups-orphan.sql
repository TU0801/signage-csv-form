-- 修正依頼1024 後続 担当 orphan: 使われない貼紙画像の片付け
-- 2026-10-24 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。
-- 何度流しても同じ結果になる（冪等）。すべて追加だけで、既存の関数・ポリシーは変えない。
--
-- 本番の今の状態（2026-10-24 に Management API の読み取りで確認）:
--   - poster-images の storage.objects ポリシーは4つ。SELECT「poster-image 2whf5k_0」（有効な利用者）、
--     INSERT「poster-image 2whf5k_1」（自分の uid フォルダ／管理者は ads・templates）、
--     DELETE「poster-images admin delete」・UPDATE「poster-images admin update」（管理者だけ）。
--     → 一般の利用者は自分がアップロードした画像も消せない（Storage API の remove は 0 件で成功扱いになる）。
--   - 利用者フォルダ（templates/・ads/ 以外）のファイルは 3 フォルダ・計 10 件（2026-07-18〜2026-09-29）。
--     signage_entries.poster_image が入っている申請は 0 件なので、10 件ともどの申請からも参照されていない。
--     ここでは消さない。消すのは管理者が画面の「使われていない画像を整理」で確かめてボタンを押したときだけ。
--   - 画像の URL を持つほかの列（signage_ad_slots.image_url・テンプレート画像の image_url）は ads/・templates/ だけを指す
--     （利用者フォルダを指す行は 0 件）ので、参照の判定は signage_entries.poster_image だけを見る。
--
-- 足すもの:
--   1. signage.poster_object_referenced(name): poster-images のその名前のファイルを、どれかの申請の poster_image が指しているか
--   2. DELETE ポリシー「poster-images own delete」: 有効な利用者は、自分の uid フォルダのファイルのうち、どの申請からも参照されていないものだけ消せる
--   3. signage.orphan_poster_images(): 管理者だけ。利用者フォルダのうち、どの申請からも参照されず、作成から7日以上たったファイルの一覧
-- 戻し手順は末尾。

SET lock_timeout = '5s';

-- ============================================================
-- 1. 参照の判定
-- ============================================================
-- 申請の poster_image は公開 URL（{SUPABASE_URL}/storage/v1/object/public/poster-images/{name}）。
-- 末尾が「/storage/v1/object/public/poster-images/{name}」と一致するかで見る（クエリ ?… は外す）。
-- ファイル名に _ が入る（{時刻}_{乱数}.png）ので LIKE（_ が任意の1文字になる）は使わない。
-- 有効な利用者でなければ「参照されている」と返す（消させない側に倒す）。
-- DELETE ポリシーから呼ぶので authenticated に EXECUTE が要る（ポリシーの式は呼んだ利用者の権限で動く）。
-- そのため利用者が直接呼ぶこともできるが、自分の uid フォルダ以外の名前には常に「参照されている」と返し、
-- 他人のファイルが申請から参照されているかを調べる手段にはしない。
CREATE OR REPLACE FUNCTION signage.poster_object_referenced(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select not signage.is_active_member()
      or p_name is null
      or (storage.foldername(p_name))[1] is distinct from auth.uid()::text
      or exists (
        select 1
          from signage.signage_entries e
         where e.poster_image is not null
           and right(split_part(e.poster_image, '?', 1), length('/storage/v1/object/public/poster-images/' || p_name))
               = '/storage/v1/object/public/poster-images/' || p_name
      );
$function$;

-- ============================================================
-- 2. 本人のファイルの削除（一括入力の詳細設定・1件入力で、差し替えた／戻した／行を消した画像をその場で片付ける）
-- ============================================================
-- 判定は INSERT ポリシーと同じく先頭フォルダ名で行い、.. を含む名前は対象にしない。
-- 申請から参照されているファイルは本人でも消せない（承認待ち・承認済みの貼紙が消えないように）。
DROP POLICY IF EXISTS "poster-images own delete" ON storage.objects;
CREATE POLICY "poster-images own delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'poster-images'
    AND position('..' in name) = 0
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND signage.is_active_member()
    AND NOT signage.poster_object_referenced(name)
  );

-- ============================================================
-- 3. 管理者のまとめ整理: 使われていない画像の一覧
-- ============================================================
-- 消すのは画面から Storage API で（管理者の DELETE ポリシーは既存）。この関数は読むだけ。
-- 7日の猶予は、一括入力の下書き（ブラウザの自動保存）が申請前に持っている画像を消さないため。
CREATE OR REPLACE FUNCTION signage.orphan_poster_images()
 RETURNS TABLE(name text, size bigint, mimetype text, created_at timestamptz, owner_id uuid, owner_email text, owner_company text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
begin
  if not signage.is_active_admin() then
    raise exception '管理者だけが使えます' using errcode = '42501';
  end if;
  return query
    select o.name::text,
           coalesce((o.metadata->>'size')::bigint, 0),
           (o.metadata->>'mimetype')::text,
           o.created_at,
           p.id,
           p.email,
           p.company_name
      from storage.objects o
      left join signage.signage_profiles p on p.id::text = (storage.foldername(o.name))[1]
     where o.bucket_id = 'poster-images'
       and coalesce(array_length(storage.foldername(o.name), 1), 0) >= 1
       and (storage.foldername(o.name))[1] not in ('templates', 'ads')
       and o.created_at < now() - interval '7 days'
       and not exists (
         select 1
           from signage.signage_entries e
          where e.poster_image is not null
            and right(split_part(e.poster_image, '?', 1), length('/storage/v1/object/public/poster-images/' || o.name))
                = '/storage/v1/object/public/poster-images/' || o.name
       )
     order by o.created_at;
end;
$function$;

-- 本番の signage には新しい関数に anon へも EXECUTE を付ける default privileges があるので外す
REVOKE ALL ON FUNCTION signage.poster_object_referenced(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.orphan_poster_images() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.poster_object_referenced(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.orphan_poster_images() TO authenticated, service_role;

-- ============================================================
-- 戻し手順（必要なときだけ。上で足したものを消すだけで、既存の定義は変えていない）
-- ============================================================
-- DROP POLICY IF EXISTS "poster-images own delete" ON storage.objects;
-- DROP FUNCTION IF EXISTS signage.orphan_poster_images();
-- DROP FUNCTION IF EXISTS signage.poster_object_referenced(text);
