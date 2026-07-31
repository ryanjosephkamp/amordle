import { NextResponse } from 'next/server';
import { getCronSecret } from '@/server/config';
import { checkWordFreshness } from '@/server/word-authority';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = getCronSecret();
  const authorization = request.headers.get('authorization');
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await checkWordFreshness());
  } catch {
    return NextResponse.json({ error: 'word_freshness_unavailable' }, { status: 502 });
  }
}
