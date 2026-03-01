import { useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useAdSlots } from '../hooks/useAdSlots';
import { AdSlotCard } from './AdSlotCard';

export function AdSlotsContent() {
  const { slots, loading, error, ensureSlots, updateSlot } = useAdSlots();

  useEffect(() => {
    ensureSlots();
  }, [ensureSlots]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">広告枠管理</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot) => (
          <AdSlotCard key={slot.id} slot={slot} onUpdate={updateSlot} />
        ))}
      </div>
    </div>
  );
}
