import FleetMap from "@/components/FleetMap";
import { Card, Money, PageHeader, StatusPill } from "@/components/ui";
import { fleetPL, windowOf } from "@/lib/pnl";
import { getFleet } from "@/lib/seed";
import type { VehicleStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORDER: VehicleStatus[] = ["earning", "charging", "idle", "shop"];

export default function MapPage() {
  const fleet = getFleet();
  const w = windowOf(fleet, 7);
  const rows = fleetPL(fleet, w);
  const byId = new Map(rows.map((r) => [r.vehicle.id, r]));

  return (
    <>
      <PageHeader
        title="Live Map"
        subtitle="Positions update as trips come in. Click a pin to jump to that vehicle's P&L."
        right={
          <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-state-good" aria-hidden />
            All platforms syncing
          </span>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-3">
          <div className="p-4">
            <FleetMap vehicles={fleet.vehicles} drivers={fleet.drivers} height={560} />
          </div>
        </Card>

        <Card title="Fleet status" subtitle="7-day net beside each car">
          <div className="max-h-[620px] overflow-y-auto">
            {ORDER.map((status) => {
              const group = fleet.vehicles.filter((v) => v.status === status);
              if (!group.length) return null;
              return (
                <div key={status}>
                  <p className="sticky top-0 border-y border-line bg-raised px-4 py-1.5 text-2xs uppercase tracking-[0.1em] text-ink-mute">
                    {status === "shop" ? "In shop" : status} · {group.length}
                  </p>
                  <ul className="divide-y divide-line/60">
                    {group.map((v) => {
                      const pl = byId.get(v.id)!;
                      return (
                        <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="min-w-0">
                            <a
                              href={`/vehicles/${v.id}`}
                              className="num block text-sm text-ink hover:text-brand"
                            >
                              {v.id}
                            </a>
                            <span className="block truncate text-2xs text-ink-mute">
                              {v.nickname} · <span className="num">{v.batteryPct}%</span> battery
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <Money
                              value={pl.net}
                              className={`text-sm ${pl.net >= 0 ? "text-state-good" : "text-state-bad"}`}
                            />
                            <span className="mt-1 block">
                              <StatusPill status={v.status} />
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
