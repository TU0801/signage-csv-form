/**
 * テンプレート画像キー → 表示名（v1 の固定表）。
 * 点検種別の一覧の「画像:」欄はこの表で表示名にし（v1 renderInspections）、
 * 業務システムのテンプレート画像が読めないときは編集モーダルの選択肢にもこの表を使う（v1 openMasterModal のフォールバック）。
 */
// v1: js/admin-masters.js templateImages
export const TEMPLATE_IMAGE_LABELS: Record<string, string> = {
  // 点検・調査
  Investigation: '調査',
  building_inspection: '建物点検',
  elevator_inspection: 'エレベーター点検',
  exterior_wall_tile_inspection: '外壁タイル点検',
  shared_area_drain_pipe_inspection: '共用部排水管点検',
  electrical_measurement: '電気測定',

  // 清掃
  cleaning: '清掃',
  cleaning_bucket: '清掃（バケツ）',
  glass_clean: 'ガラス清掃',
  high_pressure_cleaning: '高圧洗浄',
  high_pressure_cleaning_2: '高圧洗浄2',
  shared_area_drain_pipe_wash: '共用部排水管洗浄',
  drainage_pipe: '排水管',

  // 消毒・植栽
  disinfection: '消毒',
  disinfection_tree: '消毒・植栽',
  planting_management: '植栽管理',

  // 工事・修繕
  construction_building_large_scale: '大規模修繕',
  construction_outer_wall: '外壁工事',
  construction_light: '照明工事',
  construction_toolbox: '工具箱工事',
  construction_television_equipment: 'テレビ設備工事',
  construction_jcom_cable: 'JCOM配線工事',
  construction_Intercom: 'インターホン工事',
  construction_coin_parking: 'コインパーキング工事',
  construction_involving_sound_vibration: '騒音・振動工事',
  construction_roller_paint: 'ローラー塗装',
  construction_spanner: 'スパナ工事',
  construction_mobile_antenna: 'モバイルアンテナ工事',
  Construction_without_sound: '静音工事',
  waterproof_construction: '防水工事',
  fire_construction: '消防工事',
  vending_machine_construction: '自販機工事',
  vending_machine_construction_2: '自販機工事2',
  water_activator_construction: '水質活性化工事',
  water_supply_pump_construction: '給水ポンプ工事',

  // 塗装
  painting_water_pipe: '水道管塗装',
  iron_part_coating: '鉄部塗装',

  // 交換
  exchange_light_battery: '照明・電池交換',
  exchange_light_battery_2: '照明・電池交換2',
  exchange_corridor: '廊下交換',
  elevator_mat_replacement: 'エレベーターマット交換',
  fire_exchange: '消防設備交換',
  fire_extinguisher_explain: '消火器説明',

  // 設備
  automatic_doors: '自動ドア',
  mechanical_parking: '機械式駐車場',
  mechanical_parking_turntable: 'ターンテーブル駐車場',
  tower_mechanical_parking: 'タワー式駐車場',
  delivery_box: '宅配ボックス',
  delivery_box_stop_using: '宅配ボックス使用停止',
  simple_dedicated_water_supply: '専用水道設備',
  shared_electrical_equipment: '共用部電気設備',
  card_reader: 'カードリーダー',
  mail_box: 'メールボックス',
  drain_pipe_cleaning_truck: '排水管洗浄トラック',

  // 防犯・安全
  surveillance_camera: '防犯カメラ',
  surveillance_camera_installation_work: '防犯カメラ設置',
  protect_balcony_from_birds: '鳥害対策',
  protect_balcony_from_birds_2: '鳥害対策2',

  // その他
  bicycle_removal: '自転車撤去',
  merchari_installation: 'シェアサイクル設置',
  questionnaire_conducted01: 'アンケート',
  questionnaire_conducted02: 'アンケート2',
};
