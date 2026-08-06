import type { Metadata, Viewport } from 'next';
import { GeistMono, GeistSans } from 'geist/font';
import { Suspense } from 'react';
import { AppProviders } from '@/components/providers';
import { AppShell } from '@/components/app-shell';
import { SkeletonRows } from '@/components/workbench';
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
          {/*
            V7-11. This fallback covers the shell itself suspending, before `AppShell`
            and therefore before the main landmark exists — so unlike `loading.tsx` it
            does render its own `<main>`. It was the bare string "Loading…"; it now uses
            the same skeleton primitive, so the first paint of a cold load is a
            placeholder for the app rather than unstyled text.
          */}
          <Suspense
            fallback={
              <main className="route-frame" aria-busy="true">
                <SkeletonRows label="Loading Amordle…" rows={4} />
              </main>
            }
          >
            <AppShell>{children}</AppShell>
          </Suspense>
          <PwaController />
          <LegacyRouteBridge />
        </AppProviders>
      </body>
    </html>
  );
}
