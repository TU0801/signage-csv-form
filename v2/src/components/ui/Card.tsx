import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('rounded-lg border border-gray-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return <div className={cn('border-b border-gray-200 px-3 py-2', className)}>{children}</div>;
}

// 呼び出し側が p-* を渡したときは既定の p-3 を付けない（cn は結合のみで、同じ padding 同士は CSS の並び順で勝敗が決まるため）
export function CardContent({ children, className }: CardProps) {
  return <div className={cn(!/(^|\s)p-/.test(className ?? '') && 'p-3', className)}>{children}</div>;
}
