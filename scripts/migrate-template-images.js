/**
 * テンプレート画像移行スクリプト
 *
 * 使い方:
 * 1. npm install @supabase/supabase-js
 * 2. node scripts/migrate-template-images.js
 *
 * 必要な環境変数:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_KEY (管理者キー)
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Supabase設定
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://rzfbmmmtrbxwkxtsvypi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY環境変数を設定してください');
  console.error('Supabase Dashboard > Settings > API > service_role keyを使用');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 画像キーから日本語表示名へのマッピング
const displayNameMap = {
  "automatic_doors": "自動ドア点検",
  "bicycle_removal": "放置自転車撤去",
  "building_inspection": "建物点検",
  "card_reader": "カードリーダー点検",
  "cleaning": "清掃",
  "cleaning_bucket": "清掃（バケツ）",
  "construction_building_large_scale": "大規模修繕工事",
  "construction_coin_parking": "コインパーキング工事",
  "construction_Intercom": "インターホン工事",
  "construction_involving_sound_vibration": "騒音・振動を伴う工事",
  "construction_jcom_cable": "JCOM・ケーブル工事",
  "construction_light": "照明工事",
  "construction_mobile_antenna": "携帯アンテナ工事",
  "construction_outer_wall": "外壁工事",
  "construction_roller_paint": "塗装工事（ローラー）",
  "construction_spanner": "設備工事（スパナ）",
  "construction_television_equipment": "テレビ設備工事",
  "construction_toolbox": "工事（工具箱）",
  "Construction_without_sound": "静音工事",
  "delivery_box": "宅配ボックス点検",
  "delivery_box_stop_using": "宅配ボックス使用停止",
  "disinfection": "消毒作業",
  "disinfection_tree": "樹木消毒",
  "drainage_pipe": "排水管点検",
  "electrical_measurement": "電気計測",
  "elevator_inspection": "エレベーター点検",
  "elevator_mat_replacement": "エレベーターマット交換",
  "exchange_corridor": "共用廊下交換",
  "exchange_light_battery": "照明・電池交換",
  "exchange_light_battery_2": "照明・電池交換2",
  "exterior_wall_tile_inspection": "外壁タイル点検",
  "fire_construction": "消防設備工事",
  "fire_exchange": "消防設備交換",
  "fire_extinguisher_explain": "消火器説明",
  "glass_clean": "ガラス清掃",
  "high_pressure_cleaning": "高圧洗浄",
  "high_pressure_cleaning_2": "高圧洗浄2",
  "Investigation": "調査",
  "iron_part_coating": "鉄部塗装",
  "mechanical_parking": "機械式駐車場点検",
  "mechanical_parking_turntable": "機械式駐車場（ターンテーブル）",
  "merchari_installation": "メルチャリ設置",
  "painting_water_pipe": "水道管塗装",
  "planting_management": "植栽管理",
  "protect_balcony_from_birds": "バルコニー鳥害対策",
  "protect_balcony_from_birds_2": "バルコニー鳥害対策2",
  "Questionnaire_conducted01": "アンケート実施1",
  "Questionnaire_conducted02": "アンケート実施2",
  "shared_area_drain_pipe_inspection": "共用部排水管点検",
  "shared_area_drain_pipe_wash": "共用部排水管洗浄",
  "shared_electrical_equipment": "共用電気設備点検",
  "simple_dedicated_water_supply": "専用給水設備点検",
  "surveillance_camera": "防犯カメラ点検",
  "surveillance_camera_installation_work": "防犯カメラ設置工事",
  "tower_mechanical_parking": "タワー式機械駐車場",
  "vending_machine_construction": "自動販売機工事",
  "vending_machine_construction_2": "自動販売機工事2",
  "water_activator_construction": "活水器工事",
  "water_supply_pump_construction": "給水ポンプ工事",
  "waterproof_construction": "防水工事"
};

// カテゴリ分類
function getCategory(imageKey) {
  if (imageKey.includes('construction') || imageKey.includes('Construction')) return '工事';
  if (imageKey.includes('cleaning') || imageKey.includes('clean')) return '清掃';
  if (imageKey.includes('inspection') || imageKey.includes('Investigation')) return '点検';
  if (imageKey.includes('exchange') || imageKey.includes('fire')) return '設備';
  if (imageKey.includes('disinfection')) return '消毒';
  return 'その他';
}

async function migrateImages() {
  const imagesDir = path.join(__dirname, '..', 'images');
  const files = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png'));

  console.log(`\n=== テンプレート画像移行開始 ===`);
  console.log(`対象: ${files.length}ファイル\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const imageKey = filename.replace('.png', '');
    const filePath = path.join(imagesDir, filename);

    console.log(`[${i + 1}/${files.length}] ${imageKey}`);

    try {
      // 1. ファイルを読み込む
      const fileBuffer = fs.readFileSync(filePath);

      // 2. Supabase Storageにアップロード
      const storagePath = `templates/${filename}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('poster-images')
        .upload(storagePath, fileBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // 3. 公開URLを取得
      const { data: urlData } = supabase.storage
        .from('poster-images')
        .getPublicUrl(storagePath);

      const imageUrl = urlData.publicUrl;

      // 4. DBにレコードを挿入
      const displayName = displayNameMap[imageKey] || imageKey;
      const category = getCategory(imageKey);

      const { error: dbError } = await supabase
        .from('signage_master_template_images')
        .upsert({
          image_key: imageKey,
          display_name: displayName,
          image_url: imageUrl,
          category: category,
          sort_order: i
        }, { onConflict: 'image_key' });

      if (dbError) {
        throw new Error(`DB insert failed: ${dbError.message}`);
      }

      console.log(`  ✓ ${displayName} (${category})`);
      successCount++;

    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n=== 移行完了 ===`);
  console.log(`成功: ${successCount}`);
  console.log(`失敗: ${errorCount}`);
}

// 実行
migrateImages().catch(console.error);
