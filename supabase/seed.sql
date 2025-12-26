-- ========================================
-- Signage CSV Form - Seed Data
-- ========================================
-- schema.sql 実行後にこのSQLを実行してください

-- ========================================
-- 受注先マスターデータ
-- ========================================
INSERT INTO signage_master_vendors (vendor_name, emergency_contact) VALUES
  ('山本クリーンシステム　有限会社', '092-934-0407'),
  ('日本オーチス・エレベータ　株式会社', '0120-324-365'),
  ('株式会社　えん建物管理', '092-260-5350'),
  ('西日本ビルテクノサービス　株式会社', '092-504-7741');

-- ========================================
-- 物件マスターデータ
-- ========================================
INSERT INTO signage_master_properties (property_code, property_name, terminals) VALUES
  ('2010', 'エンクレストガーデン福岡', '[
    {"terminalId": "h0001A00", "supplement": "センター棟"},
    {"terminalId": "h0001A01", "supplement": "Ａ棟"},
    {"terminalId": "h0001A02", "supplement": "Ｂ棟"},
    {"terminalId": "h0001A03", "supplement": "Ｃ棟"},
    {"terminalId": "h0001A04", "supplement": "Ｄ棟"},
    {"terminalId": "h0001A05", "supplement": "Ｅ棟"},
    {"terminalId": "h0001A06", "supplement": "Ｆ棟"}
  ]'),
  ('120406', 'アソシアグロッツォ天神サウス', '[{"terminalId": "z1003A01", "supplement": ""}]'),
  ('120408', 'アソシアグロッツォ博多プレイス', '[{"terminalId": "z1006A01", "supplement": ""}]'),
  ('120410', 'パリス大濠ベイタウン', '[{"terminalId": "z1001A01", "supplement": ""}]'),
  ('120411', 'ラフィネスシャトードゥ赤坂', '[{"terminalId": "z5221A01", "supplement": ""}]'),
  ('120412', 'LANDIC S4173', '[{"terminalId": "z1013A01", "supplement": ""}]'),
  ('120413', 'ラフィネスネオシティ平尾', '[{"terminalId": "z5779A01", "supplement": ""}]'),
  ('120419', 'アソシアグロッツォ博多サウスガーデン', '[{"terminalId": "z1009A01", "supplement": ""}]'),
  ('120420', 'ラフィネス薬院イーストタワー', '[{"terminalId": "z5800A01", "supplement": ""}]'),
  ('120428', 'ラフィネス大濠パークアべニュー', '[{"terminalId": "z5855A01", "supplement": ""}]'),
  ('120109', 'アソシアグロッツォタイムズスイート博多', '[{"terminalId": "z1002A01", "supplement": ""}]'),
  ('120407', 'アソシアグロッツオ博多サザンテラス', '[{"terminalId": "z1008A01", "supplement": ""}]'),
  ('120414', 'ラフィネス大濠パークサイド', '[{"terminalId": "z5510A01", "supplement": ""}]'),
  ('120415', 'ラフィネス博多リバーステージ', '[{"terminalId": "z5797A01", "supplement": ""}]'),
  ('120416', 'ラフィネスクロスロード博多ステーション', '[{"terminalId": "z5856A01", "supplement": ""}]'),
  ('120417', 'LANDIC K2620', '[{"terminalId": "z1016A01", "supplement": ""}]'),
  ('120418', 'ラフィネス薬院ウェストタワー', '[{"terminalId": "z5835A01", "supplement": ""}]'),
  ('120421', 'LANDIC N313', '[{"terminalId": "z1011A01", "supplement": ""}]'),
  ('120422', 'LANDIC H1916', '[{"terminalId": "z1012A01", "supplement": ""}]'),
  ('120423', 'LANDIC Y138', '[{"terminalId": "z1014A01", "supplement": ""}]'),
  ('120424', 'LANDIC N110', '[{"terminalId": "z1015A01", "supplement": ""}]'),
  ('120426', 'LANDIC O2239', '[{"terminalId": "z1018A01", "supplement": ""}]'),
  ('120427', 'LANDIC O2227', '[{"terminalId": "z1019A01", "supplement": ""}]'),
  ('130425', 'LANDIC K320', '[{"terminalId": "z1017A01", "supplement": ""}]');

-- ========================================
-- 点検種別マスターデータ（39種類）
-- ========================================
INSERT INTO signage_master_inspection_types (inspection_name, template_no, template_image, default_text) VALUES
  ('エレベーター定期点検', 'elevator_inspection', 'elevator_inspection.png', '点検中はエレベーター停止致します。
ご不便をおかけします。'),
  ('リモート点検', 'elevator_inspection', 'elevator_inspection.png', ''),
  ('建物設備点検', 'building_inspection', 'building_inspection.png', '点検のため、マンション内に調査員が立ち入りいたします。'),
  ('消防設備点検', 'fire_inspection', 'fire_inspection.png', '消防法令　第17条3の3に基づく消防設備点検です。避難器具の周囲には障害物を置かないで下さい是正対象となります。当日点検に伺う場合があります。点検予定希望日の事前アンケートにご協力下さい。'),
  ('貯水槽清掃（断水）', 'simple_dedicated_water_supply', 'simple_dedicated_water_supply.png', '断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。'),
  ('簡易専用水道検査', 'building_inspection', 'building_inspection.png', '点検のため、マンション内に調査員が立ち入り貯水槽の水質検査を行います。'),
  ('自動扉点検', 'automtic_doors', 'automtic_doors.png', '点検のため、マンション内に点検員が立ち入りいたします。点検中に、オートロックが反応しない場合は点検員へお声をかけて頂きますよう、お願い致します。'),
  ('機械式駐車場点検', 'mechanical_parking', 'mechanical_parking.png', '作業状況によっては入出庫に多少お待ち頂く場合がございます。
入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。
＊雨天・緊急等の場合　順延する場合があります。'),
  ('タワー式駐車場点検', 'tower_mechanical_parking', 'tower_mechanical_parking.png', '作業状況によっては入出庫に多少お待ち頂く場合がございます。
入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。
＊雨天・緊急等の場合　順延する場合がございます。'),
  ('防犯カメラ点検', 'surveillance_camera', 'surveillance_camera.png', '点検のため、マンション内に点検員が立ち入りいたします。'),
  ('防犯カメラ取付工事', 'surveillance_camera_installation_work', 'surveillance_camera_installation_work.png', '工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。'),
  ('給水ポンプ点検（断水）', 'water_supply_pump_construction', 'water_supply_pump_construction.png', '断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。'),
  ('定期清掃', 'cleaning', 'cleaning.png', '床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。'),
  ('特別清掃', 'cleaning', 'cleaning.png', '床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。
＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。'),
  ('エントランス定期清掃', 'cleaning', 'cleaning.png', '床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。'),
  ('照明器具清掃', 'construction_light', 'construction_light.png', '床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。
＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。'),
  ('共用部電気設備点検（停電）', 'shared_electrical_equipment', 'shared_electrical_equipment.png', '点検中、水道、エレベータ、インターホン、インターネット、機械駐車場が使えなくなります'),
  ('共用部電気設備点検', 'shared_electrical_equipment', 'shared_electrical_equipment.png', '点検のため、マンション内に調査員が立ち入りいたします。'),
  ('消防設備点検ご協力のお願い', 'fire_inspection', 'fire_inspection.png', '消防設備誤作動調査のため、お部屋に声をかけさせて頂く場合があります。ご協力お願いいたします、'),
  ('宅配ボックス点検', 'delivery_box', 'delivery_box.png', '点検状況によっては入出庫に多少お待ち頂く場合がございます。
入出庫の際は点検員へお声をかけて頂きますよう、お願い致します。'),
  ('植栽の手入れ', 'planting_management', 'planting_management.png', '植栽の手入れ、剪定あとの片づけのため、トラックを駐車いたします。＊雨天・緊急等の場合　順延する場合があります。'),
  ('芝生の手入れ', 'planting_management', 'planting_management.png', '芝刈り中は危険ですのでそばを通らないようお願いします。＊雨天・緊急等の場合　順延する場合があります。'),
  ('植栽の消毒作業', 'disinfection_tree', 'disinfection_tree.png', '薬剤散布がございます。
2～３階の方は、洗濯物を薬剤散布以降に干して頂きます様にお願い申し上げます。'),
  ('マット交換', 'elevator_mat_replacement', 'elevator_mat_replacement.png', 'ただいま、マットの準備中です。雨天の際に足元が滑りやすくなりますのでご注意ください。'),
  ('お部屋の排水管洗浄', 'drainage_pipe', 'drainage_pipe.png', '作業は２０分程で台所、浴室、洗面所の各排水口を洗浄致します。排水口付近の整理と在宅にご協力ください。入居者様の費用負担はございませんが、未実施で発生した排水管の詰まりによる事故及び漏水等の被害は入居者様負担となりますので、必ず実施をお願い申し上げます。'),
  ('お部屋と共用の排水管洗浄', 'drainage_pipe', 'drainage_pipe.png', '作業は２０分程で台所、浴室、洗面所の各排水口を洗浄致します。排水口付近の整理と在宅にご協力ください。入居者様の費用負担はございませんが、未実施で発生した排水管の詰まりによる事故及び漏水等の被害は入居者様負担となりますので、必ず実施をお願い申し上げます。'),
  ('音、振動を伴う工事', 'construction_involving_sound_vibration', 'construction_involving_sound_vibration.png', '工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。'),
  ('自動販売機工事', 'vending_machine_construction', 'vending_machine_construction.png', '作業のため、マンション敷地内に作業員が立ち入ります。物の搬入のため車両を駐車いたします。雨天の場合　順延する場合があります。'),
  ('屋上防水工事', 'waterproof_construction', 'waterproof_construction.png', '工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。'),
  ('鉄部塗装', 'iron_part_coating', 'iron_part_coating.png', '工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。'),
  ('自転車撤去', 'bicycle_removal', 'bicycle_removal.png', '建物敷地内駐輪場における放置自転車等の調査・撤去を行います。
なお、契約ステッカーを貼付されていない方はご購入下さい。
ご協力の程よろしくお願い致します。'),
  ('バイク置場工事', 'construction_involving_sound_vibration', 'construction_involving_sound_vibration.png', '工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。'),
  ('外壁タイル調査', 'exterior_wall_tile_inspection', 'exterior_wall_tile_inspection.png', '調査員が立ち入り、音と振動を伴います。また外壁を調査員が下がってきますので窓のカーテンを閉めてください。雨天のため順延する場合がございます。'),
  ('特殊建築物調査', 'building_inspection', 'building_inspection.png', '点検のため、マンション内に調査員が立ち入りいたします。雨天の場合　順延する場合があります。'),
  ('駐車場工事', 'construction_involving_sound_vibration', 'construction_involving_sound_vibration.png', '工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。'),
  ('インターネット機器工事', 'Questionnaire_conducted02', 'Questionnaire_conducted02.png', 'インターネット機器工事を行います　工事中はインターネットの利用ができません'),
  ('機械式駐車場工事', 'mechanical_parking', 'mechanical_parking.png', '作業には音と振動を伴います。機械式駐車場が使用できない場合があります。契約車両の移動をお願いする場合もございますのでご協力お願いします。
＊雨天・緊急対応等の場合　順延する場合があります。'),
  ('ポンプ工事（断水）', 'water_supply_pump_construction', 'water_supply_pump_construction.png', '断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。'),
  ('貯水槽清掃', 'simple_dedicated_water_supply', 'simple_dedicated_water_supply.png', '貯水槽清掃のため、マンション内に作業員が立ち入りいたします。断水はありませんが完了後、濁り水が出る場合があります。その際はしばらく流してご使用ください。');

-- ========================================
-- 初期管理者ユーザーの設定
-- ========================================
-- Supabase Authでユーザー作成後、以下を実行して管理者権限を付与
-- UPDATE signage_profiles SET role = 'admin' WHERE email = 'admin@example.com';
