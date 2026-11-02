import { NextResponse } from 'next/server';
import { authenticateBearer } from '@/server/auth';
import { checkWordFreshness } from '@/server/word-authority';

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
    return NextResponse.json(await checkWordFreshness());
  } catch {
    return NextResponse.json({ error: 'word_freshness_unavailable' }, { status: 502 });
  }
}
