import type { PortalInspectionRow, DbInspectionReport } from '@/types/portal';

/**
 * 点検報告書のアップロード（保守会社・管理者）。点検一覧の行から開く。
 * 建物名・点検種別は inspection から、実施日は入力から取り、ファイル名を buildReportFileName で作って見せる
 */
export interface ReportUploadModalProps {
  open: boolean;
  onClose: () => void;
  inspection: PortalInspectionRow | null;
  /** 何月分の点検か（YYYY-MM-01）。点検月の無い点検行から開いたときは null（実施日の月になる） */
  targetMonth: string | null;
  /** 紐付ける申請（任意） */
  entryId?: string | null;
  /** 差戻し後の再提出なら元の報告書（差戻し理由を見せる） */
  previous?: DbInspectionReport | null;
  onUploaded: (report: DbInspectionReport) => void;
}

export function ReportUploadModal(_props: ReportUploadModalProps) {
  return null;
}
