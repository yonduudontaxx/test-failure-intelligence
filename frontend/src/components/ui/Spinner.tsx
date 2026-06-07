export type SpinnerSize = 'sm' | 'md' | 'lg';

const sizeClass: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-4',
};

export function Spinner({ size = 'md' }: { size?: SpinnerSize }) {
  return (
    <div role="status" aria-label="Loading" className="inline-flex items-center justify-center">
      <span
        className={`${sizeClass[size]} animate-spin rounded-full border-gray-300 border-t-gray-700`}
      />
    </div>
  );
}
