import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
import { AppHeader } from '@/components/AppHeader';

export const metadata: Metadata = {
  title: 'Test Failure Intelligence',
  description: 'Quality engineering platform for analyzing test failures and surfacing insights',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <AppHeader />
        {children}
      </body>
    </html>
  );
}
