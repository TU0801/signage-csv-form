// ユーザーが提供した正しい点検種別データからSQLを生成
const fs = require('fs');
const path = require('path');

// ユーザーが提供したデータ（TSV形式）
const correctData = `エレベーター定期点検	elevator_inspection	点検中はエレベーター停止致します。
ご不便をおかけします。
リモート点検	elevator_inspection
建物設備点検	building_inspection	点検のため、マンション内に調査員が立ち入りいたします。
消防設備点検	fire_inspection	消防法令　第17条3の3に基づく消防設備点検です。避難器具の周囲には障害物を置かないで下さい是正対象となります。当日点検に伺う場合があります。点検予定希望日の事前アンケートにご協力下さい。
貯水槽清掃（断水）	simple_dedicated_water_supply	断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。
簡易専用水道検査	building_inspection	点検のため、マンション内に調査員が立ち入り貯水槽の水質検査を行います。
自動扉点検	automatic_doors	点検のため、マンション内に点検員が立ち入りいたします。点検中に、オートロックが反応しない場合は点検員へお声をかけて頂きますよう、お願い致します。
機械式駐車場点検	mechanical_parking	作業状況によっては入出庫に多少お待ち頂く場合がございます。
入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。
＊雨天・緊急等の場合　順延する場合があります。
タワー式駐車場点検	tower_mechanical_parking	作業状況によっては入出庫に多少お待ち頂く場合がございます。
入出庫の際は作業員へお声をかけて頂きますよう、お願い致します。
＊雨天・緊急等の場合　順延する場合があります。
防犯カメラ点検	surveillance_camera	点検のため、マンション内に点検員が立ち入りいたします。
防犯カメラ取付工事	surveillance_camera_installation_work	工事のためマンション敷地内に作業員が立ち入り、作業には音と振動を伴います。また物の搬入のため車両を駐車いたしますので、皆様のご理解をお願いいたします。雨天のため順延する場合がございます。
給水ポンプ点検（断水）	water_supply_pump_construction	断水中は蛇口を閉めて下さい。断水中に蛇口を開けると、閉め忘れて漏水事故の恐れがあります。断水前に飲料水等の必要な水の確保をお願いします。トイレご排水にはお風呂の汲み置きが有効です。
定期清掃	cleaning	床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。
特別清掃	cleaning	床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。
＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。
エントランス定期清掃	cleaning	床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。
照明器具清掃	construction_light	床面が滑りやすくなっている場合があります。ご通行の際はご注意下さい。一時的に通行をご遠慮いただく事もございます。ご協力お願いします。
＊雨天などの理由で、清掃日時を変更させて頂く場合もございます。`;

// TSVをパースする
const lines = correctData.trim().split('\n');
const inspections = [];
let currentInspection = null;

for (const line of lines) {
  const parts = line.split('\t');
  if (parts.length >= 2) {
    // 新しい点検種別の開始
    if (currentInspection && currentInspection.notice_text) {
      inspections.push(currentInspection);
    }
    currentInspection = {
      inspection_name: parts[0].trim(),
      template_no: parts[1].trim(),
      notice_text: parts[2] ? parts[2].trim() : ''
    };
  } else if (currentInspection) {
    // 案内文の続き
    currentInspection.notice_text += '\n' + line;
  }
}
if (currentInspection) {
  inspections.push(currentInspection);
}

console.log(`解析した点検種別: ${inspections.length}件\n`);

// SQLを生成
const updateStatements = [];

inspections.forEach(item => {
  const inspectionName = item.inspection_name.replace(/'/g, "''");
  const templateNo = item.template_no.replace(/'/g, "''");
  const noticeText = item.notice_text.replace(/'/g, "''");

  if (templateNo) {
    updateStatements.push(`
UPDATE signage_master_inspection_types
SET template_no = '${templateNo}', notice_text = '${noticeText}'
WHERE inspection_name = '${inspectionName}';`);
  } else {
    updateStatements.push(`
UPDATE signage_master_inspection_types
SET notice_text = '${noticeText}'
WHERE inspection_name = '${inspectionName}';`);
  }
});

// 前回生成したSQLの誤字を修正するSQL
const fixTyposSQL = `
-- 誤字修正: construction_outer wall → construction_outer_wall
UPDATE signage_master_inspection_types
SET template_no = 'construction_outer_wall'
WHERE template_no = 'construction_outer wall';
`;

const sqlContent = `-- 点検種別のテンプレート画像と案内文を修正

${fixTyposSQL}

-- ユーザー提供データに基づく更新
${updateStatements.join('\n')}

-- 確認
SELECT inspection_name, template_no, LEFT(notice_text, 50) as notice_preview
FROM signage_master_inspection_types
WHERE template_no IS NOT NULL AND template_no != ''
ORDER BY inspection_name
LIMIT 30;
`;

// SQLファイルに出力
const sqlPath = path.join(__dirname, 'fix-inspection-templates.sql');
fs.writeFileSync(sqlPath, sqlContent, 'utf-8');

console.log(`SQLファイルを ${sqlPath} に出力しました`);
console.log(`\n修正するSQL文の数: ${updateStatements.length}件`);
