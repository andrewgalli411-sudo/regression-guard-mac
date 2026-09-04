import type { CostEntry, Fleet, Platform, Vehicle } from "./types";

const DAY_MS = 86_400_000;
const AVG_MONTH_DAYS = 30.44;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface VehiclePL {
  vehicle: Vehicle;
  days: number;
  /** Days the car actually turned a wheel — shop days earn nothing on either model. */
  activeDays: number;
  trips: number;
  miles: number;
  grossFares: number;
  commission: number;
  /** Fares less platform commission. */
  netFare: number;
  /** What the owner actually books: rental income, or their split of net fare. */
  revenue: number;
  energy: number;
  maintenance: number;
  cleaning: number;
  other: number;
  /** Insurance + note, prorated across the window. */
  fixed: number;
  totalCost: number;
  net: number;
  netPerMile: number;
  margin: number;
}

export interface Window {
  from: Date;
  to: Date;
  days: number;
}

/**
 * Windows are aligned to UTC day boundaries so a table total covers exactly the
 * same calendar days the chart plots — a rolling 168-hour window would silently
 * include half of an eighth day and the two would never agree.
 */
export function windowOf(fleet: Fleet, days: number): Window {
  const to = new Date(fleet.generatedAt);
  const startOfToday = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return { from: new Date(startOfToday - (days - 1) * DAY_MS), to, days };
}

const inWindow = (iso: string, w: Window) => {
  const t = Date.parse(iso);
  return t >= w.from.getTime() && t <= w.to.getTime();
};

const isFixed = (c: CostEntry) => c.category === "finance" || c.category === "insurance";

/**
 * Per-vehicle P&L over a window.
 *
 * net = revenue − energy − maintenance − cleaning − other − fixed
 *
 * Fixed costs are prorated from the monthly figures rather than summed from the
 * booked entries, so a 7-day and a 30-day window are comparable and the totals
 * on the vehicle detail page add up to the number in the table.
 */
export function vehiclePL(fleet: Fleet, vehicle: Vehicle, w: Window): VehiclePL {
  const trips = fleet.trips.filter((t) => t.vehicleId === vehicle.id && inWindow(t.startedAt, w));
  const charges = fleet.charges.filter(
    (c) => c.vehicleId === vehicle.id && c.billedToOwner && inWindow(c.startedAt, w),
  );
  const costs = fleet.costs.filter(
    (c) => c.vehicleId === vehicle.id && !isFixed(c) && inWindow(c.date, w),
  );

  const grossFares = trips.reduce((s, t) => s + t.gross, 0);
  const commission = trips.reduce((s, t) => s + t.commission, 0);
  const netFare = grossFares - commission;
  const miles = trips.reduce((s, t) => s + t.miles, 0);

  const activeDays = new Set(trips.map((t) => t.startedAt.slice(0, 10))).size;

  const revenue =
    vehicle.revenueModel === "rental"
      ? (vehicle.weeklyRentalRate / 7) * activeDays
      : netFare * vehicle.ownerSplit;

  const energy = charges.reduce((s, c) => s + c.cost, 0);
  const byCat = (cats: CostEntry["category"][]) =>
    costs.filter((c) => cats.includes(c.category)).reduce((s, c) => s + c.amount, 0);

  const maintenance = byCat(["maintenance", "tires", "damage"]);
  const cleaning = byCat(["cleaning"]);
  const other = byCat(["tolls"]);
  const fixed = ((vehicle.financeMonthly + vehicle.insuranceMonthly) * w.days) / AVG_MONTH_DAYS;

  const totalCost = energy + maintenance + cleaning + other + fixed;
  const net = revenue - totalCost;

  return {
    vehicle,
    days: w.days,
    activeDays,
    trips: trips.length,
    miles: r2(miles),
    grossFares: r2(grossFares),
    commission: r2(commission),
    netFare: r2(netFare),
    revenue: r2(revenue),
    energy: r2(energy),
    maintenance: r2(maintenance),
    cleaning: r2(cleaning),
    other: r2(other),
    fixed: r2(fixed),
    totalCost: r2(totalCost),
    net: r2(net),
    netPerMile: miles > 0 ? r2(net / miles) : 0,
    margin: revenue > 0 ? r2(net / revenue) : 0,
  };
}

export function fleetPL(fleet: Fleet, w: Window): VehiclePL[] {
  return fleet.vehicles.map((v) => vehiclePL(fleet, v, w));
}

export interface FleetTotals {
  revenue: number;
  cost: number;
  net: number;
  grossFares: number;
  commission: number;
  energy: number;
  fixed: number;
  maintenance: number;
  miles: number;
  trips: number;
  underwater: number;
}

export function totals(rows: VehiclePL[]): FleetTotals {
  const sum = (f: (r: VehiclePL) => number) => r2(rows.reduce((s, x) => s + f(x), 0));
  return {
    revenue: sum((r) => r.revenue),
    cost: sum((r) => r.totalCost),
    net: sum((r) => r.net),
    grossFares: sum((r) => r.grossFares),
    commission: sum((r) => r.commission),
    energy: sum((r) => r.energy),
    fixed: sum((r) => r.fixed),
    maintenance: sum((r) => r.maintenance),
    miles: sum((r) => r.miles),
    trips: rows.reduce((s, x) => s + x.trips, 0),
    underwater: rows.filter((r) => r.net < 0).length,
  };
}

/** Daily revenue/cost series for the window, oldest first. Scoped to one vehicle when given. */
export function dailySeries(fleet: Fleet, w: Window, vehicleId?: string) {
  const buckets = new Map<string, { revenue: number; cost: number }>();
  for (let i = w.days - 1; i >= 0; i--) {
    const key = new Date(w.to.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    buckets.set(key, { revenue: 0, cost: 0 });
  }
  const scope = vehicleId ? fleet.vehicles.filter((v) => v.id === vehicleId) : fleet.vehicles;
  const vById = new Map(scope.map((v) => [v.id, v]));

  for (const t of fleet.trips) {
    const key = t.startedAt.slice(0, 10);
    const b = buckets.get(key);
    const v = vById.get(t.vehicleId);
    if (!b || !v || v.revenueModel !== "split") continue;
    b.revenue += (t.gross - t.commission) * v.ownerSplit;
  }
  // Rental income lands once per active day per rental vehicle.
  const rentalDays = new Map<string, Set<string>>();
  for (const t of fleet.trips) {
    const v = vById.get(t.vehicleId);
    if (!v || v.revenueModel !== "rental") continue;
    const key = t.startedAt.slice(0, 10);
    if (!rentalDays.has(key)) rentalDays.set(key, new Set());
    rentalDays.get(key)!.add(v.id);
  }
  for (const [key, ids] of rentalDays) {
    const b = buckets.get(key);
    if (!b) continue;
    for (const id of ids) b.revenue += vById.get(id)!.weeklyRentalRate / 7;
  }

  for (const c of fleet.charges) {
    if (!c.billedToOwner || !vById.has(c.vehicleId)) continue;
    const b = buckets.get(c.startedAt.slice(0, 10));
    if (b) b.cost += c.cost;
  }
  for (const c of fleet.costs) {
    if (isFixed(c) || !vById.has(c.vehicleId)) continue;
    const b = buckets.get(c.date.slice(0, 10));
    if (b) b.cost += c.amount;
  }
  // Fixed costs spread evenly rather than spiking on the 1st.
  const dailyFixed =
    scope.reduce((s, v) => s + v.financeMonthly + v.insuranceMonthly, 0) / AVG_MONTH_DAYS;
  for (const b of buckets.values()) b.cost += dailyFixed;

  return [...buckets.entries()].map(([date, b]) => ({
    date,
    revenue: r2(b.revenue),
    cost: r2(b.cost),
    net: r2(b.revenue - b.cost),
  }));
}

export interface Leak {
  id: string;
  severity: "critical" | "serious" | "warning";
  title: string;
  amount: number;
  detail: string;
  href: string;
  cta: string;
}

/**
 * The panel that replaces "AI insights". Every finding is denominated in dollars
 * and links to the rows that prove it — an insight you can't act on is decoration.
 */
export function moneyLeaks(fleet: Fleet, rows: VehiclePL[], w: Window): Leak[] {
  const leaks: Leak[] = [];

  const underwater = rows.filter((r) => r.net < 0).sort((a, b) => a.net - b.net);
  if (underwater.length) {
    const bleed = underwater.reduce((s, r) => s + r.net, 0);
    const worst = underwater[0];
    leaks.push({
      id: "underwater",
      severity: "critical",
      title: `${underwater.length} vehicle${underwater.length > 1 ? "s" : ""} lost money over ${w.days} days`,
      amount: bleed,
      detail: `${worst.vehicle.id} is the worst: ${fmtUSD(worst.revenue)} in, ${fmtUSD(worst.totalCost)} out. Shop time and the note are still billing while it sits.`,
      href: "/vehicles?filter=underwater",
      cta: "See the P&L",
    });
  }

  // Charging arbitrage: what the same kWh would have cost at the depot rate.
  const depot = fleet.charges.filter((c) => c.location === "depot");
  const depotRate = depot.length
    ? depot.reduce((s, c) => s + c.costPerKwh, 0) / depot.length
    : 0.13;
  const offDepot = fleet.charges.filter(
    (c) => c.billedToOwner && c.location !== "depot" && inWindow(c.startedAt, w),
  );
  const spent = offDepot.reduce((s, c) => s + c.cost, 0);
  const wouldBe = offDepot.reduce((s, c) => s + c.kwh * depotRate, 0);
  if (spent - wouldBe > 100) {
    leaks.push({
      id: "charging",
      severity: "serious",
      title: "Public charging is costing more than the depot",
      amount: -(spent - wouldBe),
      detail: `${offDepot.length} sessions off-depot at an average ${fmtUSD(
        spent / offDepot.reduce((s, c) => s + c.kwh, 0),
      )}/kWh vs ${fmtUSD(depotRate)} at the depot.`,
      href: "/charging",
      cta: "Break down charging",
    });
  }

  // Idle capital: a car with no driver still costs insurance and a note.
  const unassigned = rows.filter((r) => !r.vehicle.driverId);
  if (unassigned.length) {
    const carry = unassigned.reduce((s, r) => s + r.fixed, 0);
    leaks.push({
      id: "idle",
      severity: "warning",
      title: `${unassigned.length} vehicle${unassigned.length > 1 ? "s" : ""} with no driver assigned`,
      amount: -carry,
      detail: `${unassigned
        .map((r) => r.vehicle.id)
        .join(", ")} carried insurance and note payments for ${w.days} days with no revenue against them.`,
      href: "/drivers",
      cta: "Assign a driver",
    });
  }

  // Which revenue model is actually winning.
  const byModel = (m: Vehicle["revenueModel"]) => rows.filter((r) => r.vehicle.revenueModel === m);
  const avg = (xs: VehiclePL[]) => (xs.length ? xs.reduce((s, r) => s + r.net, 0) / xs.length : 0);
  const rentalAvg = avg(byModel("rental"));
  const splitAvg = avg(byModel("split"));
  if (Math.abs(rentalAvg - splitAvg) > 150) {
    const better = splitAvg > rentalAvg ? "split" : "flat rental";
    const worse = splitAvg > rentalAvg ? "flat rental" : "split";
    leaks.push({
      id: "model",
      severity: "warning",
      title: `${better[0].toUpperCase()}${better.slice(1)} vehicles are out-earning ${worse}`,
      amount: Math.abs(rentalAvg - splitAvg),
      detail: `${fmtUSD(Math.abs(rentalAvg - splitAvg))} per vehicle over ${w.days} days. ${
        byModel(splitAvg > rentalAvg ? "rental" : "split").length
      } vehicles are still on the ${worse} deal.`,
      href: "/vehicles",
      cta: "Compare by model",
    });
  }

  return leaks;
}

export function fmtUSD(n: number, opts: { cents?: boolean } = {}) {
  const cents = opts.cents ?? Math.abs(n) < 10;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(n);
}

export function platformLabel(p: Platform) {
  return p === "uber" ? "Uber" : p === "lyft" ? "Lyft" : "Black car";
}

export function platformMix(fleet: Fleet, vehicleId: string, w: Window) {
  const trips = fleet.trips.filter(
    (t) => t.vehicleId === vehicleId && inWindow(t.startedAt, w),
  );
  const counts: Record<Platform, number> = { uber: 0, lyft: 0, black: 0 };
  for (const t of trips) counts[t.platform]++;
  const total = trips.length || 1;
  return (Object.entries(counts) as [Platform, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([p, n]) => ({ platform: p, share: n / total }));
}
