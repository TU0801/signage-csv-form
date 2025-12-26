// Expected data from Excel file (CSV作成用.xlsm)
// This data is used to verify the web application matches the Excel specifications

const expectedProperties = [
  { propertyCode: 2010, propertyName: "エンクレストガーデン福岡", terminalId: "h0001A00", supplement: "センター棟", address: "福岡県福岡市中央区小笹４－５" },
  { propertyCode: 2010, propertyName: "エンクレストガーデン福岡", terminalId: "h0001A01", supplement: "Ａ棟", address: "福岡県福岡市中央区小笹４－５" },
  { propertyCode: 2010, propertyName: "エンクレストガーデン福岡", terminalId: "h0001A02", supplement: "Ｂ棟", address: "福岡県福岡市中央区小笹４－５" },
  { propertyCode: 2010, propertyName: "エンクレストガーデン福岡", terminalId: "h0001A03", supplement: "Ｃ棟", address: "福岡県福岡市中央区小笹４－５" },
  { propertyCode: 2010, propertyName: "エンクレストガーデン福岡", terminalId: "h0001A04", supplement: "Ｄ棟", address: "福岡県福岡市中央区小笹４－５" },
  { propertyCode: 2010, propertyName: "エンクレストガーデン福岡", terminalId: "h0001A05", supplement: "Ｅ棟", address: "福岡県福岡市中央区小笹４－５" },
  { propertyCode: 2010, propertyName: "エンクレストガーデン福岡", terminalId: "h0001A06", supplement: "Ｆ棟", address: "福岡県福岡市中央区小笹４－５" },
  { propertyCode: 120406, propertyName: "アソシアグロッツォ天神サウス", terminalId: "z1003A01", supplement: "", address: "" },
  { propertyCode: 120408, propertyName: "アソシアグロッツォ博多プレイス", terminalId: "z1006A01", supplement: "", address: "" },
  { propertyCode: 120410, propertyName: "パリス大濠ベイタウン", terminalId: "z1001A01", supplement: "", address: "" },
  { propertyCode: 120411, propertyName: "ラフィネスシャトードゥ赤坂", terminalId: "z5221A01", supplement: "", address: "" },
  { propertyCode: 120412, propertyName: "LANDIC S4173", terminalId: "z1013A01", supplement: "", address: "" },
  { propertyCode: 120413, propertyName: "ラフィネスネオシティ平尾", terminalId: "z5779A01", supplement: "", address: "" },
  { propertyCode: 120419, propertyName: "アソシアグロッツォ博多サウスガーデン", terminalId: "z1009A01", supplement: "", address: "" },
  { propertyCode: 120420, propertyName: "ラフィネス薬院イーストタワー", terminalId: "z5800A01", supplement: "", address: "" },
  { propertyCode: 120428, propertyName: "ラフィネス大濠パークアべニュー", terminalId: "z5855A01", supplement: "", address: "" },
  { propertyCode: 120109, propertyName: "アソシアグロッツォタイムズスイート博多", terminalId: "z1002A01", supplement: "", address: "" },
  { propertyCode: 120407, propertyName: "アソシアグロッツオ博多サザンテラス", terminalId: "z1008A01", supplement: "", address: "" },
  { propertyCode: 120414, propertyName: "ラフィネス大濠パークサイド", terminalId: "z5510A01", supplement: "", address: "" },
  { propertyCode: 120415, propertyName: "ラフィネス博多リバーステージ", terminalId: "z5797A01", supplement: "", address: "" },
  { propertyCode: 120416, propertyName: "ラフィネスクロスロード博多ステーション", terminalId: "z5856A01", supplement: "", address: "" },
  { propertyCode: 120417, propertyName: "LANDIC K2620", terminalId: "z1016A01", supplement: "", address: "" },
  { propertyCode: 120418, propertyName: "ラフィネス薬院ウェストタワー", terminalId: "z5835A01", supplement: "", address: "" },
  { propertyCode: 120421, propertyName: "LANDIC N313", terminalId: "z1011A01", supplement: "", address: "" },
  { propertyCode: 120422, propertyName: "LANDIC H1916", terminalId: "z1012A01", supplement: "", address: "" },
  { propertyCode: 120423, propertyName: "LANDIC Y138", terminalId: "z1014A01", supplement: "", address: "" },
  { propertyCode: 120424, propertyName: "LANDIC N110", terminalId: "z1015A01", supplement: "", address: "" },
  { propertyCode: 120426, propertyName: "LANDIC O2239", terminalId: "z1018A01", supplement: "", address: "" },
  { propertyCode: 120427, propertyName: "LANDIC O2227", terminalId: "z1019A01", supplement: "", address: "" },
  { propertyCode: 130425, propertyName: "LANDIC K320", terminalId: "z1017A01", supplement: "", address: "" }
];

const expectedVendors = [
  { vendorName: "山本クリーンシステム　有限会社", emergencyContact: "092-934-0407", category: "清掃" },
  { vendorName: "日本オーチス・エレベータ　株式会社", emergencyContact: "0120-324-365", category: "点検" },
  { vendorName: "株式会社　えん建物管理", emergencyContact: "092-260-5350", category: "点検" },
  { vendorName: "西日本ビルテクノサービス　株式会社", emergencyContact: "092-504-7741", category: "点検" }
];

const expectedNotices = [
  { id: 1, inspectionType: "エレベーター定期点検", showOnBoard: true, templateNo: "elevator_inspection", noticeText: "点検中はエレベーター停止致します。\nご不便をおかけします。", frameNo: 2 },
  { id: 2, inspectionType: "リモート点検", showOnBoard: false, templateNo: "elevator_inspection", noticeText: "", frameNo: 2 },
  { id: 3, inspectionType: "建物設備点検", showOnBoard: true, templateNo: "building_inspection", noticeText: "点検のため、マンション内に調査員が立ち入りいたします。", frameNo: 2 },
  { id: 4, inspectionType: "消防設備点検", showOnBoard: true, templateNo: "fire_inspection", noticeText: "消防法令　第17条3の3に基づく消防設備点検です。避難器具の周囲には障害物を置かないで下さい是正対象となります。当日点検に伺う場合があります。点検予定希望日の事前アンケートにご協力下さい。", frameNo: 2 },
  { id: 5, inspectionType: "貯水槽清掃（断水）", showOnBoard: true, templateNo: "simple_dedicated_water_supply", noticeText: "断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。", frameNo: 2 },
  { id: 6, inspectionType: "簡易専用水道検査", showOnBoard: true, templateNo: "building_inspection", noticeText: "点検のため、マンション内に調査員が立ち入り貯水槽の水質検査を行います。", frameNo: 2 },
  { id: 7, inspectionType: "自動扉点検", showOnBoard: true, templateNo: "automatic_doors", noticeText: "点検のため、マンション内に点検員が立ち入りいたします。点検中に、オートロックが反応しない場合は点検員へお声をかけて頂きますよう、お願い致します。", frameNo: 2 },
  { id: 8, inspectionType: "機械式駐車場点検", showOnBoard: true, templateNo: "mechanical_parking", noticeText: "作業状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。\n＊雨天・緊急等の場合　順延する場合があります。", frameNo: 2 },
  { id: 9, inspectionType: "タワー式駐車場点検", showOnBoard: true, templateNo: "tower_mechanical_parking", noticeText: "作業状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。\n＊雨天・緊急等の場合　順延する場合がございます。", frameNo: 2 },
  { id: 10, inspectionType: "防犯カメラ点検", showOnBoard: true, templateNo: "surveillance_camera", noticeText: "点検のため、マンション内に点検員が立ち入りいたします。", frameNo: 2 },
  { id: 11, inspectionType: "防犯カメラ取付工事", showOnBoard: true, templateNo: "surveillance_camera_installation_work", noticeText: "工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。", frameNo: 2 },
  { id: 12, inspectionType: "給水ポンプ点検（断水）", showOnBoard: true, templateNo: "water_supply_pump_construction", noticeText: "断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。", frameNo: 2 },
  { id: 13, inspectionType: "定期清掃", showOnBoard: true, templateNo: "cleaning", noticeText: "床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。", frameNo: 2 },
  { id: 14, inspectionType: "特別清掃", showOnBoard: true, templateNo: "cleaning", noticeText: "床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。\n＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。", frameNo: 2 },
  { id: 15, inspectionType: "エントランス定期清掃", showOnBoard: true, templateNo: "cleaning", noticeText: "床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。", frameNo: 2 },
  { id: 16, inspectionType: "照明器具清掃", showOnBoard: true, templateNo: "construction_light", noticeText: "床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。\n＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。", frameNo: 2 },
  { id: 17, inspectionType: "共用部電気設備点検（停電）", showOnBoard: true, templateNo: "shared_electrical_equipment", noticeText: "点検中、水道、エレベータ、インターホン、インターネット、機械駐車場が使えなくなります", frameNo: 2 },
  { id: 18, inspectionType: "共用部電気設備点検", showOnBoard: true, templateNo: "shared_electrical_equipment", noticeText: "点検のため、マンション内に調査員が立ち入りいたします。", frameNo: 2 },
  { id: 19, inspectionType: "消防設備点検ご協力のお願い", showOnBoard: true, templateNo: "fire_inspection", noticeText: "消防設備誤作動調査のため、お部屋に声をかけさせて頂く場合があります。ご協力お願いいたします、", frameNo: 2 },
  { id: 20, inspectionType: "宅配ボックス点検", showOnBoard: true, templateNo: "delivery_box", noticeText: "点検状況によっては入出庫に多少お待ち頂く場合がございます。\n入出庫の際は点検員へお声をかけて頂きますよう、お願い致します。", frameNo: 2 },
  { id: 21, inspectionType: "植栽の手入れ", showOnBoard: true, templateNo: "planting_management", noticeText: "植栽の手入れ、剪定あとの片づけのため、トラックを駐車いたします。＊雨天・緊急等の場合　順延する場合があります。", frameNo: 2 },
  { id: 22, inspectionType: "芝生の手入れ", showOnBoard: true, templateNo: "planting_management", noticeText: "芝刈り中は危険ですのでそばを通らないようお願いします。＊雨天・緊急等の場合　順延する場合があります。", frameNo: 2 },
  { id: 23, inspectionType: "植栽の消毒作業", showOnBoard: true, templateNo: "disinfection_tree", noticeText: "薬剤散布がございます。\n2～３階の方は、洗濯物を薬剤散布以降に干して頂きます様にお願い申し上げます。", frameNo: 2 },
  { id: 24, inspectionType: "マット交換", showOnBoard: true, templateNo: "", noticeText: "ただいま、マットの準備中です。雨天の際に足元が滑りやすくなりますのでご注意ください。", frameNo: 2 },
  { id: 25, inspectionType: "お部屋の排水管洗浄", showOnBoard: true, templateNo: "drainage_pipe", noticeText: "作業は２０分程で台所、浴室、洗面所の各排水口を洗浄致します。排水口付近の整理と在宅にご協力ください。入居者様の費用負担はございませんが、未実施で発生した排水管の詰まりによる事故及び漏水等の被害は入居者様負担となりますので、必ず実施をお願い申し上げます。", frameNo: 2 },
  { id: 26, inspectionType: "お部屋と共用の排水管洗浄", showOnBoard: true, templateNo: "drainage_pipe", noticeText: "作業は２０分程で台所、浴室、洗面所の各排水口を洗浄致します。排水口付近の整理と在宅にご協力ください。入居者様の費用負担はございませんが、未実施で発生した排水管の詰まりによる事故及び漏水等の被害は入居者様負担となりますので、必ず実施をお願い申し上げます。", frameNo: 2 },
  { id: 27, inspectionType: "音、振動を伴う工事", showOnBoard: true, templateNo: "construction_involving_sound_vibration", noticeText: "工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。", frameNo: 2 },
  { id: 28, inspectionType: "自動販売機工事", showOnBoard: true, templateNo: "vending_machine_construction", noticeText: "作業のため、マンション敷地内に作業員が立ち入ります。物の搬入のため車両を駐車いたします。雨天の場合　順延する場合があります。", frameNo: 2 },
  { id: 29, inspectionType: "屋上防水工事", showOnBoard: true, templateNo: "waterproof_construction", noticeText: "工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。", frameNo: 2 },
  { id: 30, inspectionType: "鉄部塗装", showOnBoard: true, templateNo: "iron_part_coating", noticeText: "工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。", frameNo: 2 },
  { id: 31, inspectionType: "自転車撤去", showOnBoard: true, templateNo: "bicycle_removal", noticeText: "建物敷地内駐輪場における放置自転車等の調査・撤去を行います。\nなお、契約ステッカーを貼付されていない方はご購入下さい。\nご協力の程よろしくお願い致します。", frameNo: 2 },
  { id: 32, inspectionType: "バイク置場工事", showOnBoard: true, templateNo: "construction_involving_sound_vibration", noticeText: "工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。", frameNo: 2 },
  { id: 33, inspectionType: "外壁タイル調査", showOnBoard: true, templateNo: "exterior_wall_tile_inspection", noticeText: "調査員が立ち入り、音と振動を伴います。また外壁を調査員が下がってきますので窓のカーテンを閉めてください。雨天のため順延する場合がございます。", frameNo: 2 },
  { id: 34, inspectionType: "特殊建築物調査", showOnBoard: true, templateNo: "building_inspection", noticeText: "点検のため、マンション内に調査員が立ち入りいたします。雨天の場合　順延する場合があります。", frameNo: 2 },
  { id: 35, inspectionType: "駐車場工事", showOnBoard: true, templateNo: "construction_involving_sound_vibration", noticeText: "工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。", frameNo: 2 },
  { id: 36, inspectionType: "インターネット機器工事", showOnBoard: true, templateNo: "questionnaire_conducted02", noticeText: "インターネット機器工事を行います　工事中はインターネットの利用ができません", frameNo: 2 },
  { id: 37, inspectionType: "機械式駐車場工事", showOnBoard: true, templateNo: "mechanical_parking", noticeText: "作業には音と振動を伴います。機械式駐車場が使用できない場合があります。契約車両の移動をお願いする場合もございますのでご協力お願いします。\n＊雨天・緊急対応等の場合　順延する場合があります。", frameNo: 2 },
  { id: 38, inspectionType: "ポンプ工事（断水）", showOnBoard: true, templateNo: "water_supply_pump_construction", noticeText: "断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。", frameNo: 2 },
  { id: 39, inspectionType: "貯水槽清掃", showOnBoard: true, templateNo: "simple_dedicated_water_supply", noticeText: "貯水槽清掃のため、マンション内に作業員が立ち入りいたします。断水はありませんが完了後、濁り水が出る場合があります。その際はしばらく流してご使用ください。", frameNo: 2 }
];

// Get unique property codes for testing
function getUniquePropertyCodes() {
  const seen = new Set();
  return expectedProperties.filter(p => {
    if (seen.has(p.propertyCode)) return false;
    seen.add(p.propertyCode);
    return true;
  });
}

module.exports = {
  expectedProperties,
  expectedVendors,
  expectedNotices,
  getUniquePropertyCodes
};
