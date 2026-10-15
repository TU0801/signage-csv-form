import { Input } from '@/components/ui/Input';
import { PosterType } from '@/lib/constants';
import type { EntryFormApi } from '../hooks/useEntryForm';
import { POSITION_OPTIONS } from '../lib/entryLogic';

interface DisplaySettingsProps {
  form: EntryFormApi;
}

/** 表示設定タブ（表示開始・終了の日時、表示時間、表示位置）。追加貼紙のときは表示日時を入力できない */
// v1: index.html #settingsTab / js/script.js onPositionChange, onPosterTypeChange
export function DisplaySettings({ form }: DisplaySettingsProps) {
  const { values } = form;
  const isCustom = values.posterType === PosterType.CUSTOM;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Input
          id="se-display-start-date"
          label="表示開始日"
          type="date"
          value={values.displayStartDate}
          disabled={isCustom}
          onChange={(e) => form.setField('displayStartDate', e.target.value)}
        />
        <Input
          id="se-display-start-time"
          label="表示開始時間"
          type="time"
          value={values.displayStartTime}
          disabled={isCustom}
          onChange={(e) => form.setField('displayStartTime', e.target.value)}
        />
        <Input
          id="se-display-end-date"
          label="表示終了日"
          type="date"
          value={values.displayEndDate}
          disabled={isCustom}
          onChange={(e) => form.setField('displayEndDate', e.target.value)}
        />
        <Input
          id="se-display-end-time"
          label="表示終了時間"
          type="time"
          value={values.displayEndTime}
          disabled={isCustom}
          onChange={(e) => form.setField('displayEndTime', e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <Input
          id="se-display-time"
          label="表示時間（秒）"
          type="number"
          min={1}
          max={60}
          value={values.displayTime}
          onChange={(e) => form.setField('displayTime', e.target.value)}
        />
        <fieldset className="space-y-0.5">
          <legend className="text-xs font-medium text-gray-600">表示位置</legend>
          <div className="flex flex-wrap gap-2 pt-1 text-sm">
            {POSITION_OPTIONS.map((p) => (
              <label key={p.value} className="inline-flex items-center gap-1">
                <input
                  type="radio"
                  name="se-display-position"
                  value={p.value}
                  checked={values.frameNo === p.value}
                  onChange={() => form.setField('frameNo', p.value)}
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </div>
  );
}
