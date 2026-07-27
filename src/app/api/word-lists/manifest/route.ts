import { NextResponse } from 'next/server';
import { readPublishedManifest } from '@/server/word-publication';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const manifest = await readPublishedManifest();
    return NextResponse.json(
      { manifest },
      {
        headers: {
          'Cache-Control': manifest
            ? 'public, max-age=60, stale-while-revalidate=300'
            : 'public, max-age=15',
        },
      },
    );
  } catch {
    return NextResponse.json({ manifest: null }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
