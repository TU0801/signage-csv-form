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
  /** 取込の方式（false＝ファイル名を取込〔既定〕、true＝AIで取込。修正依頼1104 E11） */
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  configured: boolean;
  checking: boolean;
  /** 使えないときの理由（未設定など） */
  message: string | null;
  /** 文字情報で読み直す（AI なし・費用なし）。PDF があり『ファイル名を取込』のときだけ出す */
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

/**
 * 取込の方式の切替『ファイル名を取込｜AIで取込』（修正依頼1104 E11。業務システムと同じ形）と、読み取りの状況。
 * ファイル名を取込でも、PDF の文字情報は今までどおり読む（無料）。有料の AI-OCR だけを切り替える。AI が未設定なら AI 側を押せなくして理由を出す
 */
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
      <div role="group" aria-label="取込の方式" className="flex overflow-hidden rounded border border-blue-400" data-testid="upload-read-mode">
        {(
          [
            [false, 'ファイル名を取込', 'ファイル名と PDF の文字情報で読みます（費用なし）'],
            [true, 'AIで取込', 'AI-OCR に送って読み取ります（費用がかかります）'],
          ] as const
        ).map(([ai, label, title]) => {
          const on = (enabled && configured) === ai;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              title={title}
              disabled={disabled || (ai && !configured)}
              className={
                on
                  ? 'bg-blue-600 px-2 py-0.5 font-medium text-white disabled:opacity-50'
                  : 'bg-white px-2 py-0.5 text-blue-800 hover:bg-blue-50 disabled:text-gray-400 disabled:hover:bg-white'
              }
              onClick={() => {
                if (!on) onToggle(ai);
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
      {checking && <span className="text-gray-400">確認中…</span>}
      {!checking && !configured && message && <span className="text-amber-700">{message}</span>}
      {onReadLocal && (
        <Button variant="ghost" size="sm" className="text-xs" onClick={onReadLocal} disabled={disabled || ocr.state === 'running'}>
          読み直す
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
