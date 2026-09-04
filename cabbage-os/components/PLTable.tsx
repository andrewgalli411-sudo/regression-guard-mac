"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { VehiclePL } from "@/lib/pnl";
import { StatusPill } from "./ui";

type Key = "id" | "revenue" | "totalCost" | "net" | "netPerMile" | "margin" | "miles" | "trips";
type Filter = "all" | "underwater" | "rental" | "split" | "unassigned";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All vehicles" },
  { key: "underwater", label: "Losing money" },
  { key: "split", label: "Revenue split" },
  { key: "rental", label: "Flat rental" },
  { key: "unassigned", label: "No driver" },
];

const usd0 = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

export default function PLTable({
  rows,
  drivers,
  initialFilter = "all",
  days,
}: {
  rows: VehiclePL[];
  drivers: { id: string; name: string }[];
  initialFilter?: Filter;
  days: number;
}) {
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "net", dir: 1 });
  const [filter, setFilter] = useState<Filter>(initialFilter);

  const driverName = (id: string | null) => drivers.find((d) => d.id === id)?.name ?? "—";
  const maxAbsNet = Math.max(...rows.map((r) => Math.abs(r.net)), 1);

  const view = useMemo(() => {
    const f = rows.filter((r) => {
      if (filter === "underwater") return r.net < 0;
      if (filter === "rental") return r.vehicle.revenueModel === "rental";
      if (filter === "split") return r.vehicle.revenueModel === "split";
      if (filter === "unassigned") return !r.vehicle.driverId;
      return true;
    });
    return [...f].sort((a, b) => {
      if (sort.key === "id") return sort.dir * a.vehicle.id.localeCompare(b.vehicle.id);
      return sort.dir * ((a[sort.key] as number) - (b[sort.key] as number));
    });
  }, [rows, filter, sort]);

  const th = (key: Key, label: string, align: "left" | "right" = "right") => (
    <th
      scope="col"
      className={`whitespace-nowrap px-3 py-2.5 font-medium ${
        align === "left" ? "text-left" : "text-right"
      }`}
    >
      <button
        onClick={() =>
          setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))
        }
        className={`inline-flex items-center gap-1 hover:text-ink ${
          sort.key === key ? "text-ink" : ""
        }`}
      >
        {label}
        <span className="text-2xs text-ink-mute">
          {sort.key === key ? (sort.dir === 1 ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );

  const totalNet = view.reduce((s, r) => s + r.net, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              filter === f.key
                ? "bg-brand/15 font-medium text-brand ring-1 ring-brand/30"
                : "text-ink-soft ring-1 ring-line hover:text-ink"
            }`}
          >
            {f.label}
            {f.key === "underwater" && (
              <span className="num ml-1.5 text-state-bad">{rows.filter((r) => r.net < 0).length}</span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-ink-mute">
          <span className="num">{view.length}</span> vehicles ·{" "}
          <span className={`num ${totalNet >= 0 ? "text-state-good" : "text-state-bad"}`}>
            {usd0(totalNet)}
          </span>{" "}
          net over {days} days
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="border-b border-line text-2xs uppercase tracking-[0.08em] text-ink-mute">
            <tr>
              {th("id", "Vehicle", "left")}
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Driver
              </th>
              <th scope="col" className="px-3 py-2.5 text-left font-medium">
                Deal
              </th>
              {th("trips", "Trips")}
              {th("miles", "Miles")}
              {th("revenue", "Revenue")}
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Energy
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Maint.
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Fixed
              </th>
              {th("net", "Net")}
              {th("netPerMile", "$/mi")}
              {th("margin", "Margin")}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr
                key={r.vehicle.id}
                className="border-b border-line/60 transition-colors last:border-0 hover:bg-raised/60"
              >
                <td className="px-3 py-3">
                  <Link href={`/vehicles/${r.vehicle.id}`} className="group block">
                    <span className="num block font-medium text-ink group-hover:text-brand">
                      {r.vehicle.id}
                    </span>
                    <span className="block text-2xs text-ink-mute">
                      {r.vehicle.nickname} · {r.vehicle.model}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <span className="block text-ink-soft">{driverName(r.vehicle.driverId)}</span>
                  <span className="mt-1 block">
                    <StatusPill status={r.vehicle.status} />
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-ink-soft">
                  {r.vehicle.revenueModel === "rental" ? (
                    <>
                      Rental
                      <span className="num block text-2xs text-ink-mute">
                        ${r.vehicle.weeklyRentalRate}/wk
                      </span>
                    </>
                  ) : (
                    <>
                      Split
                      <span className="num block text-2xs text-ink-mute">
                        {Math.round(r.vehicle.ownerSplit * 100)}% of net fare
                      </span>
                    </>
                  )}
                </td>
                <td className="num px-3 py-3 text-right text-ink-soft">{r.trips}</td>
                <td className="num px-3 py-3 text-right text-ink-soft">
                  {Math.round(r.miles).toLocaleString()}
                </td>
                <td className="num px-3 py-3 text-right text-ink">{usd0(r.revenue)}</td>
                <td className="num px-3 py-3 text-right text-ink-soft">
                  {r.energy ? usd0(r.energy) : <span className="text-ink-mute">driver</span>}
                </td>
                <td className="num px-3 py-3 text-right text-ink-soft">{usd0(r.maintenance)}</td>
                <td className="num px-3 py-3 text-right text-ink-soft">{usd0(r.fixed)}</td>
                <td className="px-3 py-3 text-right">
                  <span
                    className={`num font-semibold ${
                      r.net >= 0 ? "text-state-good" : "text-state-bad"
                    }`}
                  >
                    {r.net < 0 ? "−" : ""}
                    {usd0(Math.abs(r.net))}
                  </span>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-line">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(Math.abs(r.net) / maxAbsNet) * 100}%`,
                        marginLeft: r.net >= 0 ? "auto" : undefined,
                        background: r.net >= 0 ? "var(--series-revenue)" : "#e66767",
                      }}
                    />
                  </span>
                </td>
                <td className="num px-3 py-3 text-right text-ink-soft">
                  {r.miles > 0 ? r.netPerMile.toFixed(2) : <span className="text-ink-mute">—</span>}
                </td>
                <td className="num px-3 py-3 text-right text-ink-soft">
                  {r.revenue > 0 ? (
                    `${Math.round(r.margin * 100)}%`
                  ) : (
                    <span className="text-ink-mute">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {view.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-ink-mute">
          No vehicles match this filter.
        </p>
      )}
    </div>
  );
}
