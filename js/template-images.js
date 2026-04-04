// template-images.js - テンプレート画像辞書とURL解決
// script.js から分離。dbTemplateImages は index.html から設定される。

// DBから読み込んだテンプレート画像を保持
// index.html のモジュールから直接代入される（グローバルレキシカルスコープ共有）
let dbTemplateImages = [];

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
    "construction_outer wall": "images/construction_outer_wall.png",
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
    "questionnaire_conducted01": "images/Questionnaire_conducted01.png",
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
    "fire_inspection": "images/fire_inspection.png",
    "surveillance_camera": "images/surveillance_camera.png",
    "vending_machine_construction_2": "images/vending_machine_construction_2.png",
    "shared_area_drain_pipe_inspection": "images/shared_area_drain_pipe_inspection.png",
    "Construction_without_sound": "images/Construction_without_sound.png",
    "construction_without_sound": "images/Construction_without_sound.png",
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
    "questionnaire_conducted02": "images/Questionnaire_conducted02.png",
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
