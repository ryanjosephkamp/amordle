import { RouteHeader } from '@/components/route-states';
import { AdminDashboard } from '@/features/support/admin-dashboard';

export default function AdminPage() {
  return (
    <div className="route-frame">
      <RouteHeader title="Admin">
        <p>Role-first operator status and bounded word-authority freshness checks.</p>
      </RouteHeader>
      <AdminDashboard />
    </div>
  );
}
