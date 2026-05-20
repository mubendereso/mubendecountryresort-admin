"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeRoleAction, setActiveAction } from "@/lib/users/actions";
import type { AdminRole } from "@/lib/auth/session";
import type { AdminUserRow } from "@/lib/users/data";

const ROLE_STYLE: Record<AdminRole, string> = {
  superadmin: "bg-amber-100 text-amber-800",
  admin: "bg-blue-100 text-blue-800",
  staff: "bg-stoneWarm-100 text-oliveMuted-600"
};

const ALL_ROLES: AdminRole[] = ["staff", "admin", "superadmin"];

function fmtDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-UG", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(iso));
}

function UserCard({
  user,
  isSelf,
  canEdit,
  isPending,
  onRole,
  onActive
}: {
  user: AdminUserRow;
  isSelf: boolean;
  canEdit: boolean;
  isPending: boolean;
  onRole: (role: AdminRole) => void;
  onActive: (active: boolean) => void;
}) {
  return (
    <div
      className={`surface-card grid gap-4 p-5 ${!user.is_active ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${ROLE_STYLE[user.role]}`}
            >
              {user.role}
            </span>
            {!user.is_active && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-red-700">
                Inactive
              </span>
            )}
            {isSelf && (
              <span className="text-xs text-oliveMuted-400">(you)</span>
            )}
          </div>
          <p className="text-sm font-semibold">
            {user.full_name ?? user.email}
          </p>
          {user.full_name && (
            <p className="text-sm text-oliveMuted-600">{user.email}</p>
          )}
        </div>
        <p className="text-xs text-oliveMuted-500">
          Last seen {fmtDate(user.last_signed_in_at)}
        </p>
      </div>

      {canEdit && !isSelf && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stoneWarm-100 pt-3">
          {/* Role selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-oliveMuted-500 mr-1">Role:</span>
            {ALL_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                disabled={isPending || user.role === r}
                onClick={() => onRole(r)}
                className={`rounded-xl px-3 py-1 text-xs font-semibold transition disabled:cursor-default ${
                  user.role === r
                    ? `${ROLE_STYLE[r]} opacity-100`
                    : "border border-stoneWarm-200 bg-white text-oliveMuted-600 hover:bg-stoneWarm-50 disabled:opacity-40"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Activate / Deactivate */}
          <button
            type="button"
            disabled={isPending}
            onClick={() => onActive(!user.is_active)}
            className={`rounded-2xl border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
              user.is_active
                ? "border-stoneWarm-200 bg-white text-red-600 hover:bg-red-50"
                : "border-stoneWarm-200 bg-white text-oliveMuted-600 hover:bg-stoneWarm-100"
            }`}
          >
            {isPending ? "Updating…" : user.is_active ? "Deactivate" : "Reactivate"}
          </button>
        </div>
      )}
    </div>
  );
}

export function UsersClient({
  users: initialUsers,
  currentUserId,
  role
}: {
  users: AdminUserRow[];
  currentUserId: string;
  role: AdminRole;
}) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canEdit = role === "superadmin";

  function handleRole(userId: string, newRole: AdminRole) {
    setError(null);
    setPendingId(userId);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", newRole);

    startTransition(async () => {
      try {
        await changeRoleAction(fd);
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update role.");
      }
      setPendingId(null);
    });
  }

  function handleActive(userId: string, active: boolean) {
    setError(null);
    setPendingId(userId);
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("active", String(active));

    startTransition(async () => {
      try {
        await setActiveAction(fd);
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, is_active: active } : u))
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update status.");
      }
      setPendingId(null);
    });
  }

  return (
    <section className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Users</h1>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </header>

      {!canEdit && (
        <p className="text-sm text-oliveMuted-600">
          You can view the team list. Only superadmins can change roles or deactivate accounts.
        </p>
      )}

      <div className="grid gap-3">
        {users.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            isSelf={user.id === currentUserId}
            canEdit={canEdit}
            isPending={isPending && pendingId === user.id}
            onRole={(r) => handleRole(user.id, r)}
            onActive={(a) => handleActive(user.id, a)}
          />
        ))}
      </div>

      {canEdit && (
        <p className="text-xs text-oliveMuted-500">
          To add a new team member, run{" "}
          <code className="rounded bg-stoneWarm-100 px-1 py-0.5">
            npm run admin:create-user
          </code>{" "}
          locally.
        </p>
      )}
    </section>
  );
}
