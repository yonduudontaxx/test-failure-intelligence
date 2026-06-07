'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { createProject } from '@/lib/api/projects';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function CreateProjectModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function close() {
    if (submitting) return;
    setOpen(false);
    setName('');
    setSlug('');
    setDescription('');
    setError(null);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setName('');
        setSlug('');
        setDescription('');
        setError(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName || !trimmedSlug) {
      setError('Name and slug are required.');
      return;
    }
    if (!SLUG_REGEX.test(trimmedSlug)) {
      setError('Slug must be lowercase letters, numbers, and dashes only.');
      return;
    }

    setSubmitting(true);
    try {
      await createProject({
        name: trimmedName,
        slug: trimmedSlug,
        description: description.trim() || undefined,
      });
      setOpen(false);
      setName('');
      setSlug('');
      setDescription('');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'DUPLICATE_PROJECT_SLUG') {
          setError('A project with this slug already exists.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to create project.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
      >
        New Project
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create project"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <form onSubmit={onSubmit} className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Create project</h2>
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  className="text-2xl leading-none text-gray-400 hover:text-gray-600 disabled:opacity-50"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div>
                <label htmlFor="project-name" className="block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="project-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={submitting}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label htmlFor="project-slug" className="block text-sm font-medium text-gray-700">
                  Slug
                </label>
                <input
                  id="project-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  required
                  disabled={submitting}
                  placeholder="my-project"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Lowercase letters, numbers, and dashes only.
                </p>
              </div>

              <div>
                <label
                  htmlFor="project-description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="project-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  disabled={submitting}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              {error && (
                <div role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={submitting}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
