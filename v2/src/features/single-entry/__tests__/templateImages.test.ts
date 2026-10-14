import { describe, it, expect } from 'vitest';
import { resolveTemplateImageUrl } from '../lib/templateImages';

// template_images_master() の戻り値の列（id, image_key, display_name, image_url, category, sort_order）のうち使う2列
const DB = [
  {
    image_key: 'Questionnaire_conducted02',
    image_url: 'https://example.supabase.co/storage/v1/object/public/poster-images/templates/Questionnaire_conducted02.png',
  },
  { image_key: 'cleaning', image_url: 'https://db/cleaning.png' },
  { image_key: 'no_url', image_url: '' },
];
const fileUrl = (f: string) => `https://storage/templates/${f}`;

describe('テンプレート画像の解決（v1 template-images.js getTemplateImageUrl）', () => {
  it('DB の image_key → 固定表 → 末尾一致の順に引き、どれにも無ければ null', () => {
    expect(resolveTemplateImageUrl('cleaning', DB, fileUrl)).toBe('https://db/cleaning.png');
    // 実DBで image_key と大文字小文字が違う template_no（10件）は固定表の別名で引く
    expect(resolveTemplateImageUrl('questionnaire_conducted02', DB, fileUrl)).toBe(
      'https://storage/templates/Questionnaire_conducted02.png',
    );
    expect(resolveTemplateImageUrl('construction_outer wall', DB, fileUrl)).toBe(
      'https://storage/templates/construction_outer_wall.png',
    );
    expect(resolveTemplateImageUrl('1124 235959elevator_inspection', DB, fileUrl)).toBe(
      'https://storage/templates/elevator_inspection.png',
    );
    expect(resolveTemplateImageUrl('unknown_key', DB, fileUrl)).toBeNull();
    expect(resolveTemplateImageUrl('', DB, fileUrl)).toBeNull();
  });
});
