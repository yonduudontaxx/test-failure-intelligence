import { Spinner } from '@/components/ui';

export default function ProjectLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
