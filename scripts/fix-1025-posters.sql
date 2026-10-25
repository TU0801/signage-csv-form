-- 修正依頼1025 担当 posters: 貼紙ライブラリ（D2）と 1申請に追加の貼紙を複数（D3）
-- 2026-10-25 作成。本番へは未適用（適用はユーザー承認後）。ローカル DB（signage-v2-verify）で確かめた。
-- 適用方法: ファイル全体を1つのクエリとして流す（Management API なら1回の query に全文を入れる。psql なら psql -1 -f）。
--   BEGIN/COMMIT は付けない。先頭の lock_timeout で、ロックが取れないときは待ち続けずに失敗させる。
-- 何度流しても同じ結果になる（冪等）。
--
-- 足すもの:
--   1. signage_entries.extra_posters（jsonb 配列。2枚目以降の貼紙。要素 {image_url, source: upload|library, library_id?, position?}）
--   2. 表 signage.signage_poster_library（文字を合成しない貼紙のライブラリ。management_company_id が null なら全社共通）
--      書き込み: 管理者は全部、管理会社は自社分だけ（登録・編集・無効化。削除はしない＝is_active=false）
--      読み取り: 全社共通は有効な利用者（管理者・保守会社）と管理会社、管理会社の分はその管理会社と管理者
--   3. RPC signage.poster_library_for_property(物件コード): その物件の申請で選べるライブラリ（全社共通＋物件の管理会社の分）。
--      保守会社は担当する物件のときだけ、その管理会社の分も返す
--   4. Storage poster-images/library/{common|<管理会社id>}/ の登録・更新・削除ポリシー（新しい名前で足す。既存は変えない）
--   7. 申請の貼紙の確かめ（トリガー signage.guard_entry_posters）: extra_posters の要素の形、アップロードの画像は申請者のフォルダ、
--      ライブラリの貼紙（extra_posters と、poster_image が library/ の画像）は物件の管理会社の分か全社共通だけ
--   0. signage.poster_public_base(): JWT の iss（https://<ref>.supabase.co/auth/v1）からこのプロジェクトの URL を出す。
--      ライブラリの行・申請の貼紙の URL のホストをこれと突き合わせる
--
-- 本番へ流す前に確かめること: 本番のログイン中のアクセストークン（JWT）を1つデコードし、iss が
--   「<VITE_SUPABASE_URL>/auth/v1」（例 https://pdouwmjyswswfmzpfjzf.supabase.co/auth/v1）であること。
--   違う（独自の API ドメインなど）なら poster_public_base() の本体を、その URL を返す定数に置き換えてから流す。
--   確かめずに流して違っていた場合: ライブラリの登録と、追加の貼紙のある申請が下のトリガーのメッセージで止まる（黙って壊れはしない）。
-- 変えるもの（修正依頼1024 で自分たちが作った関数。同じ引数で置き換え、オーバーロードは作らない）:
--   5. signage.poster_object_referenced(text): extra_posters の参照も見る
--   6. signage.orphan_poster_images(): library/ を片付けの対象から外し、extra_posters の参照も見る
-- 戻し手順は末尾。

SET lock_timeout = '5s';

-- ============================================================
-- 0. このプロジェクトの URL（公開 URL のホストの突き合わせに使う）
-- ============================================================
-- DB は自分の公開 URL を知らないので、署名された JWT の iss（Auth の URL）から出す。iss が Auth の URL の形でなければ
-- （JWT の無い管理 SQL・旧形式の service_role 鍵の iss='supabase' など）null を返し、呼ぶ側はホストを確かめない（パスの形だけ）
CREATE OR REPLACE FUNCTION signage.poster_public_base()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select case when (auth.jwt() ->> 'iss') ~ '^https?://[^/?#]+(/[^?#]*)?/auth/v1$'
              then regexp_replace(auth.jwt() ->> 'iss', '/auth/v1$', '')
         end;
$function$;
REVOKE ALL ON FUNCTION signage.poster_public_base() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.poster_public_base() TO authenticated, service_role;

-- ============================================================
-- 1. 申請の追加の貼紙（2枚目以降）
-- ============================================================
-- 最初の1枚は今までどおり poster_type / poster_image（テンプレートでも追加でもよい）。2枚目以降をここに入れる。
-- CSV では枚数分の行に展開する（貼紙区分「追加」、点検案内TPLNo は {物件コード}_{点検種別}_{ID先頭8}_{n}、n は 2 から）。
-- 既存の行は '[]'（列の追加と同時に既定値が入る）。上限は 10 枚。
ALTER TABLE signage.signage_entries ADD COLUMN IF NOT EXISTS extra_posters jsonb NOT NULL DEFAULT '[]'::jsonb;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signage_entries_extra_posters_check'
                 AND conrelid = 'signage.signage_entries'::regclass) THEN
    ALTER TABLE signage.signage_entries ADD CONSTRAINT signage_entries_extra_posters_check
      CHECK (jsonb_typeof(extra_posters) = 'array' AND jsonb_array_length(extra_posters) <= 10);
  END IF;
END $$;
COMMENT ON COLUMN signage.signage_entries.extra_posters IS
  '2枚目以降の貼紙（修正依頼1025 D3）。[{image_url, source: upload|library, library_id?, position?}]。CSV は枚数分の行に展開';

-- ============================================================
-- 2. 貼紙ライブラリ
-- ============================================================
CREATE TABLE IF NOT EXISTS signage.signage_poster_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 100),
  category text NOT NULL DEFAULT 'その他' CHECK (length(btrim(category)) BETWEEN 1 AND 50),
  image_url text NOT NULL,
  storage_path text NOT NULL,
  -- biz.companies.id（管理会社）。null は全社共通（管理者だけが登録できる）
  management_company_id uuid NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 置き場所は poster-images/library/{common|<管理会社id>}/ に限る（範囲と置き場所を一致させる）
  CONSTRAINT signage_poster_library_path_check CHECK (
    position('..' in storage_path) = 0
    AND storage_path LIKE 'library/' || coalesce(management_company_id::text, 'common') || '/%'
  )
);
COMMENT ON TABLE signage.signage_poster_library IS
  '文字を合成しない貼紙のライブラリ（修正依頼1025 D2）。画像は poster-images/library/{common|<管理会社id>}/';
CREATE INDEX IF NOT EXISTS signage_poster_library_company_idx
  ON signage.signage_poster_library (management_company_id, is_active, sort_order);

DROP TRIGGER IF EXISTS update_signage_poster_library_updated_at ON signage.signage_poster_library;
CREATE TRIGGER update_signage_poster_library_updated_at BEFORE UPDATE ON signage.signage_poster_library
  FOR EACH ROW EXECUTE FUNCTION signage.update_updated_at_column();

-- 登録者と登録日時は書き換えさせない（INSERT は本人、UPDATE は元の値のまま）。JWT の無い経路（管理 SQL）はそのまま。
-- 画像の URL は、このプロジェクト（poster_public_base）の poster-images/{storage_path} の公開 URL に限る
-- （管理会社が書ける値なので、別のサイトの URL を申請・CSV・ZIP に流させない。下の CHECK はパスの形だけ）
CREATE OR REPLACE FUNCTION signage.guard_poster_library_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
DECLARE
  v_base text := signage.poster_public_base();
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_base IS NOT NULL
     AND NEW.image_url IS DISTINCT FROM v_base || '/storage/v1/object/public/poster-images/' || NEW.storage_path THEN
    RAISE EXCEPTION '貼紙ライブラリの画像の URL が置き場所と一致しません' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_at := now();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION signage.guard_poster_library_columns() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_poster_library_columns ON signage.signage_poster_library;
CREATE TRIGGER guard_poster_library_columns BEFORE INSERT OR UPDATE ON signage.signage_poster_library
  FOR EACH ROW EXECUTE FUNCTION signage.guard_poster_library_columns();

-- 画像の URL の形: http(s) で、パスが置き場所（storage_path）の公開 URL と同じ。ホストはここでは確かめられない
-- （DB は自分の URL を知らない）。ホストは上の guard_poster_library_columns が JWT の iss と突き合わせ、画面は safePosterUrl で
-- このプロジェクトの URL だけを出す。この CHECK だけを境界として当てにしない
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signage_poster_library_url_check'
                 AND conrelid = 'signage.signage_poster_library'::regclass) THEN
    ALTER TABLE signage.signage_poster_library ADD CONSTRAINT signage_poster_library_url_check CHECK (
      image_url ~ '^https?://'
      AND right(split_part(image_url, '?', 1), length('/storage/v1/object/public/poster-images/' || storage_path))
          = '/storage/v1/object/public/poster-images/' || storage_path
    );
  END IF;
END $$;

ALTER TABLE signage.signage_poster_library ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE signage.signage_poster_library FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE signage.signage_poster_library TO authenticated;
GRANT ALL ON TABLE signage.signage_poster_library TO service_role;

DROP POLICY IF EXISTS poster_library_select ON signage.signage_poster_library;
CREATE POLICY poster_library_select ON signage.signage_poster_library FOR SELECT TO authenticated
  USING (
    signage.is_active_admin()
    -- 全社共通: 管理会社は無効も含めて（登録画面で見る）、保守会社は有効なものだけ
    OR (management_company_id IS NULL AND (signage.is_active_management() OR (signage.is_active_member() AND is_active)))
    OR (signage.is_active_management() AND management_company_id = signage.current_management_company_id())
  );

DROP POLICY IF EXISTS poster_library_insert ON signage.signage_poster_library;
CREATE POLICY poster_library_insert ON signage.signage_poster_library FOR INSERT TO authenticated
  WITH CHECK (
    signage.is_active_admin()
    OR (signage.is_active_management()
        AND management_company_id IS NOT NULL
        AND management_company_id = signage.current_management_company_id())
  );

DROP POLICY IF EXISTS poster_library_update ON signage.signage_poster_library;
CREATE POLICY poster_library_update ON signage.signage_poster_library FOR UPDATE TO authenticated
  USING (
    signage.is_active_admin()
    OR (signage.is_active_management() AND management_company_id = signage.current_management_company_id())
  )
  WITH CHECK (
    signage.is_active_admin()
    OR (signage.is_active_management()
        AND management_company_id IS NOT NULL
        AND management_company_id = signage.current_management_company_id())
  );

-- ============================================================
-- 3. この物件の申請で選べるライブラリ
-- ============================================================
-- 全社共通（有効なもの）＋物件の管理会社の分（有効なもの）。範囲の判定:
--   管理者: どの物件でも。管理会社: 自社が管理する物件だけ（自社の分）。
--   保守会社: 担当する物件（紐付けが active、または担当の点検がある＝management_companies_scoped と同じ判定）だけ。
--   範囲外の物件・物件コードが空なら全社共通だけ返す。
CREATE OR REPLACE FUNCTION signage.poster_library_for_property(p_property_code text)
 RETURNS TABLE(id uuid, display_name text, category text, image_url text, management_company_id uuid, sort_order integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
  with caller as (
    select signage.is_active_admin() as is_admin,
           signage.is_active_member() as is_member,
           signage.is_active_management() as is_mgmt
  ),
  prop as (
    -- 旧来の申請は 120410、マスタは 120410-00 のように書式が揺れる（property_reviewable と同じ規則）
    select sp.property_code, bp.id as biz_property_id, bp.management_company_id
      from signage.signage_master_properties sp
      join biz.properties bp on bp.signage_property_id = sp.id
     where coalesce(btrim(p_property_code), '') <> ''
       and regexp_replace(sp.property_code, '-00$', '') = regexp_replace(btrim(p_property_code), '-00$', '')
     limit 1
  ),
  company as (
    select p.management_company_id
      from prop p, caller c
     where p.management_company_id is not null
       and (c.is_admin
            or (c.is_mgmt and p.management_company_id = signage.current_management_company_id())
            or (signage.current_role_kind() = 'user' and signage.current_vendor_id() is not null and (
                  exists (select 1 from signage.signage_building_vendors bv
                           where bv.property_code = p.property_code
                             and bv.vendor_id = signage.current_vendor_id()
                             and bv.status = 'active')
               or exists (select 1 from biz.property_inspections pi
                           where pi.property_id = p.biz_property_id and signage.inspection_in_scope(pi.id)))))
  )
  select l.id, l.display_name, l.category, l.image_url, l.management_company_id, l.sort_order
    from signage.signage_poster_library l, caller c
   where (c.is_admin or c.is_member or c.is_mgmt)
     and l.is_active
     and (l.management_company_id is null
          or l.management_company_id = (select management_company_id from company))
   order by l.management_company_id nulls first, l.category, l.sort_order, l.display_name;
$function$;
REVOKE ALL ON FUNCTION signage.poster_library_for_property(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.poster_library_for_property(text) TO authenticated, service_role;

-- ============================================================
-- 4. Storage: poster-images/library/{common|<管理会社id>}/
-- ============================================================
-- 既存の「poster-image 2whf5k_1」（INSERT）・「poster-images admin delete/update」はそのまま（管理者はこれで全部書ける）。
-- 既知の制約: 既存の SELECT ポリシー「poster-image 2whf5k_0」（bucket_id='poster-images' AND is_active_member()）は library/ にも
-- 掛かるので、有効な保守会社はほかの管理会社のライブラリの画像のファイル名を一覧できる（保守会社がアップロードした貼紙と同じ、
-- 公開バケットの今の扱い）。表と RPC は範囲で絞っている。storage.objects への RESTRICTIVE ポリシーは全バケットの SELECT
-- （アップロードの RETURNING を含む）に掛かるので、ここでは足さない
-- 管理会社は自社のフォルダだけ登録できる（SELECT は Storage API の登録・削除の RETURNING に要る）。
-- 削除は、どの申請（poster_image・extra_posters）にもライブラリの行にも使われていない自社フォルダのファイルだけ
-- （登録をやめた・画像を差し替えたときの片付け）。
CREATE OR REPLACE FUNCTION signage.poster_library_folder_writable(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select p_name is not null
     and position('..' in p_name) = 0
     and (storage.foldername(p_name))[1] = 'library'
     and coalesce(array_length(storage.foldername(p_name), 1), 0) = 2
     and (
       ((storage.foldername(p_name))[2] = 'common' and signage.is_active_admin())
       or (signage.is_active_admin() and (storage.foldername(p_name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
       or (signage.is_active_management()
           and (storage.foldername(p_name))[2] = signage.current_management_company_id()::text)
     );
$function$;
REVOKE ALL ON FUNCTION signage.poster_library_folder_writable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.poster_library_folder_writable(text) TO authenticated, service_role;

-- 画像（公開 URL の末尾が /storage/v1/object/public/poster-images/{name}）が申請・ライブラリの行から使われているか
CREATE OR REPLACE FUNCTION signage.poster_library_object_in_use(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'signage', 'pg_temp'
AS $function$
  select p_name is null
      or not signage.poster_library_folder_writable(p_name)
      or exists (
        select 1 from signage.signage_poster_library l
         where l.storage_path = p_name
            or right(split_part(l.image_url, '?', 1), length('/storage/v1/object/public/poster-images/' || p_name))
               = '/storage/v1/object/public/poster-images/' || p_name)
      or exists (
        select 1 from signage.signage_entries e
         where (e.poster_image is not null
                and right(split_part(e.poster_image, '?', 1), length('/storage/v1/object/public/poster-images/' || p_name))
                    = '/storage/v1/object/public/poster-images/' || p_name)
            or exists (
              select 1 from jsonb_array_elements(e.extra_posters) x
               where right(split_part(x->>'image_url', '?', 1), length('/storage/v1/object/public/poster-images/' || p_name))
                     = '/storage/v1/object/public/poster-images/' || p_name));
$function$;
REVOKE ALL ON FUNCTION signage.poster_library_object_in_use(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.poster_library_object_in_use(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "poster-images library select" ON storage.objects;
CREATE POLICY "poster-images library select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'poster-images' AND signage.is_active_management()
         AND (storage.foldername(name))[1] = 'library'
         AND (storage.foldername(name))[2] IN ('common', signage.current_management_company_id()::text));

DROP POLICY IF EXISTS "poster-images library insert" ON storage.objects;
CREATE POLICY "poster-images library insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'poster-images' AND signage.poster_library_folder_writable(name));

DROP POLICY IF EXISTS "poster-images library delete" ON storage.objects;
CREATE POLICY "poster-images library delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'poster-images'
         AND signage.is_active_management()
         AND signage.poster_library_folder_writable(name)
         AND NOT signage.poster_library_object_in_use(name));

-- ============================================================
-- 5. 参照の判定に extra_posters を足す（修正依頼1024 後続 orphan の関数を置き換え）
-- ============================================================
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
         where (e.poster_image is not null
                and right(split_part(e.poster_image, '?', 1), length('/storage/v1/object/public/poster-images/' || p_name))
                    = '/storage/v1/object/public/poster-images/' || p_name)
            or exists (
              select 1 from jsonb_array_elements(e.extra_posters) x
               where right(split_part(x->>'image_url', '?', 1), length('/storage/v1/object/public/poster-images/' || p_name))
                     = '/storage/v1/object/public/poster-images/' || p_name)
      );
$function$;

-- ============================================================
-- 6. 使われていない画像の一覧: library/ を外し、extra_posters の参照も見る
-- ============================================================
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
       and (storage.foldername(o.name))[1] not in ('templates', 'ads', 'library')
       and o.created_at < now() - interval '7 days'
       and not exists (
         select 1
           from signage.signage_entries e
          where (e.poster_image is not null
                 and right(split_part(e.poster_image, '?', 1), length('/storage/v1/object/public/poster-images/' || o.name))
                     = '/storage/v1/object/public/poster-images/' || o.name)
             or exists (
               select 1 from jsonb_array_elements(e.extra_posters) x
                where right(split_part(x->>'image_url', '?', 1), length('/storage/v1/object/public/poster-images/' || o.name))
                      = '/storage/v1/object/public/poster-images/' || o.name)
       )
     order by o.created_at;
end;
$function$;

REVOKE ALL ON FUNCTION signage.poster_object_referenced(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION signage.orphan_poster_images() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION signage.poster_object_referenced(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION signage.orphan_poster_images() TO authenticated, service_role;

-- ============================================================
-- 7. 申請の貼紙の確かめ（2枚目以降の extra_posters と、1枚目がライブラリの画像のときの poster_image）
-- ============================================================
-- 管理会社の貼紙は、その管理会社の物件の申請でだけ使える（ユーザー決定3）。画面は物件を選んだ時点のライブラリから選ぶので、
-- 選んだ後に物件を変える・一括入力で行を写すなどで他社の物件の申請に入るのを、ここで止める。
--   形: 要素はオブジェクトで、source は upload か library、position は '0'〜'4' か無し、image_url は文字列。
--   upload: image_url は poster-images/{申請者 user_id}/ の公開 URL（ホストは poster_public_base と突き合わせる）。
--   library: library_id のライブラリの行が有効で、image_url がその行の image_url と同じで、行が全社共通か物件の管理会社の分。
--   poster_image が poster-images/library/ の画像なら、同じく有効で範囲内のライブラリの行の image_url と同じであること。
--   物件の管理会社は、申請の物件コードと一致する物件行（書式の揺れを吸収しない。1024 の方針「書き込みは正確な物件行で判定」）。
--   物件行が無い（建物追加の仮のコード REQ-・旧書式の物件コード）なら全社共通だけ。
-- 確かめるのは INSERT と、貼紙・物件コードが変わった UPDATE だけ（承認・差戻し・取込などの状態の変更では見ない）。
-- UPDATE で前から入っていた要素は、物件コードが変わったときに範囲だけ確かめ直す（無効になったライブラリでも、建物の承認の
-- 付け替えを止めない）。JWT の無い経路（管理 SQL）は対象外
CREATE OR REPLACE FUNCTION signage.guard_entry_posters()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'biz', 'signage', 'pg_temp'
AS $function$
DECLARE
  c_prefix constant text := '/storage/v1/object/public/poster-images/';
  v_base text := signage.poster_public_base();
  v_code_changed boolean;
  v_is_new boolean;
  v_company uuid;
  x jsonb;
  v_url text;
  v_path text;
  v_lib signage.signage_poster_library;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.poster_image IS NOT DISTINCT FROM OLD.poster_image
     AND NEW.extra_posters IS NOT DISTINCT FROM OLD.extra_posters
     AND NEW.property_code IS NOT DISTINCT FROM OLD.property_code THEN
    RETURN NEW;
  END IF;
  v_code_changed := TG_OP = 'INSERT' OR NEW.property_code IS DISTINCT FROM OLD.property_code;

  SELECT bp.management_company_id INTO v_company
    FROM signage.signage_master_properties sp
    JOIN biz.properties bp ON bp.signage_property_id = sp.id
   WHERE sp.property_code = NEW.property_code;

  FOR x IN SELECT e FROM jsonb_array_elements(coalesce(NEW.extra_posters, '[]'::jsonb)) AS t(e) LOOP
    v_is_new := TG_OP = 'INSERT' OR NOT (coalesce(OLD.extra_posters, '[]'::jsonb) @> jsonb_build_array(x));
    CONTINUE WHEN NOT v_is_new AND NOT v_code_changed;
    IF jsonb_typeof(x) IS DISTINCT FROM 'object'
       OR jsonb_typeof(x -> 'image_url') IS DISTINCT FROM 'string'
       OR coalesce(x ->> 'source', '') NOT IN ('upload', 'library')
       OR (x ? 'position' AND jsonb_typeof(x -> 'position') <> 'null'
           AND (jsonb_typeof(x -> 'position') <> 'string' OR (x ->> 'position') !~ '^[0-4]$')) THEN
      RAISE EXCEPTION '追加の貼紙の形が正しくありません' USING ERRCODE = '22023';
    END IF;
    v_url := x ->> 'image_url';
    IF x ->> 'source' = 'upload' THEN
      CONTINUE WHEN NOT v_is_new;
      v_path := CASE
        WHEN v_base IS NOT NULL THEN
          CASE WHEN left(v_url, length(v_base || c_prefix)) = v_base || c_prefix THEN substr(v_url, length(v_base || c_prefix) + 1) END
        ELSE substring(v_url FROM '^https?://[^/?#]+/storage/v1/object/public/poster-images/(.*)$')
      END;
      IF v_path IS NULL OR position('..' in v_path) > 0
         OR v_path !~ ('^' || NEW.user_id::text || '/[^/?#]+$') THEN
        RAISE EXCEPTION '追加の貼紙の画像は、申請する方がアップロードした画像だけ使えます' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF coalesce(x ->> 'library_id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION '追加の貼紙の形が正しくありません（ライブラリの貼紙）' USING ERRCODE = '22023';
      END IF;
      SELECT * INTO v_lib FROM signage.signage_poster_library WHERE id = (x ->> 'library_id')::uuid;
      IF NOT FOUND OR v_lib.image_url IS DISTINCT FROM v_url OR (v_is_new AND NOT v_lib.is_active) THEN
        RAISE EXCEPTION 'この貼紙ライブラリの貼紙は使えません（登録が変わったか、無効になっています）' USING ERRCODE = '22023';
      END IF;
      IF v_lib.management_company_id IS NOT NULL AND v_lib.management_company_id IS DISTINCT FROM v_company THEN
        RAISE EXCEPTION '管理会社の貼紙は、その管理会社の物件の申請でだけ使えます' USING ERRCODE = '42501';
      END IF;
    END IF;
  END LOOP;

  -- 1枚目がライブラリの画像（poster-images/library/ の公開 URL。ホストによらず見る）
  IF NEW.poster_image ~ '/storage/v1/object/public/poster-images/library/'
     AND (TG_OP = 'INSERT' OR v_code_changed OR NEW.poster_image IS DISTINCT FROM OLD.poster_image) THEN
    v_is_new := TG_OP = 'INSERT' OR NEW.poster_image IS DISTINCT FROM OLD.poster_image;
    IF NOT EXISTS (
      SELECT 1 FROM signage.signage_poster_library l
       WHERE l.image_url = NEW.poster_image
         AND (l.is_active OR NOT v_is_new)
         AND (l.management_company_id IS NULL OR l.management_company_id = v_company)) THEN
      RAISE EXCEPTION '管理会社の貼紙は、その管理会社の物件の申請でだけ使えます（またはライブラリの登録が変わりました）'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION signage.guard_entry_posters() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_entry_posters ON signage.signage_entries;
CREATE TRIGGER guard_entry_posters BEFORE INSERT OR UPDATE ON signage.signage_entries
  FOR EACH ROW EXECUTE FUNCTION signage.guard_entry_posters();

-- ============================================================
-- 戻し手順（必要なときだけ）
-- ============================================================
-- DROP TRIGGER IF EXISTS guard_entry_posters ON signage.signage_entries;
-- DROP FUNCTION IF EXISTS signage.guard_entry_posters();
-- DROP POLICY IF EXISTS "poster-images library select" ON storage.objects;
-- DROP POLICY IF EXISTS "poster-images library insert" ON storage.objects;
-- DROP POLICY IF EXISTS "poster-images library delete" ON storage.objects;
-- DROP FUNCTION IF EXISTS signage.poster_library_object_in_use(text);
-- DROP FUNCTION IF EXISTS signage.poster_library_folder_writable(text);
-- DROP FUNCTION IF EXISTS signage.poster_library_for_property(text);
-- DROP TABLE IF EXISTS signage.signage_poster_library;        -- 登録したライブラリの行も消える
-- DROP FUNCTION IF EXISTS signage.guard_poster_library_columns();
-- DROP FUNCTION IF EXISTS signage.poster_public_base();
-- ALTER TABLE signage.signage_entries DROP COLUMN IF EXISTS extra_posters;   -- 2枚目以降の貼紙も消える
-- poster_object_referenced・orphan_poster_images は scripts/fix-1024-followups-orphan.sql を流し直すと元に戻る
