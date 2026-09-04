import Link from "next/link";
import PeriodTabs, { readDays } from "@/components/PeriodTabs";
import { Card, Money, PageHeader, StatTile } from "@/components/ui";
import { windowOf } from "@/lib/pnl";
import { getFleet } from "@/lib/seed";
import type { ChargeLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

const LOC: Record<ChargeLocation, { label: string; color: string; note: string }> = {
  depot: { label: "Depot (home rate)", color: "var(--series-home)", note: "overnight, off-peak" },
  supercharger: { label: "Supercharger", color: "var(--series-super)", note: "fast, most expensive" },
  public_l2: { label: "Public L2", color: "var(--text-muted)", note: "curbside and garages" },
};

const usd = (n: number, d = 0) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(n);

export default async function ChargingPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = readDays((await searchParams).days);
  const fleet = getFleet();
  const w = windowOf(fleet, days);
  const from = w.from.getTime();

  const sessions = fleet.charges.filter((c) => Date.parse(c.startedAt) >= from);
  const owned = sessions.filter((c) => c.billedToOwner);

  const group = (loc: ChargeLocation) => {
    const list = owned.filter((c) => c.location === loc);
    const kwh = list.reduce((s, c) => s + c.kwh, 0);
    const cost = list.reduce((s, c) => s + c.cost, 0);
    return { loc, list, kwh, cost, rate: kwh ? cost / kwh : 0 };
  };

  const groups = (Object.keys(LOC) as ChargeLocation[]).map(group);
  const totalCost = groups.reduce((s, g) => s + g.cost, 0) || 1;
  const totalKwh = groups.reduce((s, g) => s + g.kwh, 0);
  const depotRate = groups.find((g) => g.loc === "depot")!.rate || 0.13;
  const offDepot = groups.filter((g) => g.loc !== "depot");
  const offKwh = offDepot.reduce((s, g) => s + g.kwh, 0);
  const offCost = offDepot.reduce((s, g) => s + g.cost, 0);
  const savings = offCost - offKwh * depotRate;

  const worst = [...owned].sort((a, b) => b.cost - a.cost).slice(0, 10);

  const byVehicle = [...owned.reduce((m, c) => {
    const cur = m.get(c.vehicleId) ?? { cost: 0, kwh: 0, off: 0 };
    cur.cost += c.cost;
    cur.kwh += c.kwh;
    if (c.location !== "depot") cur.off += c.cost;
    m.set(c.vehicleId, cur);
    return m;
  }, new Map<string, { cost: number; kwh: number; off: number }>())]
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="Charging"
        subtitle="Energy is the second-largest line after the note. This is where it is going."
        right={<PeriodTabs days={days} base="/charging" />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={`Energy cost · ${days}d`}
          value={usd(totalCost)}
          sub={<span className="text-ink-mute"><span className="num">{Math.round(totalKwh).toLocaleString()}</span> kWh across <span className="num">{owned.length}</span> sessions</span>}
        />
        <StatTile
          label="Blended rate"
          value={`$${(totalCost / (totalKwh || 1)).toFixed(3)}/kWh`}
          sub={<span className="text-ink-mute">depot is ${depotRate.toFixed(3)}</span>}
        />
        <StatTile
          hero
          label="Recoverable"
          value={usd(savings)}
          tone="bad"
          sub={<span className="text-ink-mute">if off-depot kWh charged at the depot rate</span>}
        />
        <StatTile
          label="Driver-paid sessions"
          value={`${sessions.length - owned.length}`}
          sub={<span className="text-ink-mute">rental vehicles — not your cost</span>}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Cost by location" subtitle={`${days}-day owner-billed energy`}>
          <div className="px-5 py-5">
            <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
              {groups.map((g) => (
                <span
                  key={g.loc}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{ width: `${(g.cost / totalCost) * 100}%`, background: LOC[g.loc].color }}
                />
              ))}
            </div>
            <ul className="mt-4 space-y-3.5">
              {groups.map((g) => (
                <li key={g.loc}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-ink-soft">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: LOC[g.loc].color }} aria-hidden />
                      {LOC[g.loc].label}
                    </span>
                    <Money value={g.cost} className="text-ink" />
                  </div>
                  <div className="mt-0.5 flex justify-between pl-[18px] text-2xs text-ink-mute">
                    <span>{LOC[g.loc].note}</span>
                    <span className="num">
                      {Math.round(g.kwh).toLocaleString()} kWh @ ${g.rate.toFixed(3)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-5 rounded-lg border border-state-warn/25 bg-state-warn/[0.08] px-3 py-2.5 text-xs leading-relaxed text-ink-soft">
              Superchargers cost{" "}
              <span className="num font-medium text-state-warn">
                {(groups.find((g) => g.loc === "supercharger")!.rate / depotRate).toFixed(1)}×
              </span>{" "}
              the depot rate. Shifting half of that volume to overnight depot charging is{" "}
              <Money value={savings / 2} className="font-medium text-state-warn" /> over {days} days
              — <Money value={(savings / 2) * (365 / days)} className="font-medium text-state-warn" /> annualized.
            </p>
          </div>
        </Card>

        <Card title="Heaviest chargers" subtitle="Owner-billed energy by vehicle" className="xl:col-span-2">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-2xs uppercase tracking-[0.08em] text-ink-mute">
              <tr>
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Vehicle</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">kWh</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Cost</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Off-depot</th>
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Share off-depot</th>
              </tr>
            </thead>
            <tbody>
              {byVehicle.map(([id, v]) => (
                <tr key={id} className="border-b border-line/60 last:border-0 hover:bg-raised/60">
                  <td className="px-5 py-3">
                    <Link href={`/vehicles/${id}`} className="num text-ink hover:text-brand">
                      {id}
                    </Link>
                  </td>
                  <td className="num px-3 py-3 text-right text-ink-soft">{Math.round(v.kwh)}</td>
                  <td className="num px-3 py-3 text-right text-ink">{usd(v.cost)}</td>
                  <td className="num px-3 py-3 text-right text-state-warn">{usd(v.off)}</td>
                  <td className="px-5 py-3">
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-line">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(v.off / (v.cost || 1)) * 100}%`,
                          background: "var(--series-super)",
                        }}
                      />
                    </span>
                    <span className="num mt-1 block text-2xs text-ink-mute">
                      {Math.round((v.off / (v.cost || 1)) * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Most expensive sessions" subtitle={`Last ${days} days` } className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-2xs uppercase tracking-[0.08em] text-ink-mute">
              <tr>
                <th scope="col" className="px-5 py-2.5 text-left font-medium">When</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Vehicle</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Location</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">kWh</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">$/kWh</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Minutes</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {worst.map((c) => (
                <tr key={c.id} className="border-b border-line/60 last:border-0 hover:bg-raised/60">
                  <td className="px-5 py-2.5 text-ink-soft">
                    {new Date(c.startedAt).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      timeZone: "UTC",
                    })}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/vehicles/${c.vehicleId}`} className="num text-ink hover:text-brand">
                      {c.vehicleId}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 text-ink-soft">
                      <span className="h-2 w-2 rounded-sm" style={{ background: LOC[c.location].color }} aria-hidden />
                      {LOC[c.location].label}
                    </span>
                  </td>
                  <td className="num px-3 py-2.5 text-right text-ink-soft">{c.kwh.toFixed(0)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-soft">${c.costPerKwh.toFixed(3)}</td>
                  <td className="num px-3 py-2.5 text-right text-ink-mute">{c.minutes}</td>
                  <td className="num px-5 py-2.5 text-right text-ink">{usd(c.cost, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
