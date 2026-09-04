import type {
  ChargeLocation,
  ChargeSession,
  CostEntry,
  Driver,
  Fleet,
  Platform,
  Trip,
  Vehicle,
  VehicleStatus,
} from "./types";

export const HISTORY_DAYS = 90;

/** Deterministic PRNG — same seed, same fleet, forever. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const pick = <T,>(r: () => number, xs: readonly T[]): T =>
  xs[Math.floor(r() * xs.length)];
const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const intBetween = (r: () => number, lo: number, hi: number) =>
  Math.floor(between(r, lo, hi + 1));
const money = (n: number) => Math.round(n * 100) / 100;

const DAY_MS = 86_400_000;
export const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const DRIVER_NAMES = [
  "Marcus Bell", "Elena Ruiz", "Devon Park", "Amara Osei", "Tomas Nowak",
  "Priya Raghavan", "Cole Jefferson", "Nadia Haddad", "Rafael Mendes", "Grace Kim",
  "Ibrahim Diallo", "Sofia Marchetti", "Andre Whitfield", "Lena Petrov", "Jamal Carter",
  "Maya Fitzgerald", "Hector Salinas", "Bea Okonkwo", "Trevor Lang", "Nia Robinson",
  "Omar Haddadi", "Julia Castellanos", "Desmond Wright", "Anya Kovalenko",
];

const MODELS = [
  { make: "Tesla", model: "Model Y", year: 2024, kwh: 75 },
  { make: "Tesla", model: "Model 3", year: 2023, kwh: 60 },
  { make: "Tesla", model: "Model Y", year: 2025, kwh: 75 },
  { make: "Hyundai", model: "Ioniq 5", year: 2024, kwh: 77 },
  { make: "Kia", model: "EV6", year: 2023, kwh: 77 },
  { make: "Toyota", model: "Sienna Hybrid", year: 2023, kwh: 0 },
];

const NICKNAMES = [
  "Greenline", "Northside", "Bloomfield", "Shadyside", "Oakland", "Strip",
  "Lawrenceville", "Squirrel", "Mt. Washington", "Homestead", "Bellevue", "Carrick",
  "Brookline", "Hazelwood", "Polish Hill", "Troy Hill", "Beechview", "Sheraden",
  "Regent", "Highland", "Larimer", "Manchester", "Elliott", "Duquesne",
];

// Pittsburgh-ish. Coordinates are only used to place pins on the stylized map.
const CENTER = { lat: 40.4406, lng: -79.9959 };

const CHARGE_PRICE: Record<ChargeLocation, [number, number]> = {
  depot: [0.121, 0.138],
  public_l2: [0.26, 0.33],
  supercharger: [0.38, 0.48],
};

// Category and note travel together so a toll never gets described as a detail.
const MINOR_COSTS = [
  { category: "cleaning", lo: 35, hi: 145, notes: ["Interior detail", "Post-trip cleanup fee", "Biohazard cleaning"] },
  { category: "tolls", lo: 12, hi: 68, notes: ["Turnpike tolls", "Parkway + tunnel tolls", "Airport access fees"] },
  { category: "maintenance", lo: 45, hi: 210, notes: ["Wiper blades + cabin filter", "Tire rotation", "12V battery", "Brake fluid service"] },
] as const;

const MAJOR_COSTS = [
  { category: "maintenance", lo: 640, hi: 1780, notes: ["Rear suspension + alignment", "HV battery coolant service", "Drive unit inspection"] },
  { category: "damage", lo: 900, hi: 2380, notes: ["Collision repair, deductible", "Rear quarter panel + bumper", "Windshield + calibration"] },
  { category: "tires", lo: 620, hi: 1240, notes: ["Four tires + mounting", "Two tires + road hazard claim"] },
] as const;

const PLATFORM_COMMISSION: Record<Platform, number> = {
  uber: 0.253,
  lyft: 0.242,
  black: 0.18,
};

export function buildFleet(now: Date): Fleet {
  const today = startOfDay(now);
  // Seeded by calendar day: the demo always looks current, and any given day
  // regenerates byte-identically.
  const baseSeed = hash("cabbage-os:" + dayKey(today));
  const r = mulberry32(baseSeed);

  const vehicles: Vehicle[] = [];
  const drivers: Driver[] = [];

  for (let i = 0; i < 24; i++) {
    const spec = MODELS[i % MODELS.length];
    const rental = r() < 0.42;
    const id = `CAB-${String(i + 1).padStart(3, "0")}`;
    vehicles.push({
      id,
      nickname: NICKNAMES[i],
      make: spec.make,
      model: spec.model,
      year: spec.year,
      plate: `PA ${intBetween(r, 100, 999)}-${String.fromCharCode(65 + intBetween(r, 0, 25))}${String.fromCharCode(65 + intBetween(r, 0, 25))}${String.fromCharCode(65 + intBetween(r, 0, 25))}`,
      odometer: intBetween(r, 18_000, 141_000),
      status: "idle",
      statusSince: new Date(today.getTime() - intBetween(r, 1, 40) * 3_600_000).toISOString(),
      batteryPct: intBetween(r, 18, 98),
      lat: CENTER.lat + between(r, -0.055, 0.055),
      lng: CENTER.lng + between(r, -0.075, 0.075),
      driverId: null,
      revenueModel: rental ? "rental" : "split",
      ownerSplit: rental ? 0 : money(between(r, 0.4, 0.52)),
      weeklyRentalRate: rental ? intBetween(r, 76, 92) * 5 : 0,
      financeMonthly: money(between(r, 380, 580)),
      insuranceMonthly: money(between(r, 244, 392)),
      acquiredAt: new Date(today.getTime() - intBetween(r, 120, 900) * DAY_MS).toISOString(),
      ownerPaysEnergy: !rental,
    });
  }

  for (let i = 0; i < 24; i++) {
    drivers.push({
      id: `DRV-${String(i + 1).padStart(3, "0")}`,
      name: DRIVER_NAMES[i],
      phone: `(412) 555-0${String(intBetween(r, 100, 999))}`,
      vehicleId: null,
      startedAt: new Date(today.getTime() - intBetween(r, 20, 620) * DAY_MS).toISOString(),
      status: "active",
      rating: money(between(r, 4.58, 4.99)),
      depositRequired: 500,
      depositPaid: 500,
      balanceOwed: 0,
    });
  }

  // Assign drivers to vehicles. A few vehicles sit unassigned — that idle
  // capacity is one of the money leaks the dashboard surfaces.
  const assignable = vehicles.filter(() => true);
  drivers.forEach((d, i) => {
    if (i >= 22) {
      d.status = i === 22 ? "onboarding" : "inactive";
      d.depositPaid = i === 22 ? 250 : 500;
      return;
    }
    const v = assignable[i];
    d.vehicleId = v.id;
    v.driverId = d.id;
    if (v.revenueModel === "rental" && r() < 0.28) {
      d.balanceOwed = money(between(r, 90, 540));
    }
  });

  const trips: Trip[] = [];
  const charges: ChargeSession[] = [];
  const costs: CostEntry[] = [];

  // Vehicles that spend a stretch in the shop — the underwater cars.
  const shopVehicles = new Set([vehicles[5].id, vehicles[14].id, vehicles[21].id]);

  for (const v of vehicles) {
    const vr = mulberry32(hash(v.id + dayKey(today)));
    const strength = between(vr, 0.78, 1.22); // per-car demand multiplier
    const shopStart = shopVehicles.has(v.id) ? intBetween(vr, 6, 34) : -1;
    const shopLen = shopVehicles.has(v.id) ? intBetween(vr, 9, 19) : 0;

    for (let back = HISTORY_DAYS - 1; back >= 0; back--) {
      const date = new Date(today.getTime() - back * DAY_MS);
      const dow = date.getUTCDay();
      const inShop = shopStart >= 0 && back <= shopStart && back > shopStart - shopLen;
      const hasDriver = v.driverId !== null;
      // Drivers take days off, which is what makes real utilization lumpy — and
      // on a flat-rental car, a day off is a day of rental income that never accrues.
      const dayOff = vr() < 0.13;
      const weekendLift = dow === 5 || dow === 6 ? 1.18 : dow === 0 ? 0.92 : 1;

      if (inShop || !hasDriver || dayOff) {
        if (inShop && back === shopStart) {
          const major = pick(vr, MAJOR_COSTS);
          costs.push({
            id: `CST-${v.id}-${back}-mx`,
            vehicleId: v.id,
            date: date.toISOString(),
            category: major.category,
            amount: money(between(vr, major.lo, major.hi)),
            note: pick(vr, major.notes),
          });
        }
      } else {
        const tripCount = Math.round(between(vr, 10, 19) * strength * weekendLift);
        const isToday = back === 0;
        // Today is partially elapsed — only the hours that have passed exist.
        const elapsed = isToday
          ? Math.max(0.08, (now.getTime() - today.getTime()) / DAY_MS)
          : 1;
        const realized = Math.max(isToday ? 1 : 0, Math.round(tripCount * elapsed));

        const lastHour = isToday
          ? Math.max(6, (now.getTime() - today.getTime()) / 3_600_000)
          : 22;

        for (let t = 0; t < realized; t++) {
          const platform: Platform =
            vr() < 0.62 ? "uber" : vr() < 0.86 ? "lyft" : "black";
          const miles = money(between(vr, 2.1, 17.4));
          const minutes = Math.round(miles * between(vr, 2.3, 3.6) + between(vr, 3, 9));
          // ~$15–19 average fare, which is where US rideshare actually sits.
          const gross = money(
            (platform === "black" ? 7.4 : 2.6) + miles * between(vr, 1.02, 1.46) + minutes * 0.1,
          );
          trips.push({
            id: `TRP-${v.id}-${back}-${t}`,
            vehicleId: v.id,
            driverId: v.driverId!,
            platform,
            startedAt: new Date(
              date.getTime() +
                (5 + (t / Math.max(1, realized)) * Math.max(1, lastHour - 5)) * 3_600_000,
            ).toISOString(),
            minutes,
            miles,
            gross,
            commission: money(gross * PLATFORM_COMMISSION[platform]),
          });
        }

        // Charging: roughly one session per ~140 miles driven.
        if (vr() < 0.92) {
          const loc: ChargeLocation =
            vr() < 0.55 ? "depot" : vr() < 0.82 ? "supercharger" : "public_l2";
          const [lo, hi] = CHARGE_PRICE[loc];
          const kwh = money(between(vr, 38, 82));
          const price = money(between(vr, lo, hi));
          charges.push({
            id: `CHG-${v.id}-${back}`,
            vehicleId: v.id,
            startedAt: new Date(date.getTime() + intBetween(vr, 1, 22) * 3_600_000).toISOString(),
            location: loc,
            kwh,
            costPerKwh: price,
            cost: money(kwh * price),
            minutes: loc === "supercharger" ? intBetween(vr, 18, 41) : intBetween(vr, 90, 380),
            billedToOwner: v.ownerPaysEnergy,
          });
        }

        // Cleaning / tolls / small maintenance.
        if (vr() < 0.14) {
          const minor = pick(vr, MINOR_COSTS);
          costs.push({
            id: `CST-${v.id}-${back}-c`,
            vehicleId: v.id,
            date: date.toISOString(),
            category: minor.category,
            amount: money(between(vr, minor.lo, minor.hi)),
            note: pick(vr, minor.notes),
          });
        }
      }
    }

    // Fixed monthly costs, booked on the 1st of each month in range.
    for (let m = 0; m < 3; m++) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1));
      if (d.getTime() < today.getTime() - HISTORY_DAYS * DAY_MS) continue;
      costs.push({
        id: `CST-${v.id}-fin-${m}`,
        vehicleId: v.id,
        date: d.toISOString(),
        category: "finance",
        amount: v.financeMonthly,
        note: "Vehicle note",
      });
      costs.push({
        id: `CST-${v.id}-ins-${m}`,
        vehicleId: v.id,
        date: d.toISOString(),
        category: "insurance",
        amount: v.insuranceMonthly,
        note: "Commercial rideshare policy",
      });
    }
  }

  // Live status: derived from battery, assignment and shop state so the tiles
  // agree with the map.
  const shopNow = new Set([vehicles[5].id, vehicles[21].id]);
  for (const v of vehicles) {
    const vr = mulberry32(hash("status" + v.id + dayKey(today)));
    let status: VehicleStatus;
    if (shopNow.has(v.id)) status = "shop";
    else if (!v.driverId) status = "idle";
    else if (v.batteryPct < 28) status = "charging";
    else status = vr() < 0.74 ? "earning" : vr() < 0.88 ? "charging" : "idle";
    v.status = status;
  }

  return {
    generatedAt: now.toISOString(),
    vehicles,
    drivers,
    trips,
    charges,
    costs,
    accounts: [
      { platform: "uber", label: "Uber Fleet", connected: true, lastSyncAt: new Date(now.getTime() - 4 * 60_000).toISOString(), commissionRate: PLATFORM_COMMISSION.uber },
      { platform: "lyft", label: "Lyft Business", connected: true, lastSyncAt: new Date(now.getTime() - 11 * 60_000).toISOString(), commissionRate: PLATFORM_COMMISSION.lyft },
      { platform: "black", label: "Black car / direct", connected: true, lastSyncAt: new Date(now.getTime() - 26 * 60_000).toISOString(), commissionRate: PLATFORM_COMMISSION.black },
    ],
  };
}

// One fleet per calendar day, reused across requests in the same process.
const cache = new Map<string, Fleet>();

export function getFleet(now: Date = new Date()): Fleet {
  const key = dayKey(startOfDay(now)) + ":" + now.getUTCHours();
  const hit = cache.get(key);
  if (hit) return hit;
  const fleet = buildFleet(now);
  cache.set(key, fleet);
  return fleet;
}
