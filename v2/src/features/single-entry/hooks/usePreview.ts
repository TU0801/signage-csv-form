import { useState, useCallback, useMemo } from 'react';
import type { DbInspectionType } from '@/types/database';

interface UsePreviewArgs {
  inspectionTypes: DbInspectionType[];
}

export function usePreview({ inspectionTypes }: UsePreviewArgs) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewTemplateNo, setPreviewTemplateNo] = useState<string>('');

  const openPreview = useCallback((templateNo: string) => {
    setPreviewTemplateNo(templateNo);
    setPreviewOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

  /** テンプレート番号からテンプレート画像URLを取得 */
  const previewImageUrl = useMemo(() => {
    if (!previewTemplateNo) return null;
    const inspType = inspectionTypes.find((t) => t.template_no === previewTemplateNo);
    return inspType?.template_image ?? null;
  }, [inspectionTypes, previewTemplateNo]);

  return {
    previewOpen,
    previewTemplateNo,
    previewImageUrl,
    openPreview,
    closePreview,
  };
}
