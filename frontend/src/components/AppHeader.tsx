import Link from 'next/link';

export function AppHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-3">
        <Link href="/" className="text-lg font-semibold text-gray-900 hover:text-blue-700">
          Test Failure Intelligence
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-gray-700 hover:text-gray-900">
            Projects
          </Link>
        </nav>
      </div>
    </header>
  );
}
