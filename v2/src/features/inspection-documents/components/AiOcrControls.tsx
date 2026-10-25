import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { formatDate, formatMonth } from '@/features/inspection-portal/lib/schedule';
import type { OcrSuggestion } from '../lib/aiOcr';
import type { OcrMode } from '../lib/runOcr';

export type OcrState =
  | { state: 'idle' }
  | { state: 'running'; useAi: boolean }
  | { state: 'done'; suggestion: OcrSuggestion; mode: OcrMode; pages: number }
  | { state: 'error'; message: string };

interface AiOcrControlsProps {
  /** ☑ AI-OCRで判定（既定 OFF） */
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  configured: boolean;
  checking: boolean;
  /** 使えないときの理由（未設定など） */
  message: string | null;
  /** 文字情報だけで読む（AI なし・費用なし）。PDF のときだけ出す */
  onReadLocal?: () => void;
  disabled?: boolean;
  ocr: OcrState;
}

const MODE_LABEL: Record<OcrMode, string> = {
  text: 'AI（PDF の文字情報）',
  pdf: 'AI（PDF のページ画像）',
  image: 'AI（画像）',
  local: '文字情報だけ（AI なし）',
};

/** AI-OCR のチェックボックスと、読み取りの状況（未設定なら無効にして理由を出す） */
export function AiOcrControls({
  enabled,
  onToggle,
  configured,
  checking,
  message,
  onReadLocal,
  disabled,
  ocr,
}: AiOcrControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <label className={configured ? 'flex items-center gap-1 text-gray-700' : 'flex items-center gap-1 text-gray-400'}>
        <input
          type="checkbox"
          checked={enabled && configured}
          disabled={!configured || disabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        AI-OCRで判定
      </label>
      {checking && <span className="text-gray-400">確認中…</span>}
      {!checking && !configured && message && <span className="text-amber-700">{message}</span>}
      {onReadLocal && (
        <Button variant="ghost" size="sm" className="text-xs" onClick={onReadLocal} disabled={disabled || ocr.state === 'running'}>
          文字情報から読み取る（AI なし）
        </Button>
      )}
      <span aria-live="polite" className="contents">
        {ocr.state === 'running' && (
          <span className="flex items-center gap-1 text-gray-600" role="status">
            <Spinner size="sm" />
            {ocr.useAi ? 'AI-OCR で読み取り中…' : '文字情報を読み取り中…'}
          </span>
        )}
        {ocr.state === 'error' && <span className="text-red-600">読み取れませんでした: {ocr.message}</span>}
      </span>
    </div>
  );
}

/** 抽出データ（DocFlow と同じ: 点検日・建物名・点検種別ほか）。値は初期値として入れ、人が確かめて直す */
export function OcrSummary({ ocr }: { ocr: OcrState }) {
  if (ocr.state !== 'done') return null;
  const s = ocr.suggestion;
  const buildings = s.pages.filter((p) => p.buildingRead || p.property);
  const shown = buildings.slice(0, 8);
  return (
    <div className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] text-sky-900" data-testid="ocr-summary">
      <p className="font-medium">
        抽出データ（{MODE_LABEL[ocr.mode]}・{ocr.pages}ページ）
        <span className="ml-1 font-normal text-sky-700">読み取った値は初期値です。提出の前に確かめて直してください。</span>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 sm:grid-cols-[auto_1fr_auto_1fr_auto_1fr]">
        <dt className="text-sky-700">書類</dt>
        <dd>{s.documentType || '—'}</dd>
        <dt className="text-sky-700">対象月</dt>
        <dd>{s.targetMonth ? `${formatMonth(s.targetMonth)}分` : '—'}</dd>
        <dt className="text-sky-700">実施日</dt>
        <dd>{s.performedOn ? formatDate(s.performedOn) : '—'}</dd>
        <dt className="text-sky-700">会社</dt>
        <dd>{s.vendor?.name ?? (s.vendorRead || '—')}</dd>
        <dt className="text-sky-700">点検種別</dt>
        <dd>{s.inspectionType ?? (s.inspectionTypeRead || '—')}</dd>
        <dt className="text-sky-700">建物</dt>
        <dd>{s.property ? `${s.property.name}（${s.property.code}）` : '—'}</dd>
      </dl>
      {shown.length > 1 && (
        <ul className="mt-0.5 flex flex-wrap gap-x-3">
          {shown.map((p) => (
            <li key={p.page}>
              p.{p.page}: {p.property ? p.property.name : `${p.buildingRead}（該当なし）`}
            </li>
          ))}
          {buildings.length > shown.length && <li>…ほか{buildings.length - shown.length}ページ</li>}
        </ul>
      )}
    </div>
  );
}
