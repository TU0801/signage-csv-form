import type { DbTemplateImage } from '@/types/database';

/**
 * テンプレート画像の固定表（キー → ファイル名）。v1 js/template-images.js の templateImages と同じキー。
 *
 * v1 はリポジトリ直下 images/ の PNG を相対パスで読むが、v2 は rootDirectory=v2 で配信するため
 * その相対パスは v2 のドメインでは 404 になる。images/ の 60 ファイルは全て Storage の
 * poster-images/templates/ に同名で置かれている（2026-10-15 に storage.objects と突き合わせ済み）ので、
 * v2 はファイル名から Storage の公開 URL を作る（v2/public への 6.9MB の複製はしない）。
 *
 * 表が要るのは、DB（biz.template_images）の image_key と大文字小文字が違う template_no
 * （questionnaire_conducted01/02, construction_without_sound など 10 件）を引き当てるため。
 */
// v1: js/template-images.js templateImages
export const TEMPLATE_IMAGE_FILES: Readonly<Record<string, string>> = {
  exchange_light_battery_2: 'exchange_light_battery_2.png',
  painting_water_pipe: 'painting_water_pipe.png',
  disinfection_tree: 'disinfection_tree.png',
  exchange_light_battery: 'exchange_light_battery.png',
  waterproof_construction: 'waterproof_construction.png',
  high_pressure_cleaning_2: 'high_pressure_cleaning_2.png',
  bicycle_removal: 'bicycle_removal.png',
  construction_building_large_scale: 'construction_building_large_scale.png',
  construction_coin_parking: 'construction_coin_parking.png',
  fire_extinguisher_explain: 'fire_extinguisher_explain.png',
  construction_light: 'construction_light.png',
  construction_toolbox: 'construction_toolbox.png',
  cleaning: 'cleaning.png',
  Investigation: 'Investigation.png',
  construction_television_equipment: 'construction_television_equipment.png',
  water_activator_construction: 'water_activator_construction.png',
  high_pressure_cleaning: 'high_pressure_cleaning.png',
  automatic_doors: 'automatic_doors.png',
  glass_clean: 'glass_clean.png',
  mechanical_parking: 'mechanical_parking.png',
  planting_management: 'planting_management.png',
  construction_outer_wall: 'construction_outer_wall.png',
  'construction_outer wall': 'construction_outer_wall.png',
  construction_jcom_cable: 'construction_jcom_cable.png',
  simple_dedicated_water_supply: 'simple_dedicated_water_supply.png',
  surveillance_camera_installation_work: 'surveillance_camera_installation_work.png',
  tower_mechanical_parking: 'tower_mechanical_parking.png',
  construction_involving_sound_vibration: 'construction_involving_sound_vibration.png',
  elevator_inspection: 'elevator_inspection.png',
  shared_electrical_equipment: 'shared_electrical_equipment.png',
  mechanical_parking_turntable: 'mechanical_parking_turntable.png',
  delivery_box: 'delivery_box.png',
  disinfection: 'disinfection.png',
  Questionnaire_conducted01: 'Questionnaire_conducted01.png',
  questionnaire_conducted01: 'Questionnaire_conducted01.png',
  protect_balcony_from_birds: 'protect_balcony_from_birds.png',
  elevator_mat_replacement: 'elevator_mat_replacement.png',
  construction_roller_paint: 'construction_roller_paint.png',
  merchari_installation: 'merchari_installation.png',
  iron_part_coating: 'iron_part_coating.png',
  construction_Intercom: 'construction_Intercom.png',
  drainage_pipe: 'drainage_pipe.png',
  protect_balcony_from_birds_2: 'protect_balcony_from_birds_2.png',
  construction_spanner: 'construction_spanner.png',
  fire_construction: 'fire_construction.png',
  fire_inspection: 'fire_inspection.png',
  surveillance_camera: 'surveillance_camera.png',
  vending_machine_construction_2: 'vending_machine_construction_2.png',
  shared_area_drain_pipe_inspection: 'shared_area_drain_pipe_inspection.png',
  Construction_without_sound: 'Construction_without_sound.png',
  construction_without_sound: 'Construction_without_sound.png',
  card_reader: 'card_reader.png',
  water_supply_pump_construction: 'water_supply_pump_construction.png',
  electrical_measurement: 'electrical_measurement.png',
  shared_area_drain_pipe_wash: 'shared_area_drain_pipe_wash.png',
  exchange_corridor: 'exchange_corridor.png',
  building_inspection: 'building_inspection.png',
  exterior_wall_tile_inspection: 'exterior_wall_tile_inspection.png',
  cleaning_bucket: 'cleaning_bucket.png',
  delivery_box_stop_using: 'delivery_box_stop_using.png',
  fire_exchange: 'fire_exchange.png',
  construction_mobile_antenna: 'construction_mobile_antenna.png',
  Questionnaire_conducted02: 'Questionnaire_conducted02.png',
  questionnaire_conducted02: 'Questionnaire_conducted02.png',
  vending_machine_construction: 'vending_machine_construction.png',
};

/** 固定表のファイル名 → Storage の公開 URL を作る関数（テストでは差し替える） */
export type TemplateFileUrl = (fileName: string) => string;

/**
 * テンプレート画像の URL を解決する。順番は v1 と同じ:
 * 1. DB（template_images_master）の image_key が一致し image_url があるもの
 * 2. 固定表のキーが一致するもの
 * 3. 日時プレフィックス付き（例 "1124 235959cleaning"）は末尾が固定表のキーに一致するもの
 */
// v1: js/template-images.js getTemplateImageUrl
export function resolveTemplateImageUrl(
  templateKey: string,
  dbImages: Pick<DbTemplateImage, 'image_key' | 'image_url'>[],
  fileUrl: TemplateFileUrl,
): string | null {
  if (!templateKey) return null;

  const dbImage = dbImages.find((ti) => ti.image_key === templateKey);
  if (dbImage?.image_url) return dbImage.image_url;

  const file = TEMPLATE_IMAGE_FILES[templateKey];
  if (file) return fileUrl(file);

  for (const key of Object.keys(TEMPLATE_IMAGE_FILES)) {
    if (templateKey.endsWith(key)) return fileUrl(TEMPLATE_IMAGE_FILES[key]!);
  }
  return null;
}
