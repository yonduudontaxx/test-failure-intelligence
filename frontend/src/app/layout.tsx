import type { Metadata } from 'next';
import React from 'react';

export const metadata: Metadata = {
  title: 'Test Failure Intelligence',
  description: 'Quality engineering platform for analyzing test failures and surfacing insights',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
