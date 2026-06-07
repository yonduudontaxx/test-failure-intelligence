import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}>
      {title && (
        <h2 className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">
          {title}
        </h2>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
