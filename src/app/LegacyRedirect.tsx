import { Navigate, useLocation, useParams } from 'react-router';

export function LegacyRedirect({ to, profile = false }: { to: string; profile?: boolean }) {
  const location = useLocation();
  const { publicProfileId } = useParams();
  const pathname = profile ? `/players/${encodeURIComponent(publicProfileId ?? '')}` : to;
  return <Navigate to={{ pathname, search: location.search, hash: location.hash }} replace />;
}
