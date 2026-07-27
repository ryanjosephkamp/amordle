import { NextResponse } from 'next/server';
import { getCronSecret } from '@/server/config';
import { publishWordLists } from '@/server/word-publication';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = getCronSecret();
  const authorization = request.headers.get('authorization');
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
