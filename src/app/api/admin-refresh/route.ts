import { NextResponse } from 'next/server';
import { authenticateBearer } from '@/server/auth';
import { publishWordLists } from '@/server/word-publication';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const identity = await authenticateBearer(request);
  if (identity.status === 'unavailable') {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 502 });
  }
  if (identity.status === 'unauthorized') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (identity.role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const manifest = await publishWordLists();
    return NextResponse.json({
      revision: manifest.revision,
      publishedAt: manifest.publishedAt,
      objectCount: manifest.entries.length,
    });
  } catch {
    return NextResponse.json({ error: 'refresh_failed' }, { status: 502 });
  }
}
