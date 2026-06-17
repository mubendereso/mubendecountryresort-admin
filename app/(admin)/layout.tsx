import { redirect } from "next/navigation";
import {
  AdminAuthorizationError,
  requireApprovedAdminRole
} from "@/lib/auth/admin-role";
import { buildLoginRedirect } from "@/lib/auth/utils";
import { AdminPushAutoEnrollment } from "@/components/pwa/admin-push-auto-enrollment";
import { AdminOperationsHeader } from "@/components/admin-operations-header";
import { OfflineSnapshotRefresher } from "@/components/offline-snapshot-refresher";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let session: Awaited<ReturnType<typeof requireApprovedAdminRole>>;

  try {
    session = await requireApprovedAdminRole();
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      if (error.status === 401) {
        redirect(buildLoginRedirect("/dashboard", "Please sign in to continue."));
      }

      redirect(buildLoginRedirect(null, error.message));
    }

    throw error;
  }

  return (
    <div className="min-h-screen bg-canvas-light text-[#2a241a]">
      <OfflineSnapshotRefresher />
      <AdminOperationsHeader email={session.email} role={session.role} />
      <main className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        {children}
      </main>
      <AdminPushAutoEnrollment />
    </div>
  );
}
