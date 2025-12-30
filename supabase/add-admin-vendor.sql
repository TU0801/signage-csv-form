-- ========================================
-- 管理者用のベンダーを作成
-- ========================================

-- BARANを管理者用ベンダーとして追加
INSERT INTO signage_master_vendors (vendor_name, emergency_contact, inspection_type)
VALUES ('管理者（BARAN）', '', '全種別')
ON CONFLICT (vendor_name) DO NOTHING;

-- 確認
SELECT id, vendor_name, inspection_type FROM signage_master_vendors
WHERE vendor_name = '管理者（BARAN）';
