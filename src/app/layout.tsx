import type { Metadata, Viewport } from 'next';
import { GeistMono, GeistSans } from 'geist/font';
import { Suspense } from 'react';
import { AppProviders } from '@/components/providers';
import { AppShell } from '@/components/app-shell';
import { PwaController } from '@/components/pwa-controller';
import { LegacyRouteBridge } from '@/components/legacy-route-bridge';
import './globals.css';
import './tui-shell.css';

export const metadata: Metadata = {
  title: {
    default: 'Amordle',
    template: '%s · Amordle',
  },
  description: 'Solo, Daily, and competitive word games.',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7faf9' },
    { media: '(prefers-color-scheme: dark)', color: '#11181c' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-accent="aurora"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppProviders>
          <Suspense fallback={<main className="route-frame">Loading…</main>}>
            <AppShell>{children}</AppShell>
          </Suspense>
          <PwaController />
          <LegacyRouteBridge />
        </AppProviders>
      </body>
    </html>
  );
}
