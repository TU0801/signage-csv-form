-- テンプレート画像名の誤字を修正

-- construction_outer wall → construction_outer_wall
UPDATE signage_master_inspection_types
SET template_no = 'construction_outer_wall'
WHERE template_no = 'construction_outer wall';

-- 確認
SELECT COUNT(*) as fixed_count
FROM signage_master_inspection_types
WHERE template_no = 'construction_outer_wall';
