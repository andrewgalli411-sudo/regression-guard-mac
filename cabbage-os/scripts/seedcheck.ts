/**
 * Verification for the demo data: determinism and P&L arithmetic.
 * Run with `npm run seedcheck`.
 */
import { buildFleet } from "../lib/seed";
import { dailySeries, fleetPL, totals, vehiclePL, windowOf } from "../lib/pnl";

const PINNED = new Date("2026-05-16T15:20:00.000Z");
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
}

const a = buildFleet(PINNED);
const b = buildFleet(PINNED);

check(
  "same date produces byte-identical fleet",
  JSON.stringify(a) === JSON.stringify(b),
  `${a.vehicles.length} vehicles, ${a.trips.length} trips, ${a.charges.length} charge sessions`,
);

const different = buildFleet(new Date("2026-05-17T15:20:00.000Z"));
check(
  "a different date produces a different fleet",
  JSON.stringify(a) !== JSON.stringify(different),
);

for (const days of [7, 30, 90]) {
  const w = windowOf(a, days);
  const rows = fleetPL(a, w);

  const bad = rows.filter((r) => {
    const sum = r.revenue - (r.energy + r.maintenance + r.cleaning + r.other + r.fixed);
    return Math.abs(sum - r.net) > 0.011;
  });
  check(
    `${days}d — every vehicle's line items sum to its net`,
    bad.length === 0,
    bad.length ? bad.map((r) => r.vehicle.id).join(", ") : `${rows.length} vehicles`,
  );

  const t = totals(rows);
  const manual = rows.reduce((s, r) => s + r.net, 0);
  check(`${days}d — fleet net equals the sum of vehicle nets`, Math.abs(manual - t.net) < 0.02);

  const series = dailySeries(a, w);
  check(`${days}d — daily series has one point per day`, series.length === days, `${series.length}`);

  const seriesNet = series.reduce((s, d) => s + d.net, 0);
  const drift = Math.abs(seriesNet - t.net) / Math.max(1, Math.abs(t.net));
  check(
    `${days}d — chart net tracks table net within 5%`,
    drift < 0.05,
    `chart ${Math.round(seriesNet)} vs table ${Math.round(t.net)}`,
  );

  const scoped = dailySeries(a, w, a.vehicles[0].id);
  const one = vehiclePL(a, a.vehicles[0], w);
  const scopedRev = scoped.reduce((s, d) => s + d.revenue, 0);
  check(
    `${days}d — per-vehicle chart matches that vehicle's revenue within 5%`,
    Math.abs(scopedRev - one.revenue) / Math.max(1, one.revenue) < 0.05,
    `${a.vehicles[0].id}: chart ${Math.round(scopedRev)} vs table ${Math.round(one.revenue)}`,
  );
}

const w30 = windowOf(a, 30);
const rows30 = fleetPL(a, w30);
const t30 = totals(rows30);
console.log(
  `\n  30-day fleet: revenue ${Math.round(t30.revenue)}, cost ${Math.round(t30.cost)}, ` +
    `net ${Math.round(t30.net)}, ${t30.underwater} underwater, ${t30.trips} trips`,
);
console.log(
  `  per active vehicle/day: ${(t30.grossFares / 30 / rows30.filter((r) => r.trips > 0).length).toFixed(0)} gross fares`,
);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
