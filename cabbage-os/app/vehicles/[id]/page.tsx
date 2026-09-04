import Link from "next/link";
import { notFound } from "next/navigation";
import PeriodTabs, { readDays } from "@/components/PeriodTabs";
import TimeSeries from "@/components/TimeSeries";
import { Card, Money, StatTile, StatusPill } from "@/components/ui";
import { dailySeries, platformLabel, platformMix, vehiclePL, windowOf } from "@/lib/pnl";
import { getFleet } from "@/lib/seed";

export const dynamic = "force-dynamic";

const dt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });

export default async function VehicleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { id } = await params;
  const days = readDays((await searchParams).days);
  const fleet = getFleet();
  const vehicle = fleet.vehicles.find((v) => v.id === id);
  if (!vehicle) notFound();

  const w = windowOf(fleet, days);
  const pl = vehiclePL(fleet, vehicle, w);
  const series = dailySeries(fleet, w, vehicle.id);
  const driver = fleet.drivers.find((d) => d.id === vehicle.driverId);
  const mix = platformMix(fleet, vehicle.id, w);

  const from = w.from.getTime();
  const trips = fleet.trips
    .filter((t) => t.vehicleId === vehicle.id && Date.parse(t.startedAt) >= from)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 12);
  const charges = fleet.charges
    .filter((c) => c.vehicleId === vehicle.id && Date.parse(c.startedAt) >= from)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, 8);
  const costs = fleet.costs
    .filter(
      (c) =>
        c.vehicleId === vehicle.id &&
        Date.parse(c.date) >= from &&
        c.category !== "finance" &&
        c.category !== "insurance",
    )
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  const lines: { label: string; value: number; note?: string }[] = [
    {
      label:
        vehicle.revenueModel === "rental"
          ? `Rental income · ${pl.activeDays} days on rent`
          : `Owner split · ${Math.round(vehicle.ownerSplit * 100)}% of net fare`,
      value: pl.revenue,
      note:
        vehicle.revenueModel === "rental"
          ? `$${vehicle.weeklyRentalRate}/week`
          : `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pl.netFare)} net fare after commission`,
    },
    { label: "Charging billed to owner", value: -pl.energy },
    { label: "Maintenance, tires, damage", value: -pl.maintenance },
    { label: "Cleaning", value: -pl.cleaning },
    { label: "Tolls and misc.", value: -pl.other },
    {
      label: `Insurance + note · ${days} days prorated`,
      value: -pl.fixed,
      note: `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(vehicle.financeMonthly + vehicle.insuranceMonthly)}/month`,
    },
  ];

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/vehicles" className="text-xs text-ink-mute hover:text-brand">
            ← All vehicles
          </Link>
          <h1 className="num mt-1 flex items-center gap-3 text-2xl font-semibold tracking-tight text-ink">
            {vehicle.id}
            <StatusPill status={vehicle.status} />
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {vehicle.nickname} · {vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.plate} ·{" "}
            <span className="num">{vehicle.odometer.toLocaleString()}</span> mi
          </p>
        </div>
        <PeriodTabs days={days} base={`/vehicles/${vehicle.id}`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          hero
          label={`Net · ${days}d`}
          value={`${pl.net < 0 ? "−" : ""}${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.abs(pl.net))}`}
          tone={pl.net >= 0 ? "good" : "bad"}
          sub={
            <span className="text-ink-mute">
              <span className="num">{Math.round(pl.margin * 100)}%</span> margin ·{" "}
              <span className="num">${pl.netPerMile.toFixed(2)}</span>/mi
            </span>
          }
        />
        <StatTile
          label="Owner revenue"
          value={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pl.revenue)}
          sub={
            <span className="text-ink-mute">
              {vehicle.revenueModel === "rental" ? "Flat weekly rental" : "Share of net fare"}
            </span>
          }
        />
        <StatTile
          label="Cost to run"
          value={new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(pl.totalCost)}
          sub={
            <span className="text-ink-mute">
              <Money value={pl.fixed} /> of it is fixed
            </span>
          }
        />
        <StatTile
          label="Utilization"
          value={`${pl.activeDays}/${days} days`}
          sub={
            <span className="text-ink-mute">
              <span className="num">{pl.trips}</span> trips ·{" "}
              <span className="num">{Math.round(pl.miles).toLocaleString()}</span> mi
            </span>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <Card
          title="Earnings vs cost"
          subtitle="Daily, for this vehicle only"
          className="xl:col-span-2"
        >
          <div className="px-4 pb-4 pt-3">
            <TimeSeries data={series} height={318} />
          </div>
        </Card>

        <Card title="P&L breakdown" subtitle={`${days} days · adds up to the net above`}>
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.label} className="flex items-start justify-between gap-4 px-5 py-3">
                <span>
                  <span className="block text-sm text-ink-soft">{l.label}</span>
                  {l.note && <span className="block text-2xs text-ink-mute">{l.note}</span>}
                </span>
                <Money
                  value={l.value}
                  className={`whitespace-nowrap ${l.value >= 0 ? "text-ink" : "text-ink-soft"}`}
                />
              </li>
            ))}
            <li className="flex items-center justify-between gap-4 bg-raised/60 px-5 py-3.5">
              <span className="text-sm font-medium text-ink">Net</span>
              <Money
                value={pl.net}
                className={`text-base font-semibold ${
                  pl.net >= 0 ? "text-state-good" : "text-state-bad"
                }`}
              />
            </li>
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Assignment">
          <div className="space-y-3 px-5 py-4 text-sm">
            {driver ? (
              <>
                <Field k="Driver" v={driver.name} />
                <Field k="Phone" v={driver.phone} />
                <Field k="Rating" v={driver.rating.toFixed(2)} />
                <Field
                  k="Since"
                  v={new Date(driver.startedAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                />
                {driver.balanceOwed > 0 && (
                  <p className="rounded-lg border border-state-bad/30 bg-state-bad/10 px-3 py-2 text-xs text-state-bad">
                    Owes{" "}
                    <span className="num font-medium">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(driver.balanceOwed)}
                    </span>{" "}
                    in back rental
                  </p>
                )}
              </>
            ) : (
              <p className="rounded-lg border border-state-warn/30 bg-state-warn/10 px-3 py-2 text-xs text-state-warn">
                No driver assigned. This car has cost <Money value={pl.fixed} /> in insurance and
                note payments over {days} days with nothing against it.
              </p>
            )}
            <div className="border-t border-line pt-3">
              <p className="mb-2 text-2xs uppercase tracking-[0.11em] text-ink-mute">
                Platform mix
              </p>
              {mix.length ? (
                mix.map((m) => (
                  <div key={m.platform} className="mb-2 last:mb-0">
                    <div className="flex justify-between text-xs text-ink-soft">
                      <span>{platformLabel(m.platform)}</span>
                      <span className="num">{Math.round(m.share * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${m.share * 100}%`, background: "var(--series-revenue)" }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-ink-mute">No trips in this window.</p>
              )}
            </div>
          </div>
        </Card>

        <Card title="Recent trips" subtitle={`${pl.trips} in the last ${days} days`}>
          <div className="max-h-[340px] overflow-y-auto">
            <table className="w-full text-xs">
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id} className="border-b border-line/60 last:border-0">
                    <td className="py-2.5 pl-5 pr-2 text-ink-soft">{dt(t.startedAt)}</td>
                    <td className="px-2 py-2.5 text-ink-mute">{platformLabel(t.platform)}</td>
                    <td className="num px-2 py-2.5 text-right text-ink-mute">
                      {t.miles.toFixed(1)} mi
                    </td>
                    <td className="num py-2.5 pl-2 pr-5 text-right text-ink">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(t.gross)}
                    </td>
                  </tr>
                ))}
                {!trips.length && (
                  <tr>
                    <td className="px-5 py-6 text-center text-ink-mute">No trips recorded.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Charging & repairs">
          <div className="max-h-[340px] overflow-y-auto">
            <ul className="divide-y divide-line text-xs">
              {costs.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <span>
                    <span className="block capitalize text-ink-soft">{c.category}</span>
                    <span className="block text-2xs text-ink-mute">
                      {c.note} · {dt(c.date).split(",")[0]}
                    </span>
                  </span>
                  <Money value={-c.amount} className="shrink-0 text-ink" />
                </li>
              ))}
              {charges.map((c) => (
                <li key={c.id} className="flex items-start justify-between gap-3 px-5 py-2.5">
                  <span>
                    <span className="block text-ink-soft">
                      {c.location === "depot"
                        ? "Depot charge"
                        : c.location === "supercharger"
                          ? "Supercharger"
                          : "Public L2"}
                    </span>
                    <span className="num block text-2xs text-ink-mute">
                      {c.kwh.toFixed(0)} kWh @ ${c.costPerKwh.toFixed(2)}/kWh ·{" "}
                      {dt(c.startedAt).split(",")[0]}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <Money
                      value={c.billedToOwner ? -c.cost : c.cost}
                      className={c.billedToOwner ? "text-ink" : "text-ink-mute"}
                    />
                    {!c.billedToOwner && (
                      <span className="block text-2xs text-ink-mute">driver paid</span>
                    )}
                  </span>
                </li>
              ))}
              {!costs.length && !charges.length && (
                <li className="px-5 py-6 text-center text-ink-mute">Nothing booked.</li>
              )}
            </ul>
          </div>
        </Card>
      </div>
    </>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-mute">{k}</span>
      <span className="num text-ink">{v}</span>
    </div>
  );
}
