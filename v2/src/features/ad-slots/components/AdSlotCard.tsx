import { useState, useEffect } from 'react';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import type { DbAdSlot } from '@/types/database';

interface AdSlotCardProps {
  slot: DbAdSlot;
  onUpdate: (
    id: string,
    params: {
      image_url?: string | null;
      caption?: string | null;
      link_url?: string | null;
      is_active?: boolean;
    },
  ) => Promise<void>;
}

export function AdSlotCard({ slot, onUpdate }: AdSlotCardProps) {
  const { addToast } = useToast();
  const [imageUrl, setImageUrl] = useState(slot.image_url ?? '');
  const [caption, setCaption] = useState(slot.caption ?? '');
  const [linkUrl, setLinkUrl] = useState(slot.link_url ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setImageUrl(slot.image_url ?? '');
    setCaption(slot.caption ?? '');
    setLinkUrl(slot.link_url ?? '');
  }, [slot]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(slot.id, {
        image_url: imageUrl || null,
        caption: caption || null,
        link_url: linkUrl || null,
      });
      addToast(`スロット${slot.slot_index}を保存しました`, 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : '保存に失敗しました', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    try {
      await onUpdate(slot.id, { is_active: !slot.is_active });
      addToast(
        `スロット${slot.slot_index}を${slot.is_active ? '無効' : '有効'}にしました`,
        'success',
      );
    } catch (err) {
      addToast(err instanceof Error ? err.message : '変更に失敗しました', 'error');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">スロット {slot.slot_index}</span>
          <Badge variant={slot.is_active ? 'success' : 'default'}>
            {slot.is_active ? '有効' : '無効'}
          </Badge>
        </div>
        <Button
          variant={slot.is_active ? 'ghost' : 'success'}
          size="sm"
          onClick={handleToggleActive}
        >
          {slot.is_active ? '無効化' : '有効化'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Input
            label="画像URL"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://..."
          />
          <Input
            label="キャプション"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="広告の説明"
          />
          <Input
            label="リンクURL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://..."
          />
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm">
              保存
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
