export default function DashboardPage() {
  return (
    <section className="grid gap-6">
      <header>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-oliveMuted-600">
          Operational overview for Mubende Country Resort. Sections will populate as features land
          in subsequent phases.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["Today's bookings", "Pending payments", "Contact submissions"].map((title) => (
          <article key={title} className="surface-card p-5">
            <p className="text-[11px] uppercase tracking-[0.22em] text-oliveMuted-500">{title}</p>
            <p className="mt-3 text-2xl font-semibold">—</p>
            <p className="mt-1 text-xs text-oliveMuted-600">Wire-up pending.</p>
          </article>
        ))}
      </div>
    </section>
  );
}
