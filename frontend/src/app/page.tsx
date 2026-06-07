import Link from 'next/link';
import { Card, Table, type TableColumn } from '@/components/ui';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';
import { getProjects } from '@/lib/api/projects';
import type { Project } from '@/lib/api/types';

const PAGE_SIZE = 50;

export default async function ProjectsListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requestedPage = parseInt(params.page ?? '1', 10);
  const page = Number.isFinite(requestedPage) && requestedPage >= 1 ? requestedPage : 1;

  const data = await getProjects({ page, limit: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  const columns: TableColumn<Project>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (p) => (
        <Link href={`/projects/${p.id}`} className="font-medium text-blue-700 hover:underline">
          {p.name}
        </Link>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (p) => <code className="font-mono text-xs text-gray-600">{p.slug}</code>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (p) =>
        p.description ? (
          <span className="text-gray-700">{p.description}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (p) => (
        <span className="text-gray-600">{new Date(p.createdAt).toLocaleDateString()}</span>
      ),
    },
  ];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {data.total} Project{data.total === 1 ? '' : 's'}
        </h1>
        <CreateProjectModal />
      </div>

      {data.items.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <h2 className="text-lg font-medium text-gray-900">No projects yet</h2>
            <p className="mt-1 text-sm text-gray-600">
              Create your first project to start ingesting test results.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <Table columns={columns} data={data.items} />
          {data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-4 px-1 text-sm">
              <p className="text-gray-600">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={`/?page=${page - 1}`}
                    className="rounded border border-gray-300 bg-white px-3 py-1 font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="rounded border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-400">
                    Previous
                  </span>
                )}
                {page < totalPages ? (
                  <Link
                    href={`/?page=${page + 1}`}
                    className="rounded border border-gray-300 bg-white px-3 py-1 font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="rounded border border-gray-200 bg-gray-50 px-3 py-1 font-medium text-gray-400">
                    Next
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
