// セキュリティ: HTMLエスケープ
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// DBから読み込んだテンプレート画像を保持
let dbTemplateImages = [];

// 管理者用: 選択中のベンダーID（管理者が他社として入力する場合）
let selectedVendorIdForAdmin = null;

const templateImages = {
    "exchange_light_battery_2": "images/exchange_light_battery_2.png",
    "painting_water_pipe": "images/painting_water_pipe.png",
    "disinfection_tree": "images/disinfection_tree.png",
    "exchange_light_battery": "images/exchange_light_battery.png",
    "waterproof_construction": "images/waterproof_construction.png",
    "high_pressure_cleaning_2": "images/high_pressure_cleaning_2.png",
    "bicycle_removal": "images/bicycle_removal.png",
    "construction_building_large_scale": "images/construction_building_large_scale.png",
    "construction_coin_parking": "images/construction_coin_parking.png",
    "fire_extinguisher_explain": "images/fire_extinguisher_explain.png",
    "construction_light": "images/construction_light.png",
    "construction_toolbox": "images/construction_toolbox.png",
    "cleaning": "images/cleaning.png",
    "Investigation": "images/Investigation.png",
    "construction_television_equipment": "images/construction_television_equipment.png",
    "water_activator_construction": "images/water_activator_construction.png",
    "high_pressure_cleaning": "images/high_pressure_cleaning.png",
    "automatic_doors": "images/automatic_doors.png",
    "glass_clean": "images/glass_clean.png",
    "mechanical_parking": "images/mechanical_parking.png",
    "planting_management": "images/planting_management.png",
    "construction_outer_wall": "images/construction_outer_wall.png",
    "construction_jcom_cable": "images/construction_jcom_cable.png",
    "simple_dedicated_water_supply": "images/simple_dedicated_water_supply.png",
    "surveillance_camera_installation_work": "images/surveillance_camera_installation_work.png",
    "tower_mechanical_parking": "images/tower_mechanical_parking.png",
    "construction_involving_sound_vibration": "images/construction_involving_sound_vibration.png",
    "elevator_inspection": "images/elevator_inspection.png",
    "shared_electrical_equipment": "images/shared_electrical_equipment.png",
    "mechanical_parking_turntable": "images/mechanical_parking_turntable.png",
    "delivery_box": "images/delivery_box.png",
    "disinfection": "images/disinfection.png",
    "Questionnaire_conducted01": "images/Questionnaire_conducted01.png",
    "protect_balcony_from_birds": "images/protect_balcony_from_birds.png",
    "elevator_mat_replacement": "images/elevator_mat_replacement.png",
    "construction_roller_paint": "images/construction_roller_paint.png",
    "merchari_installation": "images/merchari_installation.png",
    "iron_part_coating": "images/iron_part_coating.png",
    "construction_Intercom": "images/construction_Intercom.png",
    "drainage_pipe": "images/drainage_pipe.png",
    "protect_balcony_from_birds_2": "images/protect_balcony_from_birds_2.png",
    "construction_spanner": "images/construction_spanner.png",
    "fire_construction": "images/fire_construction.png",
    "surveillance_camera": "images/surveillance_camera.png",
    "vending_machine_construction_2": "images/vending_machine_construction_2.png",
    "shared_area_drain_pipe_inspection": "images/shared_area_drain_pipe_inspection.png",
    "Construction_without_sound": "images/Construction_without_sound.png",
    "card_reader": "images/card_reader.png",
    "water_supply_pump_construction": "images/water_supply_pump_construction.png",
    "electrical_measurement": "images/electrical_measurement.png",
    "shared_area_drain_pipe_wash": "images/shared_area_drain_pipe_wash.png",
    "exchange_corridor": "images/exchange_corridor.png",
    "building_inspection": "images/building_inspection.png",
    "exterior_wall_tile_inspection": "images/exterior_wall_tile_inspection.png",
    "cleaning_bucket": "images/cleaning_bucket.png",
    "delivery_box_stop_using": "images/delivery_box_stop_using.png",
    "fire_exchange": "images/fire_exchange.png",
    "construction_mobile_antenna": "images/construction_mobile_antenna.png",
    "Questionnaire_conducted02": "images/Questionnaire_conducted02.png",
    "vending_machine_construction": "images/vending_machine_construction.png"
};

// テンプレート画像URLを取得（DB優先、ハードコードをフォールバック）
function getTemplateImageUrl(templateKey) {
    if (!templateKey) return null;

    // 1. DBテンプレート画像から検索
    const dbImage = dbTemplateImages.find(ti => ti.image_key === templateKey);
    if (dbImage && dbImage.image_url) {
        return dbImage.image_url;
    }

    // 2. ハードコードされたテンプレート画像から検索
    if (templateImages[templateKey]) {
        return templateImages[templateKey];
    }

    // 3. 日時プレフィックス付きの場合（例: "1124 235959cleaning"）、末尾のキーを抽出
    for (const key of Object.keys(templateImages)) {
        if (templateKey.endsWith(key)) {
            return templateImages[key];
        }
    }

    return null;
}

// テンプレート画像の存在確認
function hasTemplateImage(templateKey) {
    return getTemplateImageUrl(templateKey) !== null;
}

        // グローバルスコープでmasterDataを定義（初期値はハードコード、Supabaseから上書き可能）
        window.masterData = window.masterData || {"properties":[{"propertyCode":2010,"propertyName":"エンクレストガーデン福岡","terminalId":"h0001A00","supplement":"センター棟","address":"福岡県福岡市中央区小笹４－５"},{"propertyCode":2010,"propertyName":"エンクレストガーデン福岡","terminalId":"h0001A01","supplement":"Ａ棟","address":"福岡県福岡市中央区小笹４－５"},{"propertyCode":2010,"propertyName":"エンクレストガーデン福岡","terminalId":"h0001A02","supplement":"Ｂ棟","address":"福岡県福岡市中央区小笹４－５"},{"propertyCode":2010,"propertyName":"エンクレストガーデン福岡","terminalId":"h0001A03","supplement":"Ｃ棟","address":"福岡県福岡市中央区小笹４－５"},{"propertyCode":2010,"propertyName":"エンクレストガーデン福岡","terminalId":"h0001A04","supplement":"Ｄ棟","address":"福岡県福岡市中央区小笹４－５"},{"propertyCode":2010,"propertyName":"エンクレストガーデン福岡","terminalId":"h0001A05","supplement":"Ｅ棟","address":"福岡県福岡市中央区小笹４－５"},{"propertyCode":2010,"propertyName":"エンクレストガーデン福岡","terminalId":"h0001A06","supplement":"Ｆ棟","address":"福岡県福岡市中央区小笹４－５"},{"propertyCode":120406,"propertyName":"アソシアグロッツォ天神サウス","terminalId":"z1003A01","supplement":"","address":""},{"propertyCode":120408,"propertyName":"アソシアグロッツォ博多プレイス","terminalId":"z1006A01","supplement":"","address":""},{"propertyCode":120410,"propertyName":"パリス大濠ベイタウン","terminalId":"z1001A01","supplement":"","address":""},{"propertyCode":120411,"propertyName":"ラフィネスシャトードゥ赤坂","terminalId":"z5221A01","supplement":"","address":""},{"propertyCode":120412,"propertyName":"LANDIC S4173","terminalId":"z1013A01","supplement":"","address":""},{"propertyCode":120413,"propertyName":"ラフィネスネオシティ平尾","terminalId":"z5779A01","supplement":"","address":""},{"propertyCode":120419,"propertyName":"アソシアグロッツォ博多サウスガーデン","terminalId":"z1009A01","supplement":"","address":""},{"propertyCode":120420,"propertyName":"ラフィネス薬院イーストタワー","terminalId":"z5800A01","supplement":"","address":""},{"propertyCode":120428,"propertyName":"ラフィネス大濠パークアべニュー","terminalId":"z5855A01","supplement":"","address":""},{"propertyCode":120109,"propertyName":"アソシアグロッツォタイムズスイート博多","terminalId":"z1002A01","supplement":"","address":""},{"propertyCode":120407,"propertyName":"アソシアグロッツオ博多サザンテラス","terminalId":"z1008A01","supplement":"","address":""},{"propertyCode":120414,"propertyName":"ラフィネス大濠パークサイド","terminalId":"z5510A01","supplement":"","address":""},{"propertyCode":120415,"propertyName":"ラフィネス博多リバーステージ","terminalId":"z5797A01","supplement":"","address":""},{"propertyCode":120416,"propertyName":"ラフィネスクロスロード博多ステーション","terminalId":"z5856A01","supplement":"","address":""},{"propertyCode":120417,"propertyName":"LANDIC K2620","terminalId":"z1016A01","supplement":"","address":""},{"propertyCode":120418,"propertyName":"ラフィネス薬院ウェストタワー","terminalId":"z5835A01","supplement":"","address":""},{"propertyCode":120421,"propertyName":"LANDIC N313","terminalId":"z1011A01","supplement":"","address":""},{"propertyCode":120422,"propertyName":"LANDIC H1916","terminalId":"z1012A01","supplement":"","address":""},{"propertyCode":120423,"propertyName":"LANDIC Y138","terminalId":"z1014A01","supplement":"","address":""},{"propertyCode":120424,"propertyName":"LANDIC N110","terminalId":"z1015A01","supplement":"","address":""},{"propertyCode":120426,"propertyName":"LANDIC O2239","terminalId":"z1018A01","supplement":"","address":""},{"propertyCode":120427,"propertyName":"LANDIC O2227","terminalId":"z1019A01","supplement":"","address":""},{"propertyCode":130425,"propertyName":"LANDIC K320","terminalId":"z1017A01","supplement":"","address":""}],"vendors":[{"vendorName":"山本クリーンシステム　有限会社","emergencyContact":"092-934-0407","category":"清掃"},{"vendorName":"日本オーチス・エレベータ　株式会社","emergencyContact":"0120-324-365","category":"点検"},{"vendorName":"株式会社　えん建物管理","emergencyContact":"092-260-5350","category":"点検"},{"vendorName":"西日本ビルテクノサービス　株式会社","emergencyContact":"092-504-7741","category":"点検"},{"vendorName":"山本クリーンシステム　有限会社","emergencyContact":"092-934-0407","category":"点検"}],"categories":["点検","工事","清掃","アンケート"],"notices":[{"id":1,"inspectionType":"エレベーター定期点検","categoryId":8,"showOnBoard":true,"templateNo":"elevator_inspection","noticeText":"点検中はエレベーター停止致します。\nご不便をおかけします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":2,"inspectionType":"リモート点検","categoryId":8,"showOnBoard":false,"templateNo":"elevator_inspection","noticeText":"","frameNo":2,"image":"","daysBeforeStart":30},{"id":3,"inspectionType":"建物設備点検","categoryId":4,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"点検のため、マンション内に調査員が立ち入りいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":4,"inspectionType":"消防設備点検","categoryId":9,"showOnBoard":true,"templateNo":"fire_inspection","noticeText":"消防法令　第17条3の3に基づく消防設備点検です。避難器具の周囲には障害物を置かないで下さい是正対象となります。当日点検に伺う場合があります。点検予定希望日の事前アンケートにご協力下さい。","frameNo":2,"image":"fire_inspection.pdf","daysBeforeStart":30},{"id":5,"inspectionType":"貯水槽清掃（断水）","categoryId":10,"showOnBoard":true,"templateNo":"simple_dedicated_water_supply","noticeText":"断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。","frameNo":2,"image":"","daysBeforeStart":30},{"id":6,"inspectionType":"簡易専用水道検査","categoryId":11,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"点検のため、マンション内に調査員が立ち入り貯水槽の水質検査を行います。","frameNo":2,"image":"","daysBeforeStart":30},{"id":7,"inspectionType":"自動扉点検","categoryId":12,"showOnBoard":true,"templateNo":"automatic_doors","noticeText":"点検のため、マンション内に点検員が立ち入りいたします。点検中に、オートロックが反応しない場合は点検員へお声をかけて頂きますよう、お願い致します。","frameNo":2,"image":"","daysBeforeStart":30},{"id":8,"inspectionType":"機械式駐車場点検","categoryId":13,"showOnBoard":true,"templateNo":"mechanical_parking","noticeText":"作業状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。\n＊雨天・緊急等の場合　順延する場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":9,"inspectionType":"タワー式駐車場点検","categoryId":14,"showOnBoard":true,"templateNo":"tower_mechanical_parking","noticeText":"作業状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。\n＊雨天・緊急等の場合　順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":10,"inspectionType":"防犯カメラ点検","categoryId":16,"showOnBoard":true,"templateNo":"surveillance_camera","noticeText":"点検のため、マンション内に点検員が立ち入りいたします。","frameNo":2,"image":"surveillance_camera.pdf","daysBeforeStart":30},{"id":11,"inspectionType":"防犯カメラ取付工事","categoryId":16,"showOnBoard":true,"templateNo":"surveillance_camera_installation_work","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":12,"inspectionType":"給水ポンプ点検（断水）","categoryId":17,"showOnBoard":true,"templateNo":"water_supply_pump_construction","noticeText":"断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。","frameNo":2,"image":"","daysBeforeStart":30},{"id":13,"inspectionType":"定期清掃","categoryId":19,"showOnBoard":true,"templateNo":"cleaning","noticeText":"床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。","frameNo":2,"image":"cleaning.pdf","daysBeforeStart":30},{"id":14,"inspectionType":"特別清掃","categoryId":20,"showOnBoard":true,"templateNo":"cleaning","noticeText":"床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。\n＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":15,"inspectionType":"エントランス定期清掃","categoryId":19,"showOnBoard":true,"templateNo":"cleaning","noticeText":"床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":16,"inspectionType":"照明器具清掃","categoryId":20,"showOnBoard":true,"templateNo":"construction_light","noticeText":"床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。\n＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":17,"inspectionType":"共用部電気設備点検（停電）","categoryId":70,"showOnBoard":true,"templateNo":"shared_electrical_equipment","noticeText":"点検中、水道、エレベータ、インターホン、インターネット、機械駐車場が使えなくなります","frameNo":2,"image":"","daysBeforeStart":30},{"id":18,"inspectionType":"共用部電気設備点検","categoryId":70,"showOnBoard":true,"templateNo":"shared_electrical_equipment","noticeText":"点検のため、マンション内に調査員が立ち入りいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":19,"inspectionType":"消防設備点検ご協力のお願い","categoryId":9,"showOnBoard":true,"templateNo":"fire_inspection","noticeText":"消防設備誤作動調査のため、お部屋に声をかけさせて頂く場合があります。ご協力お願いいたします、","frameNo":2,"image":"","daysBeforeStart":30},{"id":20,"inspectionType":"宅配ボックス点検","categoryId":15,"showOnBoard":true,"templateNo":"delivery_box","noticeText":"点検状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は点検員へお声をかけて頂きますよう、お願い致します。","frameNo":2,"image":"mail_box.pdf","daysBeforeStart":30},{"id":21,"inspectionType":"植栽の手入れ","categoryId":23,"showOnBoard":true,"templateNo":"planting_management","noticeText":"植栽の手入れ、剪定あとの片づけのため、トラックを駐車いたします。＊雨天・緊急等の場合　順延する場合があります。","frameNo":2,"image":"planting_management.pdf","daysBeforeStart":30},{"id":22,"inspectionType":"芝生の手入れ","categoryId":23,"showOnBoard":true,"templateNo":"planting_management","noticeText":"芝刈り中は危険ですのでそばを通らないようお願いします。＊雨天・緊急等の場合　順延する場合があります。","frameNo":2,"image":"planting_management.pdf","daysBeforeStart":30},{"id":23,"inspectionType":"植栽の消毒作業","categoryId":23,"showOnBoard":true,"templateNo":"disinfection_tree","noticeText":"薬剤散布がございます。\n2～３階の方は、洗濯物を薬剤散布以降に干して頂きます様にお願い申し上げます。","frameNo":2,"image":"disinfection_tree","daysBeforeStart":30},{"id":24,"inspectionType":"マット交換","categoryId":22,"showOnBoard":true,"templateNo":"","noticeText":"ただいま、マットの準備中です。雨天の際に足元が滑りやすくなりますのでご注意ください。","frameNo":2,"image":"","daysBeforeStart":30},{"id":25,"inspectionType":"お部屋の排水管洗浄","categoryId":39,"showOnBoard":true,"templateNo":"drainage_pipe","noticeText":"作業は２０分程で台所、浴室、洗面所の各排水口を洗浄致します。排水口付近の整理と在宅にご協力ください。入居者様の費用負担はございませんが、未実施で発生した排水管の詰まりによる事故及び漏水等の被害は入居者様負担となりますので、必ず実施をお願い申し上げます。","frameNo":2,"image":"drain_pipe_cleaning_truck.pdf","daysBeforeStart":30},{"id":26,"inspectionType":"お部屋と共用の排水管洗浄","categoryId":39,"showOnBoard":true,"templateNo":"drainage_pipe","noticeText":"作業は２０分程で台所、浴室、洗面所の各排水口を洗浄致します。排水口付近の整理と在宅にご協力ください。入居者様の費用負担はございませんが、未実施で発生した排水管の詰まりによる事故及び漏水等の被害は入居者様負担となりますので、必ず実施をお願い申し上げます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":27,"inspectionType":"音、振動を伴う工事","categoryId":48,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"construction_involving_sound_vibration.pdf","daysBeforeStart":30},{"id":28,"inspectionType":"自動販売機工事","categoryId":58,"showOnBoard":true,"templateNo":"vending_machine_construction","noticeText":"作業のため、マンション敷地内に作業員が立ち入ります。物の搬入のため車両を駐車いたします。雨天の場合　順延する場合があります。","frameNo":2,"image":"vending_machine_construction.pdf","daysBeforeStart":30},{"id":29,"inspectionType":"屋上防水工事","categoryId":139,"showOnBoard":true,"templateNo":"waterproof_construction","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"waterproof_construction.pdf","daysBeforeStart":30},{"id":30,"inspectionType":"鉄部塗装","categoryId":141,"showOnBoard":true,"templateNo":"iron_part_coating","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":31,"inspectionType":"自転車撤去","categoryId":133,"showOnBoard":true,"templateNo":"bicycle_removal","noticeText":"建物敷地内駐輪場における放置自転車等の調査・撤去を行います。\nなお、契約ステッカーを貼付されていない方はご購入下さい。\nご協力の程よろしくお願い致します。","frameNo":2,"image":"","daysBeforeStart":30},{"id":32,"inspectionType":"バイク置場工事","categoryId":67,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":33,"inspectionType":"外壁タイル調査","categoryId":38,"showOnBoard":true,"templateNo":"exterior_wall_tile_inspection","noticeText":"調査員が立ち入り、音と振動を伴います。また外壁を調査員が下がってきますので窓のカーテンを閉めてください。雨天のため順延する場合がございます。","frameNo":2,"image":"exterior_wall_tile_inspection.pdf","daysBeforeStart":30},{"id":34,"inspectionType":"特殊建築物調査","categoryId":38,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"点検のため、マンション内に調査員が立ち入りいたします。雨天の場合　順延する場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":35,"inspectionType":"駐車場工事","categoryId":43,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":36,"inspectionType":"インターネット機器工事","categoryId":58,"showOnBoard":true,"templateNo":"questionnaire_conducted02","noticeText":"インターネット機器工事を行います　工事中はインターネットの利用ができません","frameNo":2,"image":"","daysBeforeStart":30},{"id":37,"inspectionType":"機械式駐車場工事","categoryId":43,"showOnBoard":true,"templateNo":"mechanical_parking","noticeText":"作業には音と振動を伴います。機械式駐車場が使用できない場合があります。契約車両の移動をお願いする場合もございますのでご協力お願いします。\n＊雨天・緊急対応等の場合　順延する場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":38,"inspectionType":"ポンプ工事（断水）","categoryId":44,"showOnBoard":true,"templateNo":"water_supply_pump_construction","noticeText":"断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。","frameNo":2,"image":"","daysBeforeStart":30},{"id":39,"inspectionType":"貯水槽清掃","categoryId":10,"showOnBoard":true,"templateNo":"simple_dedicated_water_supply","noticeText":"貯水槽清掃のため、マンション内に作業員が立ち入りいたします。断水はありませんが完了後、濁り水が出る場合があります。その際はしばらく流してご使用ください。","frameNo":2,"image":"","daysBeforeStart":30},{"id":40,"inspectionType":"給水ポンプ点検","categoryId":17,"showOnBoard":true,"templateNo":"water_supply_pump_construction","noticeText":"点検のため、マンション内に点検員が立ち入りいたします。断水はありませんが点検完了後、濁り水が出る場合があります。その際はしばらく流してご使用ください。","frameNo":2,"image":"","daysBeforeStart":30},{"id":41,"inspectionType":"給水ポンプ点検","categoryId":4,"showOnBoard":true,"templateNo":"water_supply_pump_construction","noticeText":"点検のため、マンション内に点検員が立ち入りいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":42,"inspectionType":"携帯アンテナ工事","categoryId":58,"showOnBoard":true,"templateNo":"construction_mobile_antenna","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":43,"inspectionType":"宅配ボックス使用停止中","categoryId":154,"showOnBoard":true,"templateNo":"delivery_box_stop_using","noticeText":"ご不便をおかけいたしています。対応中ですのでもうしばらくお待ちください。","frameNo":2,"image":"","daysBeforeStart":30},{"id":44,"inspectionType":"共用部の排水管洗浄","categoryId":39,"showOnBoard":true,"templateNo":"shared_area_drain_pipe_wash","noticeText":"共用部の排水管洗浄を行います。工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。","frameNo":2,"image":"","daysBeforeStart":30},{"id":45,"inspectionType":"消防設備連結管耐圧試験","categoryId":51,"showOnBoard":true,"templateNo":"shared_area_drain_pipe_inspection","noticeText":"耐圧試験のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":46,"inspectionType":"エレベーター定期点検","categoryId":8,"showOnBoard":true,"templateNo":"elevator_inspection","noticeText":"作業中はエレベーターのご利用を停止致します。\nご不便をおかけします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":47,"inspectionType":"外壁タイル工事","categoryId":153,"showOnBoard":true,"templateNo":"construction_outer wall","noticeText":"作業には音と振動を伴います。また物の搬入のため車両を駐車いたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":48,"inspectionType":"カードリーダー更新工事","categoryId":138,"showOnBoard":true,"templateNo":"card_reader","noticeText":"工事中に、オートロックが反応しない場合は別の出入り口に頂きますよう、お願い致します。","frameNo":2,"image":"","daysBeforeStart":30},{"id":49,"inspectionType":"エレベータマット取替工事","categoryId":135,"showOnBoard":true,"templateNo":"elevator_mat_replacement","noticeText":"作業中はエレベーターのご利用を停止致します。\nご不便をおかけします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":50,"inspectionType":"エレベーター保守作業","categoryId":151,"showOnBoard":true,"templateNo":"elevator_inspection","noticeText":"作業中はエレベーターのご利用を停止致します。\nご不便をおかけします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":51,"inspectionType":"特別清掃","categoryId":48,"showOnBoard":true,"templateNo":"high_pressure_cleaning","noticeText":"床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。\n＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。","frameNo":2,"image":"AAA","daysBeforeStart":30},{"id":52,"inspectionType":"作業のため作業員が入ります","categoryId":48,"showOnBoard":true,"templateNo":"construction_without_sound","noticeText":"工事のためマンション敷地内に作業員が立ち入ります。また荷物搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":53,"inspectionType":"消防設備点検アンケート","categoryId":9,"showOnBoard":true,"templateNo":"questionnaire_conducted01","noticeText":"消防点検のアンケートを配布しております。ご協力お願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":54,"inspectionType":"消防設備工事アンケート","categoryId":143,"showOnBoard":true,"templateNo":"questionnaire_conducted01","noticeText":"消防設備改修のための、のアンケートを配布しております。ご協力お願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":55,"inspectionType":"排水管洗浄アンケート","categoryId":39,"showOnBoard":true,"templateNo":"questionnaire_conducted01","noticeText":"排水管洗浄のアンケートを配布しております。ご協力お願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":56,"inspectionType":"インターホン工事アンケート","categoryId":136,"showOnBoard":true,"templateNo":"questionnaire_conducted01","noticeText":"インターホン取替工事のアンケートを配布しております。ご協力お願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":57,"inspectionType":"入居者様アンケート","categoryId":92,"showOnBoard":true,"templateNo":"questionnaire_conducted02","noticeText":"アンケート結果は、今後の物件企画・開発の為に参考にさせて頂きます。ご協力お願い致します。","frameNo":2,"image":"","daysBeforeStart":30},{"id":58,"inspectionType":"1年点検アンケート","categoryId":73,"showOnBoard":true,"templateNo":"questionnaire_conducted02","noticeText":"竣工1年目のアフター点検のアンケートを配布しております。ご協力お願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":59,"inspectionType":"2年点検アンケート","categoryId":73,"showOnBoard":true,"templateNo":"questionnaire_conducted02","noticeText":"竣工2年目のアフター点検のアンケートを配布しております。ご協力お願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":60,"inspectionType":"大規模修繕工事アンケート","categoryId":74,"showOnBoard":true,"templateNo":"questionnaire_conducted02","noticeText":"大規模修繕に伴うアンケートを配布しております。ご協力お願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":61,"inspectionType":"給水ポンプ点検（断水）","categoryId":17,"showOnBoard":true,"templateNo":"water_supply_pump_construction","noticeText":"断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。","frameNo":2,"image":"","daysBeforeStart":30},{"id":62,"inspectionType":"チャリチャリ設置工事","categoryId":133,"showOnBoard":true,"templateNo":"merchari_installation","noticeText":"マンションに、シェアサイクルのポートを設置しております","frameNo":2,"image":"","daysBeforeStart":30},{"id":63,"inspectionType":"携帯アンテナ工事","categoryId":58,"showOnBoard":true,"templateNo":"construction_mobile_antenna","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":64,"inspectionType":"消防訓練掲示","categoryId":9,"showOnBoard":true,"templateNo":"fire_extinguisher_explain","noticeText":"訓練中に、放送、警報が鳴る場合がございます","frameNo":2,"image":"","daysBeforeStart":30},{"id":65,"inspectionType":"ターンテーブル点検","categoryId":94,"showOnBoard":true,"templateNo":"mechanical_parking_turntable","noticeText":"作業状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。\n＊雨天・緊急等の場合　順延する場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":66,"inspectionType":"建築設備調査","categoryId":38,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"点検のため、マンション内に調査員が立ち入りいたします。雨天の場合　順延する場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":67,"inspectionType":"植栽の手入れ","categoryId":146,"showOnBoard":true,"templateNo":"planting_management","noticeText":"植栽の手入れ、剪定あとの片づけのため、トラックを駐車いたします。＊雨天・緊急等の場合　順延する場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":68,"inspectionType":"コインパーキング工事","categoryId":120,"showOnBoard":true,"templateNo":"construction_coin_parking","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":69,"inspectionType":"音、振動を伴う工事","categoryId":78,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"construction_involving_sound_vibration.pdf","daysBeforeStart":30},{"id":70,"inspectionType":"自転車撤去","categoryId":133,"showOnBoard":true,"templateNo":"bicycle_removal","noticeText":"建物敷地内駐輪場における放置自転車等の調査・撤去を行います。\nなお、契約ステッカーを貼付されていない方はご購入下さい。\nご協力の程よろしくお願い致します。","frameNo":2,"image":"","daysBeforeStart":30},{"id":71,"inspectionType":"活水装置工事","categoryId":40,"showOnBoard":true,"templateNo":"water_activator_construction","noticeText":"断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。","frameNo":2,"image":"","daysBeforeStart":30},{"id":72,"inspectionType":"インターホン工事","categoryId":136,"showOnBoard":true,"templateNo":"construction_Intercom","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":73,"inspectionType":"共用部照明工事","categoryId":137,"showOnBoard":true,"templateNo":"construction_light","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":74,"inspectionType":"カードリーダー工事","categoryId":138,"showOnBoard":true,"templateNo":"card_reader","noticeText":"工事のため,カードリーダーが使用できません。作業には音と振動を伴います。皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":75,"inspectionType":"連結送水管耐圧試験","categoryId":51,"showOnBoard":true,"templateNo":"shared_area_drain_pipe_inspection","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":76,"inspectionType":"自動販売機工事","categoryId":58,"showOnBoard":true,"templateNo":"vending_machine_construction_2","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":77,"inspectionType":"携帯アンテナ工事","categoryId":58,"showOnBoard":true,"templateNo":"construction_mobile_antenna","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":78,"inspectionType":"大規模修繕工事","categoryId":74,"showOnBoard":true,"templateNo":"construction_building_large_scale","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":79,"inspectionType":"外壁タイル工事","categoryId":74,"showOnBoard":true,"templateNo":"construction_outer_wall","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":80,"inspectionType":"視聴設備更新工事","categoryId":140,"showOnBoard":true,"templateNo":"construction_television_equipment","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":81,"inspectionType":"JCOMケーブル工事","categoryId":140,"showOnBoard":true,"templateNo":"construction_jcom_cable","noticeText":"点検のため、マンション内に調査員が立ち入りいたします。雨天の場合　順延する場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":82,"inspectionType":"消防改修工事","categoryId":143,"showOnBoard":true,"templateNo":"fire_construction","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":83,"inspectionType":"有線放送工事","categoryId":140,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のためマンション敷地内に作業員が立ち入ります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":84,"inspectionType":"ガラス清掃","categoryId":72,"showOnBoard":true,"templateNo":"glass_clean","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":85,"inspectionType":"共用部電気設備点検（停電）","categoryId":144,"showOnBoard":true,"templateNo":"shared_electrical_equipment","noticeText":"点検中、水道、エレベータ、インターホン、インターネット、機械駐車場が使えなくなります","frameNo":2,"image":"","daysBeforeStart":30},{"id":86,"inspectionType":"特定防火対象物点検","categoryId":38,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"点検のため、マンション内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":87,"inspectionType":"シャッター点検","categoryId":89,"showOnBoard":true,"templateNo":"electrical_measurement","noticeText":"点検のため、マンション内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":88,"inspectionType":"電子掲示板メンテナンス","categoryId":123,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"点検のため、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":89,"inspectionType":"空冷設備点検","categoryId":97,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"点検のため、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":90,"inspectionType":"全熱交換器点検","categoryId":98,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"点検のため、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":91,"inspectionType":"自動制御装置点検","categoryId":99,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"調査のため、建物内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":92,"inspectionType":"中央監視装置点検","categoryId":100,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"調査のため、建物内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":93,"inspectionType":"上水受水槽清掃","categoryId":102,"showOnBoard":true,"templateNo":"simple_dedicated_water_supply","noticeText":"貯水槽清掃のため、作業員が立ち入りいたします。断水はありませんが完了後、濁り水が出る場合があります。その際はしばらく流してご使用ください。","frameNo":2,"image":"","daysBeforeStart":30},{"id":94,"inspectionType":"再生水受水槽清掃","categoryId":103,"showOnBoard":true,"templateNo":"simple_dedicated_water_supply","noticeText":"貯水槽清掃のため、作業員が立ち入りいたします。断水はありませんが完了後、濁り水が出る場合があります。その際はしばらく流してご使用ください。","frameNo":2,"image":"","daysBeforeStart":30},{"id":95,"inspectionType":"貯湯タンク清掃","categoryId":104,"showOnBoard":true,"templateNo":"simple_dedicated_water_supply","noticeText":"貯水槽清掃のため、マンション内に作業員が立ち入りいたします。断水はありませんが完了後、濁り水が出る場合があります。その際はしばらく流してご使用ください。","frameNo":2,"image":"","daysBeforeStart":30},{"id":96,"inspectionType":"水質検査","categoryId":105,"showOnBoard":true,"templateNo":"Investigation","noticeText":"水質検査のため、建物内に検査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":97,"inspectionType":"雑用水水質検査","categoryId":106,"showOnBoard":true,"templateNo":"Investigation","noticeText":"水質検査のため、建物内に検査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":98,"inspectionType":"残留塩素測定","categoryId":107,"showOnBoard":true,"templateNo":"Investigation","noticeText":"測定のため、建物内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":99,"inspectionType":"簡易専用水道検査","categoryId":108,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"水道検査のため、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":100,"inspectionType":"ホルムアルデヒド測定","categoryId":109,"showOnBoard":true,"templateNo":"Investigation","noticeText":"測定のため、建物内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":101,"inspectionType":"空気環境測定","categoryId":110,"showOnBoard":true,"templateNo":"Investigation","noticeText":"環境測定のため、建物内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":102,"inspectionType":"ねずみ等の調査・防除調査","categoryId":111,"showOnBoard":true,"templateNo":"Investigation","noticeText":"調査のため、建物内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":103,"inspectionType":"グリーストラップ清掃","categoryId":114,"showOnBoard":true,"templateNo":"cleaning_bucket","noticeText":"清掃のため、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":104,"inspectionType":"発電設備点検","categoryId":115,"showOnBoard":true,"templateNo":"electrical_measurement","noticeText":"点検のため、建物内に調査員が立ち入りいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":105,"inspectionType":"ターンテーブル設備点検","categoryId":116,"showOnBoard":true,"templateNo":"mechanical_parking_turntable","noticeText":"作業状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。\n＊雨天・緊急等の場合　順延する場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":106,"inspectionType":"電子掲示板工事","categoryId":123,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":107,"inspectionType":"ガス安全点検","categoryId":145,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"点検のため、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":108,"inspectionType":"アスファルト補修工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":109,"inspectionType":"植栽工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":110,"inspectionType":"インターロッキング補修工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":111,"inspectionType":"ゴミ置場補修工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":112,"inspectionType":"駐輪場工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":113,"inspectionType":"外壁補修工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_outer wall","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":114,"inspectionType":"エントランスドア補修","categoryId":147,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":115,"inspectionType":"窓サッシ補修工事","categoryId":147,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":116,"inspectionType":"住戸玄関ドア工事","categoryId":147,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":117,"inspectionType":"窓ガラス取替工事","categoryId":147,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":118,"inspectionType":"エントランスドア調整工事","categoryId":147,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"点検のため、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":119,"inspectionType":"共用部クロス補修工事","categoryId":147,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"点検のため、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":120,"inspectionType":"エントランス自動ドア工事","categoryId":148,"showOnBoard":true,"templateNo":"automatic_doors","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。","frameNo":2,"image":"","daysBeforeStart":30},{"id":122,"inspectionType":"裏口自動ドア工事","categoryId":148,"showOnBoard":true,"templateNo":"automatic_doors","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。","frameNo":2,"image":"","daysBeforeStart":30},{"id":123,"inspectionType":"駐輪場自動ドア工事","categoryId":148,"showOnBoard":true,"templateNo":"automatic_doors","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。","frameNo":2,"image":"","daysBeforeStart":30},{"id":124,"inspectionType":"照明取替工事","categoryId":149,"showOnBoard":true,"templateNo":"exchange_light_battery","noticeText":"取替作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":125,"inspectionType":"エントランス照明取替工事","categoryId":149,"showOnBoard":true,"templateNo":"exchange_light_battery","noticeText":"取替作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":126,"inspectionType":"照明器具メンテナンス作業","categoryId":150,"showOnBoard":true,"templateNo":"exchange_light_battery_2","noticeText":"取替作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":127,"inspectionType":"エレベーター改修工事","categoryId":151,"showOnBoard":true,"templateNo":"elevator_inspection","noticeText":"点検中はエレベーター停止致します。\nご不便をおかけします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":128,"inspectionType":"住宅玄関ドア枠塗装工事","categoryId":152,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"工事終了後は、塗装に気を付けてください","frameNo":2,"image":"","daysBeforeStart":30},{"id":129,"inspectionType":"玄関ドア取替工事","categoryId":152,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":130,"inspectionType":"外壁タイル補修工事","categoryId":153,"showOnBoard":true,"templateNo":"construction_building_large_scale","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":131,"inspectionType":"外壁補修工事","categoryId":153,"showOnBoard":true,"templateNo":"construction_building_large_scale","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":132,"inspectionType":"外壁塗装工事","categoryId":153,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":133,"inspectionType":"床タイル補修工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":134,"inspectionType":"宅配ボックス修理","categoryId":154,"showOnBoard":true,"templateNo":"delivery_box_stop_using","noticeText":"作業状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は点検員へお声をかけて頂きますよう、お願い致します。","frameNo":2,"image":"","daysBeforeStart":30},{"id":135,"inspectionType":"宅配ボックス設置工事","categoryId":154,"showOnBoard":true,"templateNo":"delivery_box","noticeText":"作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":137,"inspectionType":"インターホンメンテンス作業","categoryId":155,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"作業のため、建物内に作業員が立ち入りいたします　工事中に警報等が鳴る場合もございます","frameNo":2,"image":"","daysBeforeStart":30},{"id":138,"inspectionType":"住戸インターホン取替作業","categoryId":155,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"作業のため、建物内に作業員が立ち入りいたします　工事中に警報等が鳴る場合もございます","frameNo":2,"image":"","daysBeforeStart":30},{"id":139,"inspectionType":"避雷針工事","categoryId":156,"showOnBoard":true,"templateNo":"construction_spanner","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":140,"inspectionType":"避雷針調査","categoryId":156,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"調査のため、屋上、建物内に作業員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":141,"inspectionType":"受水槽メンテナンス工事","categoryId":157,"showOnBoard":true,"templateNo":"construction_spanner","noticeText":"メンテナンス作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":142,"inspectionType":"受水槽ボールタップ取替作業","categoryId":157,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"メンテナンス作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":143,"inspectionType":"受水槽塗装工事","categoryId":157,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":144,"inspectionType":"受水槽取替工事","categoryId":157,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":146,"inspectionType":"メールボックス取替工事","categoryId":158,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":147,"inspectionType":"メールボックス更新工事","categoryId":158,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事中皆様にご不便をおかけいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":148,"inspectionType":"メールボックス部品取替作業","categoryId":158,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"メンテナンス作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":149,"inspectionType":"排水管更新工事","categoryId":159,"showOnBoard":true,"templateNo":"construction_spanner","noticeText":"作業には音と振動を伴います。工事中、水を流すことができません。皆様にご不便をおかけいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":150,"inspectionType":"共用部　鳩ネット取付工事","categoryId":160,"showOnBoard":true,"templateNo":"construction_involving_sound_vibration","noticeText":"共用部のベランダに鳩ネット取付けます　工事中は、ﾌﾟﾗｲﾊﾞｼｰ保護のためベランダの窓を閉めてください","frameNo":2,"image":"","daysBeforeStart":30},{"id":151,"inspectionType":"害虫駆除調査","categoryId":160,"showOnBoard":true,"templateNo":"Investigation","noticeText":"調査のため、建物内に調査員が立ち入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":152,"inspectionType":"害虫駆除消毒","categoryId":160,"showOnBoard":true,"templateNo":"disinfection","noticeText":"消毒中皆様にご不便をおかけいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":153,"inspectionType":"通路特別清掃","categoryId":161,"showOnBoard":true,"templateNo":"high_pressure_cleaning_2","noticeText":"床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。\n＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":154,"inspectionType":"通路　階段特別清掃","categoryId":161,"showOnBoard":true,"templateNo":"high_pressure_cleaning_2","noticeText":"床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。\n＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":155,"inspectionType":"階段特別清掃","categoryId":161,"showOnBoard":true,"templateNo":"high_pressure_cleaning","noticeText":"床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。\n＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":156,"inspectionType":"共用廊下床シート工事","categoryId":161,"showOnBoard":true,"templateNo":"exchange_corridor","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":157,"inspectionType":"感知器取替工事","categoryId":162,"showOnBoard":true,"templateNo":"fire_exchange","noticeText":"取替作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":158,"inspectionType":"防犯カメラ工事","categoryId":163,"showOnBoard":true,"templateNo":"surveillance_camera_installation_work","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":159,"inspectionType":"侵入防護柵工事","categoryId":163,"showOnBoard":true,"templateNo":"electrical_measurement","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":160,"inspectionType":"セキュリティ工事","categoryId":163,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":161,"inspectionType":"出入口シャッター工事","categoryId":164,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":162,"inspectionType":"屋内防火シャッター工事","categoryId":164,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":163,"inspectionType":"屋外防火シャッター工事","categoryId":164,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":164,"inspectionType":"消火ポンプメンテナンス","categoryId":44,"showOnBoard":true,"templateNo":"construction_spanner","noticeText":"取替作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":165,"inspectionType":"排水ポンプ取替工事","categoryId":44,"showOnBoard":true,"templateNo":"construction_spanner","noticeText":"工事のため作業員が出入りいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":166,"inspectionType":"消防ホース取替","categoryId":51,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"取替作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":167,"inspectionType":"消防ホース耐圧試験","categoryId":51,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"耐圧試験のためマンション内に作業員が立ち入ります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":168,"inspectionType":"屋上看板LED取替工事","categoryId":137,"showOnBoard":true,"templateNo":"construction_building_large_scale","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":169,"inspectionType":"共用部照明LED変更工事","categoryId":137,"showOnBoard":true,"templateNo":"exchange_light_battery","noticeText":"工事のためマンション敷地内に作業���が立ち入ります。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":170,"inspectionType":"照明器具更新工事","categoryId":137,"showOnBoard":true,"templateNo":"exchange_light_battery","noticeText":"照明器具取替のためマンション敷地内に作業員が立ち入ります。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":171,"inspectionType":"衛星アンテナ取替工事","categoryId":140,"showOnBoard":true,"templateNo":"construction_television_equipment","noticeText":"アンテナ工事に伴い、一時テレビが映らない場合があります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":172,"inspectionType":"テレビ視聴設備調査","categoryId":140,"showOnBoard":true,"templateNo":"building_inspection","noticeText":"テレビ視聴設備調査のため　マンション敷地内に作業員が立ち入ります。","frameNo":2,"image":"","daysBeforeStart":30},{"id":173,"inspectionType":"住戸玄関ドア枠塗装","categoryId":141,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"塗装工事のためマンション敷地内に作業員が立ち入ります。塗装部分には乾くまで触らないようお願いします。、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":174,"inspectionType":"共用ドア塗装工事","categoryId":141,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"塗装工事のためマンション敷地内に作業員が立ち入ります。塗装部分には乾くまで触らないようお願いします。、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":175,"inspectionType":"エレベータドア塗装工事","categoryId":141,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"塗装工事のためマンション敷地内に作業員が立ち入ります。塗装部分には乾くまで触らないようお願いします。、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":176,"inspectionType":"自動火災報知更新工事","categoryId":143,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事中に、インターホンが使用できないﾊ場合がございます。試験のため、警報等が鳴る場合がございます。皆様にご不便をおかけいたします","frameNo":2,"image":"","daysBeforeStart":30},{"id":177,"inspectionType":"消火器取替","categoryId":143,"showOnBoard":true,"templateNo":"fire_extinguisher_explain","noticeText":"作業のためマンション内に作業員が出入りいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":178,"inspectionType":"ゴミ置場改修工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":179,"inspectionType":"外構工事","categoryId":146,"showOnBoard":true,"templateNo":"construction_roller_paint","noticeText":"工事のため敷地内に作業員が立ち入り、作業には音と振動を伴います。皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":180,"inspectionType":"給水管更新工事","categoryId":159,"showOnBoard":true,"templateNo":"construction_spanner","noticeText":"断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。","frameNo":2,"image":"","daysBeforeStart":30},{"id":181,"inspectionType":"電気設備工事","categoryId":93,"showOnBoard":true,"templateNo":"electrical_measurement","noticeText":"取替作業のため敷地内に作業員が立ち入ります","frameNo":2,"image":"","daysBeforeStart":30},{"id":182,"inspectionType":"電気設備取替工事","categoryId":165,"showOnBoard":true,"templateNo":"construction_toolbox","noticeText":"工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。皆様のご理解をお願いいたします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":183,"inspectionType":"消火用ボックス塗装工事","categoryId":141,"showOnBoard":true,"templateNo":"painting_water_pipe","noticeText":"塗装工事のためマンション敷地内に作業員が立ち入ります。塗装部分には乾くまで触らないようお願いします。、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。","frameNo":2,"image":"","daysBeforeStart":30},{"id":186,"inspectionType":"給水ポンプ更新工事(断水）","categoryId":44,"showOnBoard":true,"templateNo":"water_activator_construction","noticeText":"断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。","frameNo":2,"image":"","daysBeforeStart":30},{"id":187,"inspectionType":"防鳩工事のお知らせ","categoryId":160,"showOnBoard":true,"templateNo":"protect_balcony_from_birds","noticeText":"お部屋ののベランダで工事を行います。作業には音と振動を伴います。","frameNo":2,"image":"","daysBeforeStart":30},{"id":187,"inspectionType":"ハトネット工事のお知らせ","categoryId":160,"showOnBoard":true,"templateNo":"protect_balcony_from_birds_2","noticeText":"お部屋ののベランダで工事を行います。作業には音と振動を伴います。","frameNo":2,"image":"","daysBeforeStart":30}]};

        let entries = [];
        let editingIndex = -1;
        let currentPosition = 2;
        let currentTemplateNo = '';

        function init() {
            populatePropertySelect();
            populateVendorSelect();
            populateInspectionTypeSelect();
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('startDate').value = today;
            document.getElementById('displayStartDate').value = today;
            updatePreview();
        }

        function populatePropertySelect() {
            const select = document.getElementById('property');
            const seen = new Set();
            masterData.properties.forEach(p => {
                if (!seen.has(p.propertyCode)) {
                    seen.add(p.propertyCode);
                    const opt = document.createElement('option');
                    opt.value = p.propertyCode;
                    opt.textContent = `${p.propertyCode} ${p.propertyName}`;
                    select.appendChild(opt);
                }
            });
        }

        function onPropertyChange() {
            const code = document.getElementById('property').value; // 文字列として扱う
            const terminalSelect = document.getElementById('terminal');
            terminalSelect.innerHTML = '<option value="">選択してください</option>';
            if (code) {
                // propertyCodeは文字列なので、codeも文字列で比較
                const terminals = masterData.properties.filter(p => String(p.propertyCode) === String(code));
                terminals.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.terminalId;
                    opt.textContent = t.supplement ? `${t.terminalId} (${t.supplement})` : t.terminalId;
                    terminalSelect.appendChild(opt);
                });
                if (terminals.length > 0) terminalSelect.value = terminals[0].terminalId;
            }
        }

        function populateVendorSelect() {
            const select = document.getElementById('vendor');
            masterData.vendors.forEach((v, i) => {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = v.vendorName;
                select.appendChild(opt);
            });
        }

        function onVendorChange() {
            const idx = document.getElementById('vendor').value;
            document.getElementById('emergencyContact').value = idx !== '' ? masterData.vendors[idx].emergencyContact : '';
        }

        function populateInspectionTypeSelect(category = '') {
            const select = document.getElementById('inspectionType');
            // 現在の選択値を保持
            const currentValue = select.value;
            select.innerHTML = '<option value="">選択してください</option>';

            masterData.notices.forEach((n, i) => {
                // カテゴリフィルター: カテゴリが空（全て）か、点検種別名にカテゴリが含まれる場合のみ表示
                if (!category || n.inspectionType.includes(category)) {
                    const opt = document.createElement('option');
                    opt.value = i;
                    opt.textContent = n.inspectionType;
                    select.appendChild(opt);
                }
            });

            // 以前の選択が有効なら復元
            if (currentValue && select.querySelector(`option[value="${currentValue}"]`)) {
                select.value = currentValue;
            }
        }

        function onCategoryChange() {
            const category = document.getElementById('inspectionCategory').value;
            populateInspectionTypeSelect(category);
            // カテゴリ変更時に点検種別をリセット
            document.getElementById('inspectionType').value = '';
            onInspectionTypeChange();
        }

        function onInspectionTypeChange() {
            const idx = document.getElementById('inspectionType').value;
            if (idx !== '') {
                const notice = masterData.notices[idx];
                document.getElementById('showOnBoard').checked = notice.showOnBoard;
                document.getElementById('noticeText').value = notice.noticeText;
                currentTemplateNo = notice.templateNo;
            } else {
                currentTemplateNo = '';
            }
            updatePreview();
        }

        function adjustTime(delta) {
            const input = document.getElementById('displayTime');
            let val = parseInt(input.value) || 6;
            const maxTime = (window.appSettings && window.appSettings.display_time_max) || 30;
            input.value = Math.max(1, Math.min(maxTime, val + delta));
        }

        function setPosition(pos) {
            currentPosition = pos;
            document.querySelectorAll('.position-cell').forEach(cell => {
                cell.classList.toggle('active', parseInt(cell.dataset.pos) === pos);
            });
        }

        function updatePreview() {
            const container = document.getElementById('posterPreview');
            const imgUrl = getTemplateImageUrl(currentTemplateNo);
            const noticeText = document.getElementById('noticeText').value;
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            const remarks = document.getElementById('remarks').value;

            let dateText = '';
            if (startDate) {
                const d = new Date(startDate);
                const days = ['日', '月', '火', '水', '木', '金', '土'];
                dateText = `${d.getMonth() + 1}月${d.getDate()}日(${days[d.getDay()]})`;
                if (endDate && endDate !== startDate) {
                    const ed = new Date(endDate);
                    dateText += `〜${ed.getMonth() + 1}月${ed.getDate()}日(${days[ed.getDay()]})`;
                }
            }

            if (imgUrl) {
                container.innerHTML = `
                    <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(currentTemplateNo)}">
                    <div class="poster-overlay">
                        <div class="poster-notice-text">${escapeHtml(noticeText)}</div>
                        <div class="poster-date-text">${escapeHtml(dateText)}</div>
                        <div class="poster-remarks-text">${escapeHtml(remarks)}</div>
                    </div>
                `;
            } else {
                container.innerHTML = '<div class="poster-preview-placeholder">点検工事案内を選択</div>';
            }
        }

        function addEntry() {
            const propertyCode = document.getElementById('property').value;
            const terminalId = document.getElementById('terminal').value;
            const vendorIdx = document.getElementById('vendor').value;
            const inspectionIdx = document.getElementById('inspectionType').value;
            const posterType = document.querySelector('input[name="posterType"]:checked').value;
            const isCustomMode = posterType === 'custom';

            // バリデーション: 日付の前後関係
            const startDate = document.getElementById('startDate').value;
            const endDate = document.getElementById('endDate').value;
            if (startDate && endDate && startDate > endDate) {
                showToast('終了日は開始日より後にしてください', 'error');
                return;
            }

            // カスタムモード: 物件・保守会社・画像が必須
            // テンプレートモード: 物件・保守会社・点検工事案内が必須
            if (!propertyCode || vendorIdx === '') {
                showToast('必須項目を入力してください', 'error');
                return;
            }

            if (isCustomMode) {
                if (!window.customImageData) {
                    showToast('貼紙画像を選択してください', 'error');
                    return;
                }
            } else {
                if (inspectionIdx === '') {
                    showToast('点検工事案内を選択してください', 'error');
                    return;
                }
                // テンプレート画像の存在確認（DB優先、ハードコードをフォールバック）
                if (!hasTemplateImage(currentTemplateNo)) {
                    showToast('選択された点検種別のテンプレート画像が見つかりません', 'error');
                    return;
                }
            }

            // 設定値によるバリデーション
            const settings = window.appSettings || {
                display_time_max: 30,
                remarks_chars_per_line: 25,
                remarks_max_lines: 5,
                notice_text_max_chars: 200
            };
            const errors = [];

            const displayTime = parseInt(document.getElementById('displayTime').value) || 6;
            if (displayTime > settings.display_time_max) {
                errors.push(`表示時間は${settings.display_time_max}秒以下にしてください`);
            }

            const remarks = document.getElementById('remarks').value;
            if (remarks) {
                const lines = remarks.split('\n');
                if (lines.length > settings.remarks_max_lines) {
                    errors.push(`掲示備考は${settings.remarks_max_lines}行以下にしてください`);
                }
                const longLines = lines.filter(line => line.length > settings.remarks_chars_per_line);
                if (longLines.length > 0) {
                    errors.push(`掲示備考は1行${settings.remarks_chars_per_line}文字以下にしてください`);
                }
            }

            const noticeText = document.getElementById('noticeText').value;
            if (noticeText && noticeText.length > settings.notice_text_max_chars) {
                errors.push(`案内文は${settings.notice_text_max_chars}文字以下にしてください`);
            }

            // 日付の論理チェック（既に上で宣言済みのstartDate, endDateを使用）
            if (startDate && endDate && startDate > endDate) {
                errors.push('点検終了日は開始日以降にしてください');
            }
            const displayStartDate = document.getElementById('displayStartDate').value;
            const displayEndDate = document.getElementById('displayEndDate').value;
            if (displayStartDate && displayEndDate && displayStartDate > displayEndDate) {
                errors.push('表示終了日は開始日以降にしてください');
            }

            if (errors.length > 0) {
                showToast(errors.join('\n'), 'error');
                return;
            }

            const vendor = masterData.vendors[vendorIdx];
            const notice = isCustomMode ? null : masterData.notices[inspectionIdx];
            const property = masterData.properties.find(p => String(p.propertyCode) === String(propertyCode));

            const entry = {
                terminalId: terminalId || property.terminalId,
                propertyCode: parseInt(propertyCode),
                propertyName: property.propertyName,
                vendorName: vendor.vendorName,
                emergencyContact: vendor.emergencyContact,
                inspectionType: isCustomMode ? '追加画像' : notice.inspectionType,
                showOnBoard: document.getElementById('showOnBoard').checked,
                templateNo: isCustomMode ? '' : notice.templateNo,
                startDate: isCustomMode ? '' : document.getElementById('startDate').value,
                endDate: isCustomMode ? '' : document.getElementById('endDate').value,
                remarks: remarks,
                noticeText: noticeText,
                frameNo: currentPosition,
                displayStartDate: document.getElementById('displayStartDate').value,
                displayEndDate: document.getElementById('displayEndDate').value,
                displayStartTime: document.getElementById('displayStartTime').value,
                displayEndTime: document.getElementById('displayEndTime').value,
                displayTime: displayTime,
                posterType: posterType,
                customImageData: isCustomMode ? window.customImageData : null
            };

            if (editingIndex >= 0) {
                entries[editingIndex] = entry;
                editingIndex = -1;
                showToast('更新しました', 'success');
            } else {
                entries.push(entry);
                showToast('追加しました', 'success');
            }
            renderDataList();
        }

        // 前回のデータを複製
        function duplicateLastEntry() {
            if (entries.length === 0) return;

            const lastEntry = entries[entries.length - 1];

            // フォームに前回のデータを設定
            document.getElementById('property').value = lastEntry.propertyCode || '';
            onPropertyChange();

            setTimeout(() => {
                document.getElementById('terminal').value = lastEntry.terminalId || '';

                const vendorIdx = masterData.vendors.findIndex(v => v.vendorName === lastEntry.vendorName);
                if (vendorIdx !== -1) {
                    document.getElementById('vendor').value = vendorIdx;
                    onVendorChange();
                }

                document.getElementById('inspectionCategory').value = lastEntry.category || '';
                onCategoryChange();

                const inspectionIdx = masterData.notices.findIndex(n => n.inspectionType === lastEntry.inspectionType);
                if (inspectionIdx !== -1) {
                    document.getElementById('inspectionType').value = inspectionIdx;
                    onInspectionTypeChange();
                }

                document.getElementById('noticeText').value = lastEntry.noticeText || '';
                document.getElementById('startDate').value = lastEntry.startDate || '';
                document.getElementById('endDate').value = lastEntry.endDate || '';
                document.getElementById('remarks').value = lastEntry.remarks || '';
                document.getElementById('displayTime').value = lastEntry.displayTime || 6;

                updatePreview();
                showToast('前回のデータを複製しました', 'info');
            }, 100);
        }

        function renderDataList() {
            const container = document.getElementById('dataList');
            document.getElementById('dataCount').textContent = entries.length;
            document.getElementById('exportSection').style.display = entries.length > 0 ? 'flex' : 'none';

            // 複製ボタンの有効/無効切り替え
            const duplicateBtn = document.getElementById('duplicateBtn');
            if (duplicateBtn) {
                duplicateBtn.disabled = entries.length === 0;
            }

            if (entries.length === 0) {
                container.innerHTML = '<div class="empty-state">📭 データなし</div>';
                return;
            }

            container.innerHTML = entries.map((e, i) => `
                <div class="data-item">
                    <div class="data-item-info">
                        <div class="data-item-title">${escapeHtml(e.inspectionType)}</div>
                        <div class="data-item-sub">${escapeHtml(e.propertyCode)} | ${escapeHtml(e.startDate) || '-'}</div>
                    </div>
                    <span class="badge badge-success">${e.showOnBoard ? '表示' : '非表示'}</span>
                    <div class="data-item-actions">
                        <button class="btn btn-sm btn-outline" data-action="edit" data-index="${i}">編集</button>
                        <button class="btn btn-sm btn-danger" data-action="delete" data-index="${i}">削除</button>
                    </div>
                </div>
            `).join('');
            // イベントリスナーを追加
            container.querySelectorAll('[data-action="edit"]').forEach(btn => {
                btn.addEventListener('click', () => editEntry(parseInt(btn.dataset.index)));
            });
            container.querySelectorAll('[data-action="delete"]').forEach(btn => {
                btn.addEventListener('click', () => deleteEntry(parseInt(btn.dataset.index)));
            });
        }

        function editEntry(idx) {
            const e = entries[idx];
            editingIndex = idx;
            document.getElementById('property').value = e.propertyCode;
            onPropertyChange();
            document.getElementById('terminal').value = e.terminalId;
            const vendorIdx = masterData.vendors.findIndex(v => v.vendorName === e.vendorName);
            if (vendorIdx >= 0) { document.getElementById('vendor').value = vendorIdx; onVendorChange(); }
            const noticeIdx = masterData.notices.findIndex(n => n.inspectionType === e.inspectionType);
            if (noticeIdx >= 0) { document.getElementById('inspectionType').value = noticeIdx; currentTemplateNo = e.templateNo; }
            document.getElementById('showOnBoard').checked = e.showOnBoard;
            document.getElementById('startDate').value = e.startDate;
            document.getElementById('endDate').value = e.endDate;
            document.getElementById('remarks').value = e.remarks;
            document.getElementById('noticeText').value = e.noticeText;
            document.getElementById('displayStartDate').value = e.displayStartDate;
            document.getElementById('displayEndDate').value = e.displayEndDate;
            document.getElementById('displayStartTime').value = e.displayStartTime;
            document.getElementById('displayEndTime').value = e.displayEndTime;
            document.getElementById('displayTime').value = e.displayTime;
            setPosition(e.frameNo);
            document.querySelector(`input[name="posterType"][value="${e.posterType}"]`).checked = true;
            updatePreview();
        }

        function deleteEntry(idx) {
            if (confirm('削除しますか？')) {
                entries.splice(idx, 1);
                renderDataList();
                showToast('削除しました');
            }
        }

        function clearForm() {
            document.getElementById('property').value = '';
            document.getElementById('terminal').innerHTML = '<option value="">選択してください</option>';
            document.getElementById('vendor').value = '';
            document.getElementById('emergencyContact').value = '';
            document.getElementById('inspectionType').value = '';
            document.getElementById('showOnBoard').checked = true;
            document.getElementById('remarks').value = '';
            document.getElementById('noticeText').value = '';
            document.getElementById('displayStartTime').value = '';
            document.getElementById('displayEndTime').value = '';
            document.getElementById('displayTime').value = 6;
            document.getElementById('endDate').value = '';
            document.getElementById('displayEndDate').value = '';
            currentTemplateNo = '';
            editingIndex = -1;
            setPosition(2);
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('startDate').value = today;
            document.getElementById('displayStartDate').value = today;
            document.querySelector('input[name="posterType"][value="template"]').checked = true;
            clearCustomImage();
            onPosterTypeChange();
            updatePreview();
        }

        // 貼紙タイプ切り替え（テンプレート/追加）
        function onPosterTypeChange() {
            const posterType = document.querySelector('input[name="posterType"]:checked').value;
            const isCustom = posterType === 'custom';

            // 追加モードの場合: 画像アップロードを表示、点検関連フィールドを非表示
            document.getElementById('customImageGroup').style.display = isCustom ? 'block' : 'none';
            document.getElementById('inspectionTypeGroup').style.display = isCustom ? 'none' : 'block';
            document.getElementById('startDateGroup').style.display = isCustom ? 'none' : 'block';
            document.getElementById('endDateGroup').style.display = isCustom ? 'none' : 'block';
            document.getElementById('noticeTextGroup').style.display = isCustom ? 'none' : 'block';

            // 追加モードの場合: 掲示板内の表示開始日/終了日を非活性化
            document.getElementById('displayStartDate').disabled = isCustom;
            document.getElementById('displayStartTime').disabled = isCustom;
            document.getElementById('displayEndDate').disabled = isCustom;
            document.getElementById('displayEndTime').disabled = isCustom;

            // プレビューを更新
            if (isCustom && window.customImageData) {
                updateCustomImagePreview();
            } else {
                updatePreview();
            }
        }

        // カスタム画像選択時
        function onImageSelected(event) {
            const file = event.target.files[0];
            if (!file) return;

            // ファイル形式チェック
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
            if (!validTypes.includes(file.type)) {
                showToast('JPG, JPEG, PNG形式の画像を選択してください', 'error');
                event.target.value = '';
                return;
            }

            // ファイルサイズチェック (5MB以下)
            const maxSize = 5 * 1024 * 1024;
            if (file.size > maxSize) {
                showToast('画像サイズは5MB以下にしてください', 'error');
                event.target.value = '';
                return;
            }

            // プレビュー表示
            const reader = new FileReader();
            reader.onload = function(e) {
                window.customImageData = e.target.result;
                window.customImageFile = file;

                document.getElementById('previewImg').src = e.target.result;
                document.querySelector('.upload-placeholder').style.display = 'none';
                document.getElementById('uploadPreview').style.display = 'flex';

                // 貼紙プレビューにも表示
                updateCustomImagePreview();
            };
            reader.readAsDataURL(file);
        }

        // カスタム画像プレビュー更新
        function updateCustomImagePreview() {
            const container = document.getElementById('posterPreview');
            if (window.customImageData) {
                container.innerHTML = `<img src="${window.customImageData}" alt="カスタム貼紙" style="width: 100%; height: 100%; object-fit: contain;">`;
            } else {
                container.innerHTML = '<div class="poster-preview-placeholder">画像を選択してください</div>';
            }
        }

        // カスタム画像クリア
        function clearCustomImage() {
            window.customImageData = null;
            window.customImageFile = null;

            const customImageInput = document.getElementById('customImage');
            if (customImageInput) {
                customImageInput.value = '';
            }

            const placeholder = document.querySelector('.upload-placeholder');
            const preview = document.getElementById('uploadPreview');
            if (placeholder) placeholder.style.display = 'block';
            if (preview) preview.style.display = 'none';

            // テンプレートモードの場合はテンプレートプレビューを表示
            const posterType = document.querySelector('input[name="posterType"]:checked');
            if (posterType && posterType.value === 'template') {
                updatePreview();
            } else {
                updateCustomImagePreview();
            }
        }

        function generateCSV() {
            const headers = ['点検CO','端末ID','物件コード','保守会社名','緊急連絡先番号','点検工事案内','掲示板に表示する','点検案内TPLNo','点検開始日','点検完了日','掲示備考','掲示板用案内文','frame_No','表示開始日','表示終了日','表示開始時刻','表示終了時刻','表示時間','統合ポリシー','制御','変更日','変更時刻','最終エクスポート日時','ID','変更日時','点検日時','表示日時','貼紙区分'];
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0].replace(/-/g, '/');
            const timeStr = now.toTimeString().substring(0, 8);

            const rows = entries.map(e => {
                const sd = e.startDate ? e.startDate.replace(/-/g, '/') : '';
                const ed = e.endDate ? e.endDate.replace(/-/g, '/') : sd;
                const dsd = e.displayStartDate ? e.displayStartDate.replace(/-/g, '/') : '';
                const ded = e.displayEndDate ? e.displayEndDate.replace(/-/g, '/') : ed;
                const dt = `0:00:${String(e.displayTime).padStart(2, '0')}`;
                return ['', e.terminalId, e.propertyCode, e.vendorName, e.emergencyContact, e.inspectionType, e.showOnBoard ? 'TRUE' : 'False', e.templateNo, sd, ed, e.remarks.replace(/\n/g, '\r\n'), e.noticeText.replace(/\n/g, '\r\n'), e.frameNo, dsd, ded, e.displayStartTime || '', e.displayEndTime || '', dt, '', '', dateStr, '', '', '', `${dateStr} [${timeStr}]`, `${sd} [00:00:00]`, `${dsd} [00:00:00]`, e.posterType === 'template' ? 'テンプレート' : '追加'];
            });

            const esc = v => {
                if (v == null) return '';
                const s = String(v);
                return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            return [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
        }

        function downloadCSV() {
            const csv = generateCSV();
            const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8' });
            const now = new Date();
            const ts = now.toISOString().replace(/[-:]/g, '').substring(0, 15);
            const code = entries[0]?.propertyCode || 'export';
            const filename = `${code}-全端末-${ts}.csv`;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            showToast(`${filename} をダウンロード`, 'success');
        }

        function previewCSV() {
            document.getElementById('csvPreview').textContent = generateCSV();
            document.getElementById('previewModal').classList.add('active');
        }

        function closeModal(e) {
            if (!e || e.target === e.currentTarget) {
                document.getElementById('previewModal').classList.remove('active');
            }
        }

        async function copyCSV() {
            try {
                await navigator.clipboard.writeText(generateCSV());
                showToast('コピーしました', 'success');
            } catch { showToast('コピー失敗', 'error'); }
        }

        function showToast(msg, type = '') {
            document.querySelectorAll('.toast').forEach(t => t.remove());
            const toast = document.createElement('div');
            toast.className = `toast ${type} show`;
            toast.textContent = msg;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 2500);
        }

        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

        // Supabaseへの申請
        async function submitEntries() {
            if (entries.length === 0) {
                showToast('申請するデータがありません', 'error');
                return;
            }

            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = '申請中...';

            showLoading('データを申請しています...');

            try {
                // カスタム画像をアップロード（並列処理）
                const uploadPromises = entries.map(async (e) => {
                    if (e.posterType === 'custom' && e.customImageData) {
                        try {
                            const imageUrl = await window.uploadPosterImage(e.customImageData);
                            return { ...e, posterImageUrl: imageUrl };
                        } catch (uploadError) {
                            console.error('Image upload failed:', uploadError);
                            throw new Error('画像のアップロードに失敗しました');
                        }
                    }
                    return e;
                });
                const entriesWithImages = await Promise.all(uploadPromises);

                // 一括入力と同じデータ構造に変換
                const supabaseEntries = entriesWithImages.map(e => {
                    const displayStartDate = e.displayStartDate || e.startDate || null;
                    const displayEndDate = e.displayEndDate || e.endDate || null;

                    return {
                        property_code: String(e.propertyCode),
                        terminal_id: e.terminalId || '',
                        vendor_name: e.vendorName,
                        emergency_contact: e.emergencyContact || '',
                        inspection_type: e.inspectionType,
                        template_no: e.templateNo || '',
                        inspection_start: e.startDate || null,
                        inspection_end: e.endDate || null,
                        remarks: e.remarks || '',
                        announcement: e.noticeText || '',
                        display_start_date: displayStartDate,
                        display_start_time: e.displayStartTime || null,
                        display_end_date: displayEndDate,
                        display_end_time: e.displayEndTime || null,
                        display_duration: e.displayTime || 6,
                        poster_type: e.posterType === 'template' ? 'template' : 'custom',
                        poster_image: e.posterImageUrl || null,
                        poster_position: e.frameNo !== undefined ? String(e.frameNo) : '2',
                        status: 'draft'
                    };
                });

                await window.createEntriesToSupabase(supabaseEntries);
                showToast(`${entries.length}件のデータを申請しました`, 'success');

                // データをクリア
                entries.length = 0;
                renderDataList();
            } catch (error) {
                console.error('Submit failed:', error);
                showToast('申請に失敗しました: ' + (error.message || ''), 'error');
            } finally {
                hideLoading();
                submitBtn.disabled = false;
                submitBtn.textContent = '申請する';
            }
        }

        // init()はindex.htmlから呼び出される（Supabaseからデータをロードした後）
        // ローカルモード（Supabase未設定）の場合は、この関数をwindowに公開
        window.initScript = init;

        // HTMLのonchange/onclick属性から呼び出される関数をグローバルスコープに公開
        window.onPropertyChange = onPropertyChange;
        window.onVendorChange = onVendorChange;
        window.onCategoryChange = onCategoryChange;
        window.onInspectionTypeChange = onInspectionTypeChange;

        // 管理者用: ベンダー選択変更時
        async function onAdminVendorChange() {
            const vendorSelect = document.getElementById('adminVendorSelect');
            const vendorId = vendorSelect.value;

            if (!vendorId) {
                selectedVendorIdForAdmin = null;
                // マスターデータを元に戻す（全データ）
                const freshData = await window.getAllMasterDataCamelCase();
                window.masterData = freshData;
                populatePropertySelect();

                // 保守会社ドロップダウンのロックを解除
                const vendorDropdown = document.getElementById('vendor');
                vendorDropdown.disabled = false;
                vendorDropdown.style.background = '';
                vendorDropdown.value = '';

                // 点検種別のロックも解除
                const inspectionSelect = document.getElementById('inspectionType');
                inspectionSelect.disabled = false;
                inspectionSelect.style.background = '';
                return;
            }

            selectedVendorIdForAdmin = vendorId;

            // 選択したベンダーの担当ビルのみを取得
            const buildings = await window.getBuildingsByVendor(vendorId);

            // masterData.propertiesを更新
            const updatedProperties = [];
            buildings.forEach(b => {
                const terminals = Array.isArray(b.terminals) ? b.terminals : [];
                terminals.forEach(t => {
                    updatedProperties.push({
                        propertyCode: b.property_code, // getBuildingsByVendor returns snake_case
                        propertyName: b.property_name,  // getBuildingsByVendor returns snake_case
                        terminalId: t.terminalId || t.terminal_id || '',
                        supplement: t.supplement || '',
                        address: b.address || ''
                    });
                });
            });

            window.masterData.properties = updatedProperties;

            // 保守会社ドロップダウンを自動選択＆ロック
            const vendorDropdown = document.getElementById('vendor');
            // キャッシュされた masterData.vendors から検索（個別取得を避ける）
            const vendorIndex = masterData.vendors.findIndex(v => v.id === vendorId);
            const selectedVendorData = masterData.vendors[vendorIndex];

            if (vendorIndex !== -1) {
                vendorDropdown.value = vendorIndex;
                vendorDropdown.disabled = true;
                vendorDropdown.style.background = '#f0f0f0';
                // 緊急連絡先も自動入力
                onVendorChange();

                // 点検種別も自動設定（ベンダーのinspectionTypeに基づく）
                if (selectedVendorData?.inspectionType) {
                    const inspectionSelect = document.getElementById('inspectionType');
                    const inspectionOption = Array.from(inspectionSelect.options).find(
                        opt => opt.textContent.includes(selectedVendorData.inspectionType)
                    );
                    if (inspectionOption) {
                        inspectionSelect.value = inspectionOption.value;
                        inspectionSelect.disabled = true;
                        inspectionSelect.style.background = '#f0f0f0';
                        // プレビュー更新
                        onInspectionTypeChange();
                    }
                }
            }

            // 物件選択を再描画
            populatePropertySelect();
            document.getElementById('property').value = '';
            document.getElementById('terminal').innerHTML = '<option value="">選択してください</option>';
        }
        window.onPosterTypeChange = onPosterTypeChange;
        window.clearForm = clearForm;
        window.addEntry = addEntry;
        window.duplicateLastEntry = duplicateLastEntry;
        window.downloadCSV = downloadCSV;
        window.copyCSV = copyCSV;
        window.previewCSV = previewCSV;
        window.submitEntries = submitEntries;
        window.clearCustomImage = clearCustomImage;
        window.onImageSelected = onImageSelected;
        window.adjustTime = adjustTime;
        window.setPosition = setPosition;
        window.updatePreview = updatePreview;
        window.closeModal = closeModal;
        window.onAdminVendorChange = onAdminVendorChange;
        window.openBuildingRequestModal = openBuildingRequestModal;

        // 物件追加リクエストモーダル（一般ユーザー用）
        async function openBuildingRequestModal() {
            const propertyCode = prompt('追加したい物件コードを入力してください:');
            if (!propertyCode) return;

            try {
                // 物件の存在確認
                const allProperties = await window.getMasterProperties();
                const exists = allProperties.some(p => String(p.property_code) === String(propertyCode));
                if (!exists) {
                    showToast('この物件コードは登録されていません。管理者にお問い合わせください。', 'error');
                    return;
                }

                await window.addBuildingVendor(propertyCode);
                showToast('物件追加リクエストを送信しました。管理者の承認をお待ちください。', 'success');

                // マスターデータを再読み込み（承認後に表示されるように）
                setTimeout(async () => {
                    const freshData = await window.getAllMasterDataCamelCase();
                    window.masterData = freshData;
                    populatePropertySelect();
                }, 1000);
            } catch (error) {
                console.error('Failed to request building:', error);
                if (error.message.includes('duplicate') || error.message.includes('unique')) {
                    showToast('この物件は既にリクエスト済みです', 'error');
                } else {
                    showToast('リクエストに失敗しました: ' + error.message, 'error');
                }
            }
        }