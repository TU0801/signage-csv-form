import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

interface PosterPreviewProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string | null;
  templateNo: string;
  posterPosition: string;
  onPositionChange: (position: string) => void;
}

/**
 * ポスター位置グリッド
 * 0 = 全面表示
 * 1 = 左上, 2 = 右上, 3 = 左下, 4 = 右下
 */
const positions = [
  { value: '0', label: '全面', gridArea: '1 / 1 / 3 / 3' },
  { value: '1', label: '左上', gridArea: '1 / 1 / 2 / 2' },
  { value: '2', label: '右上', gridArea: '1 / 2 / 2 / 3' },
  { value: '3', label: '左下', gridArea: '2 / 1 / 3 / 2' },
  { value: '4', label: '右下', gridArea: '2 / 2 / 3 / 3' },
];

function PositionGrid({
  selected,
  onChange,
}: {
  selected: string;
  onChange: (pos: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">ポスター位置</p>
      <div className="grid grid-cols-2 gap-1 w-40 h-40 border border-gray-300 rounded p-1">
        {positions
          .filter((p) => p.value !== '0')
          .map((pos) => (
            <button
              key={pos.value}
              type="button"
              onClick={() => onChange(pos.value)}
              className={cn(
                'border rounded text-xs flex items-center justify-center transition-colors',
                selected === pos.value
                  ? 'bg-blue-500 text-white border-blue-600'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
              )}
            >
              {pos.label}
            </button>
          ))}
      </div>
      <button
        type="button"
        onClick={() => onChange('0')}
        className={cn(
          'w-40 py-1.5 border rounded text-xs transition-colors',
          selected === '0'
            ? 'bg-blue-500 text-white border-blue-600'
            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100',
        )}
      >
        全面表示
      </button>
    </div>
  );
}

export function PosterPreview({
  open,
  onClose,
  imageUrl,
  templateNo,
  posterPosition,
  onPositionChange,
}: PosterPreviewProps) {
  return (
    <Modal open={open} onClose={onClose} title="テンプレートプレビュー" className="max-w-2xl">
      <div className="flex gap-6">
        {/* プレビュー画像 */}
        <div className="flex-1">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`テンプレート ${templateNo}`}
              className="w-full rounded border border-gray-200"
            />
          ) : (
            <div className="w-full h-48 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400 text-sm">
              テンプレート画像なし
            </div>
          )}
          <p className="mt-2 text-sm text-gray-500 text-center">テンプレートNo: {templateNo}</p>
        </div>

        {/* ポスター位置グリッド */}
        <PositionGrid selected={posterPosition} onChange={onPositionChange} />
      </div>
    </Modal>
  );
}
