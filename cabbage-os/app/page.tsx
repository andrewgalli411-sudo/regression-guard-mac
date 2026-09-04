import Link from "next/link";
import FleetMap from "@/components/FleetMap";
import MoneyLeaks from "@/components/MoneyLeaks";
import PeriodTabs, { readDays } from "@/components/PeriodTabs";
import TimeSeries from "@/components/TimeSeries";
import { Card, CardLink, Money, PageHeader, StatTile, StatusPill } from "@/components/ui";
import { dailySeries, fleetPL, moneyLeaks, totals, windowOf } from "@/lib/pnl";
import { getFleet } from "@/lib/seed";

export const dynamic = "force-dynamic";

const COST_SLICES = [
  { key: "fixed", label: "Notes + insurance", color: "#d55181" },
  { key: "energy", label: "Charging", color: "#c98500" },
  { key: "maintenance", label: "Maintenance + damage", color: "#3987e5" },
] as const;

export default async function CommandCenter({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = readDays((await searchParams).days);
  const fleet = getFleet();
  const w = windowOf(fleet, days);
  const rows = fleetPL(fleet, w);
  const t = totals(rows);
  const series = dailySeries(fleet, w);
  const leaks = moneyLeaks(fleet, rows, w);

  const prior = windowOf(fleet, days);
  prior.to = new Date(w.from);
  prior.from = new Date(w.from.getTime() - days * 86_400_000);
  const priorNet = totals(fleetPL(fleet, prior)).net;
  const deltaPct = priorNet !== 0 ? ((t.net - priorNet) / Math.abs(priorNet)) * 100 : 0;

  const earning = fleet.vehicles.filter((v) => v.status === "earning").length;
  const shop = fleet.vehicles.filter((v) => v.status === "shop").length;
  const idle = fleet.vehicles.filter((v) => v.status === "idle").length;

  const worst = [...rows].sort((a, b) => a.net - b.net).slice(0, 5);

  const todayKey = new Date(fleet.generatedAt).toISOString().slice(0, 10);
  const todayTrips = fleet.trips.filter((t) => t.startedAt.slice(0, 10) === todayKey);
  const todayGross = todayTrips.reduce((s, t) => s + t.gross, 0);
  const todayMiles = todayTrips.reduce((s, t) => s + t.miles, 0);
  const byCarToday = todayTrips.reduce((m, t) => {
    m.set(t.vehicleId, (m.get(t.vehicleId) ?? 0) + t.gross);
    return m;
  }, new Map<string, number>());
  const top = [...byCarToday.entries()].sort((a, b) => b[1] - a[1])[0];
  const bestToday = top
    ? {
        id: top[0],
        fares: new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(top[1]),
      }
    : null;
  const costTotal = t.fixed + t.energy + t.maintenance;

  return (
    <>
      <PageHeader
        title="Command Center"
        subtitle={`What the fleet actually cleared over the last ${days} days — after commission, energy, and the note.`}
        right={<PeriodTabs days={days} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          hero
          label={`Net profit · ${days}d`}
          value={new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(t.net)}
          tone={t.net >= 0 ? "good" : "bad"}
          sub={
            <span>
              <span className={deltaPct >= 0 ? "text-state-good" : "text-state-bad"}>
                {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}%
              </span>{" "}
              <span className="text-ink-mute">vs prior {days} days</span>
            </span>
          }
        />
        <StatTile
          label="Owner revenue"
          value={new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(t.revenue)}
          sub={
            <span className="text-ink-mute">
              from <Money value={t.grossFares} /> in fares · <Money value={t.commission} /> to
              platforms
            </span>
          }
        />
        <StatTile
          label="Operating cost"
          value={new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(t.cost)}
          sub={
            <span className="text-ink-mute">
              <Money value={t.fixed} /> fixed · <Money value={t.energy} /> energy ·{" "}
              <Money value={t.maintenance} /> repairs
            </span>
          }
        />
        <StatTile
          label="Fleet right now"
          value={`${earning} earning`}
          sub={
            <span className="text-ink-mute">
              {idle} idle · {shop} in shop ·{" "}
              <span className={t.underwater ? "text-state-bad" : "text-state-good"}>
                {t.underwater} underwater
              </span>
            </span>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <Card
          title="Revenue vs cost"
          subtitle="Owner-booked revenue against everything it costs to keep the cars on the road"
          className="xl:col-span-2"
          action={<CardLink href="/vehicles">Per-vehicle P&amp;L</CardLink>}
        >
          <div className="px-4 pb-4 pt-3">
            <TimeSeries data={series} height={430} />
          </div>
        </Card>

        <Card
          title="Money leaks"
          subtitle="Ranked by what it is costing you"
          action={<span className="text-2xs text-ink-mute">{leaks.length} found</span>}
        >
          <MoneyLeaks leaks={leaks} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <Card title="Where the money goes" subtitle={`${days}-day operating cost`}>
          <div className="px-5 py-5">
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
              {COST_SLICES.map((s) => (
                <span
                  key={s.key}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${((t[s.key] as number) / costTotal) * 100}%`,
                    background: s.color,
                  }}
                />
              ))}
            </div>
            <ul className="mt-4 space-y-3">
              {COST_SLICES.map((s) => (
                <li key={s.key} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-ink-soft">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    {s.label}
                  </span>
                  <span className="text-right">
                    <Money value={t[s.key] as number} className="text-ink" />
                    <span className="num ml-2 text-2xs text-ink-mute">
                      {Math.round(((t[s.key] as number) / costTotal) * 100)}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-ink-mute">
              Fixed costs run whether a car moves or not. Every day a vehicle sits in the shop
              costs <Money value={(t.fixed / days / fleet.vehicles.length) * 1} /> before anyone
              turns a key.
            </p>
          </div>
        </Card>

        <Card
          title="Worst five"
          subtitle={`Lowest net over ${days} days`}
          className="xl:col-span-2"
          action={<CardLink href="/vehicles?filter=underwater">Open the full table</CardLink>}
        >
          <table className="w-full text-sm">
            <tbody>
              {worst.map((r) => (
                <tr key={r.vehicle.id} className="border-b border-line/60 last:border-0">
                  <td className="py-3 pl-5 pr-3">
                    <Link href={`/vehicles/${r.vehicle.id}`} className="group">
                      <span className="num block font-medium text-ink group-hover:text-brand">
                        {r.vehicle.id}
                      </span>
                      <span className="block text-2xs text-ink-mute">
                        {r.vehicle.nickname} · {r.vehicle.year} {r.vehicle.model}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={r.vehicle.status} />
                  </td>
                  <td className="px-3 py-3 text-right text-ink-soft">
                    <span className="num">{r.trips}</span>
                    <span className="block text-2xs text-ink-mute">trips</span>
                  </td>
                  <td className="px-3 py-3 text-right text-ink-soft">
                    <Money value={r.revenue} />
                    <span className="block text-2xs text-ink-mute">revenue</span>
                  </td>
                  <td className="px-3 py-3 text-right text-ink-soft">
                    <Money value={r.totalCost} />
                    <span className="block text-2xs text-ink-mute">cost</span>
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right">
                    <Money
                      value={r.net}
                      className={`font-semibold ${
                        r.net >= 0 ? "text-state-good" : "text-state-bad"
                      }`}
                    />
                    <span className="block text-2xs text-ink-mute">net</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card
          title="Live map"
          subtitle="Where the fleet is right now"
          className="xl:col-span-2"
          action={<CardLink href="/map">Full map</CardLink>}
        >
          <div className="px-4 pb-4 pt-4">
            <FleetMap vehicles={fleet.vehicles} drivers={fleet.drivers} height={430} />
          </div>
        </Card>

        <Card title="Today so far" subtitle="Since midnight, updating as trips close">
          <div className="space-y-4 px-5 py-5">
            <div>
              <p className="text-2xs uppercase tracking-[0.11em] text-ink-mute">Fares booked</p>
              <p className="num mt-1 text-3xl font-semibold text-ink">
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: 0,
                }).format(todayGross)}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                <span className="num">{todayTrips.length}</span> trips ·{" "}
                <span className="num">{Math.round(todayMiles).toLocaleString()}</span> miles ·{" "}
                <span className="num">{earning}</span> cars out
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <p className="text-2xs uppercase tracking-[0.11em] text-ink-mute">Best car</p>
                <p className="num mt-1 text-sm font-medium text-ink">{bestToday?.id ?? "—"}</p>
                <p className="num text-2xs text-ink-mute">
                  {bestToday ? `${bestToday.fares} in fares` : "no trips yet"}
                </p>
              </div>
              <div>
                <p className="text-2xs uppercase tracking-[0.11em] text-ink-mute">Avg fare</p>
                <p className="num mt-1 text-sm font-medium text-ink">
                  {todayTrips.length
                    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                        todayGross / todayTrips.length,
                      )
                    : "—"}
                </p>
                <p className="text-2xs text-ink-mute">across all platforms</p>
              </div>
            </div>
            <div className="rounded-lg border border-state-warn/25 bg-state-warn/[0.08] px-3 py-2.5">
              <p className="text-xs font-medium text-state-warn">Airport surge 4–7 PM</p>
              <p className="mt-1 text-2xs leading-relaxed text-ink-soft">
                Historically 1.6× fares out of the airport zone. Right now{" "}
                <span className="num">{fleet.vehicles.filter((v) => v.status === "idle").length}</span>{" "}
                cars are idle and could be repositioned.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
