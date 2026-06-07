import type { ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'critical' | 'neutral' | 'info';

const variantClass: Record<BadgeVariant, string> = {
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-800',
  info: 'bg-blue-100 text-blue-800',
};

export function Badge({
  children,
  variant = 'neutral',
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variantClass[variant]}`}
    >
      {children}
    </span>
  );
}
