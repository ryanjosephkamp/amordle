import { NextResponse } from 'next/server';
import { getCronSecret } from '@/server/config';
import { sweepExpiredCorrespondence } from '@/server/correspondence';
import { checkWordFreshness } from '@/server/word-authority';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const secret = getCronSecret();
  const authorization = request.headers.get('authorization');
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  /*
   * v8-D. Two jobs on one schedule.
   *
   * The correspondence sweep needs somewhere to run daily, and this route already has
   * the schedule, the secret and the tests. Giving it a route of its own would mean
   * changing the sanctioned HTTP interface list, which is a governance rule worth more
   * than the tidiness of a second endpoint.
   *
   * They are settled independently: a word-list source being down must not stop games
   * from resolving, and a sweep that cannot run must not report the word lists as
   * unavailable.
   */
  const correspondence = await sweepExpiredCorrespondence().catch(() => ({
    ran: false,
    examined: 0,
    settled: 0,
    rated: 0,
    reaped: 0,
    reason: 'sweep_threw',
  }));
  try {
    return NextResponse.json({ ...(await checkWordFreshness()), correspondence });
  } catch {
    return NextResponse.json(
      { error: 'word_freshness_unavailable', correspondence },
      { status: 502 },
    );
  }
}
