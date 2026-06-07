'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Overview', segment: '' },
  { label: 'Runs', segment: 'runs' },
  { label: 'Flaky Tests', segment: 'flaky' },
  { label: 'Trends', segment: 'trends' },
  { label: 'Patterns', segment: 'patterns' },
] as const;

function isActive(pathname: string, projectBase: string, segment: string): boolean {
  if (segment === '') {
    return pathname === projectBase || pathname === `${projectBase}/`;
  }
  const subPath = `${projectBase}/${segment}`;
  return pathname === subPath || pathname.startsWith(`${subPath}/`);
}

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const projectBase = `/projects/${projectId}`;

  return (
    <nav className="border-b border-gray-200">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const href = tab.segment ? `${projectBase}/${tab.segment}` : projectBase;
          const active = isActive(pathname, projectBase, tab.segment);
          return (
            <li key={tab.segment}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'inline-block border-b-2 border-blue-600 px-4 py-2 text-sm font-medium text-blue-700'
                    : 'inline-block border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
