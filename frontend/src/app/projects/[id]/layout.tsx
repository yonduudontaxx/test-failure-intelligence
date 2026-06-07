import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { getProject } from '@/lib/api/projects';
import { ProjectTabs } from '@/components/projects/ProjectTabs';

export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let project;
  try {
    project = await getProject(id);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'PROJECT_NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div>
        <Link href="/" className="text-sm text-blue-700 hover:underline">
          ← All projects
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">{project.name}</h1>
        {project.description ? (
          <p className="mt-1 text-sm text-gray-600">{project.description}</p>
        ) : null}
      </div>
      <ProjectTabs projectId={id} />
      <div>{children}</div>
    </main>
  );
}
