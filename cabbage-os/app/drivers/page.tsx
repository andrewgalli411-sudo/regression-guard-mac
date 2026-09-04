import Link from "next/link";
import PeriodTabs, { readDays } from "@/components/PeriodTabs";
import { Card, Money, PageHeader, StatTile } from "@/components/ui";
import { vehiclePL, windowOf } from "@/lib/pnl";
import { getFleet } from "@/lib/seed";

export const dynamic = "force-dynamic";

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

export default async function DriversPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const days = readDays((await searchParams).days);
  const fleet = getFleet();
  const w = windowOf(fleet, days);

  const rows = fleet.drivers
    .map((d) => {
      const vehicle = fleet.vehicles.find((v) => v.id === d.vehicleId) ?? null;
      const pl = vehicle ? vehiclePL(fleet, vehicle, w) : null;
      return { driver: d, vehicle, pl };
    })
    .sort((a, b) => (b.pl?.revenue ?? -1) - (a.pl?.revenue ?? -1));

  const active = rows.filter((r) => r.driver.status === "active").length;
  const owed = fleet.drivers.reduce((s, d) => s + d.balanceOwed, 0);
  const unassignedVehicles = fleet.vehicles.filter((v) => !v.driverId);
  const benched = rows.filter((r) => !r.vehicle);

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle="Who has which car, what it is producing, and who is behind on rental."
        right={<PeriodTabs days={days} base="/drivers" />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Active drivers" value={`${active}`} sub={<span className="text-ink-mute">{benched.length} not driving</span>} />
        <StatTile
          label="Cars without a driver"
          value={`${unassignedVehicles.length}`}
          tone={unassignedVehicles.length ? "bad" : "good"}
          sub={
            <span className="text-ink-mute">
              {unassignedVehicles.map((v) => v.id).join(", ") || "Fully assigned"}
            </span>
          }
        />
        <StatTile
          label="Rental balance owed"
          value={usd(owed)}
          tone={owed > 0 ? "bad" : "good"}
          sub={<span className="text-ink-mute">across {fleet.drivers.filter((d) => d.balanceOwed > 0).length} drivers</span>}
        />
      </div>

      <Card className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="border-b border-line text-2xs uppercase tracking-[0.08em] text-ink-mute">
              <tr>
                <th scope="col" className="px-5 py-2.5 text-left font-medium">Driver</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Vehicle</th>
                <th scope="col" className="px-3 py-2.5 text-left font-medium">Deal</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Trips</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Fares</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">To owner</th>
                <th scope="col" className="px-3 py-2.5 text-right font-medium">Rating</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ driver, vehicle, pl }) => (
                <tr key={driver.id} className="border-b border-line/60 last:border-0 hover:bg-raised/60">
                  <td className="px-5 py-3">
                    <span className="block font-medium text-ink">{driver.name}</span>
                    <span className="num block text-2xs text-ink-mute">
                      {driver.id} · {driver.phone}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {vehicle ? (
                      <Link href={`/vehicles/${vehicle.id}`} className="num text-ink-soft hover:text-brand">
                        {vehicle.id}
                        <span className="block text-2xs text-ink-mute">{vehicle.model}</span>
                      </Link>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-2xs ${
                          driver.status === "onboarding"
                            ? "bg-state-warn/10 text-state-warn ring-1 ring-state-warn/25"
                            : "bg-raised text-ink-mute ring-1 ring-line"
                        }`}
                      >
                        {driver.status === "onboarding" ? "Onboarding" : "Inactive"}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-ink-soft">
                    {vehicle ? (
                      vehicle.revenueModel === "rental" ? (
                        <>
                          Rental
                          <span className="num block text-2xs text-ink-mute">
                            ${vehicle.weeklyRentalRate}/wk
                          </span>
                        </>
                      ) : (
                        <>
                          Split
                          <span className="num block text-2xs text-ink-mute">
                            driver keeps {100 - Math.round(vehicle.ownerSplit * 100)}%
                          </span>
                        </>
                      )
                    ) : (
                      <span className="text-ink-mute">—</span>
                    )}
                  </td>
                  <td className="num px-3 py-3 text-right text-ink-soft">{pl?.trips ?? "—"}</td>
                  <td className="num px-3 py-3 text-right text-ink-soft">
                    {pl ? usd(pl.grossFares) : "—"}
                  </td>
                  <td className="num px-3 py-3 text-right text-ink">
                    {pl ? usd(pl.revenue) : "—"}
                  </td>
                  <td className="num px-3 py-3 text-right text-ink-soft">
                    {driver.rating.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {driver.balanceOwed > 0 ? (
                      <Money value={-driver.balanceOwed} className="font-medium text-state-bad" />
                    ) : (
                      <span className="text-2xs text-ink-mute">clear</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {unassignedVehicles.length > 0 && (
        <div className="mt-4 rounded-2xl border border-state-warn/30 bg-state-warn/[0.07] px-5 py-4">
          <p className="text-sm font-medium text-state-warn">
            {unassignedVehicles.length} car{unassignedVehicles.length > 1 ? "s are" : " is"} sitting
            with no driver
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            {unassignedVehicles.map((v) => `${v.id} (${v.nickname})`).join(", ")} — each one still
            carries its note and insurance. Matching{" "}
            {benched.length ? benched[0].driver.name : "an onboarding driver"} to one of them turns
            a fixed cost back into revenue.
          </p>
        </div>
      )}
    </>
  );
}
