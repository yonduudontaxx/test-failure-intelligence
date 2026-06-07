'use client';

import Link from 'next/link';

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isProjectNotFound = /project[_ -]?not[_ -]?found/i.test(error.message);

  return (
    <main className="mx-auto flex min-h-[40vh] max-w-2xl flex-col items-center justify-center px-8 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">
        {isProjectNotFound ? 'Project not found' : 'Could not load this project'}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        {isProjectNotFound
          ? 'The project you requested does not exist or has been removed.'
          : 'An unexpected error occurred while loading this project.'}
      </p>
      {!isProjectNotFound && error.message ? (
        <p className="mt-3 max-w-lg break-words font-mono text-xs text-gray-500">{error.message}</p>
      ) : null}
      <div className="mt-6 flex gap-2">
        {isProjectNotFound ? (
          <Link
            href="/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Back to projects
          </Link>
        ) : (
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            Try again
          </button>
        )}
      </div>
    </main>
  );
}
