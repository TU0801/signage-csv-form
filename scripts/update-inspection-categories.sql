-- カテゴリーマスターにデータを挿入
INSERT INTO signage_master_categories (category_name, sort_order)
VALUES
  ('点検', 1),
  ('清掃', 2),
  ('工事', 3),
  ('アンケート', 4)
ON CONFLICT (category_name) DO NOTHING;

-- 点検種別テーブルにcategoryカラムを追加（存在しない場合）
ALTER TABLE signage_master_inspection_types
ADD COLUMN IF NOT EXISTS category TEXT;

-- 点検種別にカテゴリーとテンプレート画像を設定

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'elevator_inspection'
WHERE inspection_name = 'リモート点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '建物設備点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'fire_inspection'
WHERE inspection_name = '消防設備点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'simple_dedicated_water_supply'
WHERE inspection_name = '貯水槽清掃（断水）';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '簡易専用水道検査';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'automatic_doors'
WHERE inspection_name = '自動扉点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'surveillance_camera'
WHERE inspection_name = '防犯カメラ点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'surveillance_camera_installation_work'
WHERE inspection_name = '防犯カメラ取付工事';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'water_supply_pump_construction'
WHERE inspection_name = '給水ポンプ点検（断水）';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'cleaning'
WHERE inspection_name = '定期清掃';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'cleaning'
WHERE inspection_name = 'エントランス定期清掃';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'shared_electrical_equipment'
WHERE inspection_name = '共用部電気設備点検（停電）';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'shared_electrical_equipment'
WHERE inspection_name = '共用部電気設備点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'fire_inspection'
WHERE inspection_name = '消防設備点検ご協力のお願い';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'planting_management'
WHERE inspection_name = '植栽の手入れ';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'planting_management'
WHERE inspection_name = '芝生の手入れ';

UPDATE signage_master_inspection_types
SET category = '清掃'
WHERE inspection_name = 'マット交換';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'drainage_pipe'
WHERE inspection_name = 'お部屋の排水管洗浄';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'drainage_pipe'
WHERE inspection_name = 'お部屋と共用の排水管洗浄';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '音、振動を伴う工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'vending_machine_construction'
WHERE inspection_name = '自動販売機工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'waterproof_construction'
WHERE inspection_name = '屋上防水工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'iron_part_coating'
WHERE inspection_name = '鉄部塗装';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = 'バイク置場工事';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'exterior_wall_tile_inspection'
WHERE inspection_name = '外壁タイル調査';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '特殊建築物調査';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '駐車場工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'questionnaire_conducted02'
WHERE inspection_name = 'インターネット機器工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'water_supply_pump_construction'
WHERE inspection_name = 'ポンプ工事（断水）';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'simple_dedicated_water_supply'
WHERE inspection_name = '貯水槽清掃';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'water_supply_pump_construction'
WHERE inspection_name = '給水ポンプ点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'water_supply_pump_construction'
WHERE inspection_name = '給水ポンプ点検';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_mobile_antenna'
WHERE inspection_name = '携帯アンテナ工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'delivery_box_stop_using'
WHERE inspection_name = '宅配ボックス使用停止中';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'shared_area_drain_pipe_wash'
WHERE inspection_name = '共用部の排水管洗浄';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'shared_area_drain_pipe_inspection'
WHERE inspection_name = '消防設備連結管耐圧試験';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_outer wall'
WHERE inspection_name = '外壁タイル工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'card_reader'
WHERE inspection_name = 'カードリーダー更新工事';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'construction_without_sound'
WHERE inspection_name = '作業のため作業員が入ります';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'questionnaire_conducted01'
WHERE inspection_name = '消防設備点検アンケート';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'questionnaire_conducted01'
WHERE inspection_name = '消防設備工事アンケート';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'questionnaire_conducted01'
WHERE inspection_name = '排水管洗浄アンケート';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'questionnaire_conducted01'
WHERE inspection_name = 'インターホン工事アンケート';

UPDATE signage_master_inspection_types
SET category = 'アンケート', template_no = 'questionnaire_conducted02'
WHERE inspection_name = '入居者様アンケート';

UPDATE signage_master_inspection_types
SET category = 'アンケート', template_no = 'questionnaire_conducted02'
WHERE inspection_name = '1年点検アンケート';

UPDATE signage_master_inspection_types
SET category = 'アンケート', template_no = 'questionnaire_conducted02'
WHERE inspection_name = '2年点検アンケート';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'questionnaire_conducted02'
WHERE inspection_name = '大規模修繕工事アンケート';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'water_supply_pump_construction'
WHERE inspection_name = '給水ポンプ点検（断水）';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'merchari_installation'
WHERE inspection_name = 'チャリチャリ設置工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_mobile_antenna'
WHERE inspection_name = '携帯アンテナ工事';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'fire_extinguisher_explain'
WHERE inspection_name = '消防訓練掲示';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '建築設備調査';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'planting_management'
WHERE inspection_name = '植栽の手入れ';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_coin_parking'
WHERE inspection_name = 'コインパーキング工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '音、振動を伴う工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'water_activator_construction'
WHERE inspection_name = '活水装置工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_Intercom'
WHERE inspection_name = 'インターホン工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_light'
WHERE inspection_name = '共用部照明工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'card_reader'
WHERE inspection_name = 'カードリーダー工事';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'shared_area_drain_pipe_inspection'
WHERE inspection_name = '連結送水管耐圧試験';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'vending_machine_construction_2'
WHERE inspection_name = '自動販売機工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_mobile_antenna'
WHERE inspection_name = '携帯アンテナ工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_building_large_scale'
WHERE inspection_name = '大規模修繕工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_outer_wall'
WHERE inspection_name = '外壁タイル工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_television_equipment'
WHERE inspection_name = '視聴設備更新工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_jcom_cable'
WHERE inspection_name = 'JCOMケーブル工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'fire_construction'
WHERE inspection_name = '消防改修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '有線放送工事';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'glass_clean'
WHERE inspection_name = 'ガラス清掃';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'shared_electrical_equipment'
WHERE inspection_name = '共用部電気設備点検（停電）';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '特定防火対象物点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'electrical_measurement'
WHERE inspection_name = 'シャッター点検';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '電子掲示板メンテナンス';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '空冷設備点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '全熱交換器点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '自動制御装置点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '中央監視装置点検';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'simple_dedicated_water_supply'
WHERE inspection_name = '上水受水槽清掃';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'simple_dedicated_water_supply'
WHERE inspection_name = '再生水受水槽清掃';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'simple_dedicated_water_supply'
WHERE inspection_name = '貯湯タンク清掃';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'Investigation'
WHERE inspection_name = '水質検査';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'Investigation'
WHERE inspection_name = '雑用水水質検査';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'Investigation'
WHERE inspection_name = '残留塩素測定';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'building_inspection'
WHERE inspection_name = '簡易専用水道検査';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'Investigation'
WHERE inspection_name = 'ホルムアルデヒド測定';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'Investigation'
WHERE inspection_name = '空気環境測定';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'Investigation'
WHERE inspection_name = 'ねずみ等の調査・防除調査';

UPDATE signage_master_inspection_types
SET category = '清掃', template_no = 'cleaning_bucket'
WHERE inspection_name = 'グリーストラップ清掃';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'electrical_measurement'
WHERE inspection_name = '発電設備点検';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '電子掲示板工事';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'construction_toolbox'
WHERE inspection_name = 'ガス安全点検';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = 'アスファルト補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '植栽工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = 'インターロッキング補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = 'ゴミ置場補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '駐輪場工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_outer wall'
WHERE inspection_name = '外壁補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = 'エントランスドア補修';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '窓サッシ補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '住戸玄関ドア工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '窓ガラス取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = 'エントランスドア調整工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = '共用部クロス補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'automatic_doors'
WHERE inspection_name = 'エントランス自動ドア工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'automatic_doors'
WHERE inspection_name = '裏口自動ドア工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'automatic_doors'
WHERE inspection_name = '駐輪場自動ドア工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'exchange_light_battery'
WHERE inspection_name = '照明取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'exchange_light_battery'
WHERE inspection_name = 'エントランス照明取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'exchange_light_battery_2'
WHERE inspection_name = '照明器具メンテナンス作業';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = '住宅玄関ドア枠塗装工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '玄関ドア取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_building_large_scale'
WHERE inspection_name = '外壁タイル補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_building_large_scale'
WHERE inspection_name = '外壁補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = '外壁塗装工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '床タイル補修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'delivery_box'
WHERE inspection_name = '宅配ボックス設置工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = 'インターホンメンテンス作業';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '住戸インターホン取替作業';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_spanner'
WHERE inspection_name = '避雷針工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'building_inspection'
WHERE inspection_name = '避雷針調査';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_spanner'
WHERE inspection_name = '受水槽メンテナンス工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '受水槽ボールタップ取替作業';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = '受水槽塗装工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '受水槽取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = 'メールボックス取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = 'メールボックス更新工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = 'メールボックス部品取替作業';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_spanner'
WHERE inspection_name = '排水管更新工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_involving_sound_vibration'
WHERE inspection_name = '共用部　鳩ネット取付工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'Investigation'
WHERE inspection_name = '害虫駆除調査';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'disinfection'
WHERE inspection_name = '害虫駆除消毒';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'exchange_corridor'
WHERE inspection_name = '共用廊下床シート工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'fire_exchange'
WHERE inspection_name = '感知器取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'surveillance_camera_installation_work'
WHERE inspection_name = '防犯カメラ工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'electrical_measurement'
WHERE inspection_name = '侵入防護柵工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = 'セキュリティ工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '出入口シャッター工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '屋内防火シャッター工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '屋外防火シャッター工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_spanner'
WHERE inspection_name = '消火ポンプメンテナンス';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_spanner'
WHERE inspection_name = '排水ポンプ取替工事';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'construction_toolbox'
WHERE inspection_name = '消防ホース取替';

UPDATE signage_master_inspection_types
SET category = '点検', template_no = 'construction_toolbox'
WHERE inspection_name = '消防ホース耐圧試験';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_building_large_scale'
WHERE inspection_name = '屋上看板LED取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'exchange_light_battery'
WHERE inspection_name = '共用部照明LED変更工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'exchange_light_battery'
WHERE inspection_name = '照明器具更新工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_television_equipment'
WHERE inspection_name = '衛星アンテナ取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'building_inspection'
WHERE inspection_name = 'テレビ視聴設備調査';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = '住戸玄関ドア枠塗装';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = '共用ドア塗装工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = 'エレベータドア塗装工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '自動火災報知更新工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'fire_extinguisher_explain'
WHERE inspection_name = '消火器取替';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = 'ゴミ置場改修工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_roller_paint'
WHERE inspection_name = '外構工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_spanner'
WHERE inspection_name = '給水管更新工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'electrical_measurement'
WHERE inspection_name = '電気設備工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'construction_toolbox'
WHERE inspection_name = '電気設備取替工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'painting_water_pipe'
WHERE inspection_name = '消火用ボックス塗装工事';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'water_activator_construction'
WHERE inspection_name = '給水ポンプ更新工事(断水）';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'protect_balcony_from_birds'
WHERE inspection_name = '防鳩工事のお知らせ';

UPDATE signage_master_inspection_types
SET category = '工事', template_no = 'protect_balcony_from_birds_2'
WHERE inspection_name = 'ハトネット工事のお知らせ';

-- 確認
SELECT inspection_name, category, template_no
FROM signage_master_inspection_types
ORDER BY category, inspection_name
LIMIT 20;
