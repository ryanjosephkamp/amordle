import { NextResponse } from 'next/server';
import { readPackagedManifest } from '@/server/word-authority';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const manifest = await readPackagedManifest();
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
