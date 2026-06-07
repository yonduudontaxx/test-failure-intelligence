'use client';

export function Pagination({
  page,
  limit,
  total,
  onPageChange,
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isFirst}
          onClick={() => onPageChange(page - 1)}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 enabled:hover:bg-gray-50 disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={() => onPageChange(page + 1)}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 enabled:hover:bg-gray-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
