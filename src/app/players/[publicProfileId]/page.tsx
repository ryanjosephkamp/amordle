import { RouteHeader } from '@/components/route-states';
import { PublicProfile } from '@/features/community/public-profile';

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ publicProfileId: string }>;
}) {
  const { publicProfileId } = await params;
  return (
    <div className="route-frame is-narrow">
      <RouteHeader title="Player profile" />
      <PublicProfile publicProfileId={publicProfileId} />
    </div>
  );
}
