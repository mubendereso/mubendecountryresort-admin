import { redirect } from "next/navigation";
import { signInWithPasswordAction } from "@/lib/auth/actions";
import { sanitizeNextPath } from "@/lib/auth/utils";
import { getCurrentAdminSession } from "@/lib/auth/session";

function getFirstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(getFirstValue(params.next));
  const message = getFirstValue(params.message) ?? null;

  const session = await getCurrentAdminSession();

  if (session) {
    redirect(nextPath);
  }

  return (
    <main className="min-h-screen bg-canvas-light px-4 py-10 text-[#2a241a]">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="hidden rounded-[36px] border border-stoneWarm-200 bg-gradient-to-br from-stoneWarm-100 to-canvas-light p-10 shadow-panel lg:block">
          <p className="text-[11px] uppercase tracking-[0.28em] text-oliveMuted-500">
            Mubende Country Resort
          </p>
          <p className="mt-2 text-sm text-oliveMuted-600">Admin</p>
          <h1 className="mt-6 text-4xl font-semibold leading-tight">
            Sign in with your password.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-7 text-oliveMuted-600">
            Use the staff email and password provisioned for the Neon-backed admin. Access stays
            limited to approved team members.
          </p>
        </section>

        <section className="surface-card my-auto rounded-[36px] px-6 py-7 sm:px-8 sm:py-9">
          <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">Sign in</p>
          <h2 className="mt-2 text-3xl font-semibold">Enter staff credentials</h2>
          <p className="mt-3 text-sm leading-6 text-oliveMuted-600">
            Use the same email and password set up for staff access.
          </p>

          {message ? (
            <div className="mt-5 rounded-2xl border border-stoneWarm-200 bg-canvas-light px-4 py-3 text-sm leading-6 text-oliveMuted-600">
              {message}
            </div>
          ) : null}

          <form action={signInWithPasswordAction} className="mt-6 grid gap-4">
            <input type="hidden" name="next" value={nextPath} />
            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-semibold">
                Staff email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                required
                placeholder="name@company.com"
                className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="text-sm font-semibold">
                Password
              </label>
              <input
                id="password"
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                className="rounded-2xl border border-stoneWarm-200 bg-white px-4 py-3 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-2xl bg-oliveMuted-600 px-4 py-3 text-sm font-semibold text-canvas-light transition hover:bg-oliveMuted-500"
            >
              Sign in
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
