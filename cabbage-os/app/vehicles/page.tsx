import PLTable from "@/components/PLTable";
import PeriodTabs, { readDays } from "@/components/PeriodTabs";
import { Card, PageHeader } from "@/components/ui";
import { fleetPL, totals, windowOf } from "@/lib/pnl";
import { getFleet } from "@/lib/seed";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "underwater", "rental", "split", "unassigned"] as const;
type Filter = (typeof FILTERS)[number];

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; filter?: string }>;
}) {
  const sp = await searchParams;
  const days = readDays(sp.days);
  const raw = sp.filter as Filter | undefined;
  const filter: Filter = raw && FILTERS.includes(raw) ? raw : "all";

  const fleet = getFleet();
  const w = windowOf(fleet, days);
  const rows = fleetPL(fleet, w);
  const t = totals(rows);

  return (
    <>
      <PageHeader
        title="Per-vehicle P&L"
        subtitle="Every car, what it brought in, what it cost, and what is left. Sort by net and start at the bottom."
        right={<PeriodTabs days={days} base="/vehicles" />}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Summary label="Fleet net" value={t.net} tone={t.net >= 0 ? "good" : "bad"} />
        <Summary label="Owner revenue" value={t.revenue} />
        <Summary label="Operating cost" value={t.cost} />
      </div>

      <Card>
        <PLTable rows={rows} drivers={fleet.drivers} initialFilter={filter} days={days} />
      </Card>

      <p className="mt-4 text-xs leading-relaxed text-ink-mute">
        Net = owner revenue − charging billed to the owner − maintenance and damage − cleaning and
        tolls − insurance and note, prorated across the window. On flat-rental vehicles the driver
        pays for energy, which is why that column reads <em>driver</em>.
      </p>
    </>
  );
}

function Summary({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "bad";
}) {
  const text =
    tone === "good" ? "text-state-good" : tone === "bad" ? "text-state-bad" : "text-ink";
  return (
    <div className="rounded-2xl border border-line px-5 py-4" style={{ background: "var(--surface-1)" }}>
      <p className="text-2xs uppercase tracking-[0.11em] text-ink-mute">{label}</p>
      <p className={`num mt-1.5 text-2xl font-semibold ${text}`}>
        {value < 0 ? "−" : ""}
        {new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(Math.abs(value))}
      </p>
    </div>
  );
}
