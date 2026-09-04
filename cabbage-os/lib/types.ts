// Shaped like the real schema even though it's fixtures today — the MVP inherits
// these types unchanged when the seed module is swapped for real integrations.

export type VehicleStatus = "earning" | "idle" | "charging" | "shop";
export type Platform = "uber" | "lyft" | "black";
export type RevenueModel = "rental" | "split";
export type ChargeLocation = "depot" | "supercharger" | "public_l2";
export type CostCategory =
  | "maintenance"
  | "cleaning"
  | "insurance"
  | "finance"
  | "tires"
  | "tolls"
  | "damage";

export interface Vehicle {
  id: string;
  nickname: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  odometer: number;
  status: VehicleStatus;
  statusSince: string;
  batteryPct: number;
  lat: number;
  lng: number;
  driverId: string | null;
  revenueModel: RevenueModel;
  /** Owner's share of net fare on split vehicles (0–1). */
  ownerSplit: number;
  /** Flat weekly rate the driver pays on rental vehicles. */
  weeklyRentalRate: number;
  financeMonthly: number;
  insuranceMonthly: number;
  acquiredAt: string;
  /** Who pays for energy — on rental vehicles the driver usually does. */
  ownerPaysEnergy: boolean;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  vehicleId: string | null;
  startedAt: string;
  status: "active" | "onboarding" | "inactive";
  rating: number;
  depositRequired: number;
  depositPaid: number;
  /** Unpaid rental balance, rental vehicles only. */
  balanceOwed: number;
}

export interface Trip {
  id: string;
  vehicleId: string;
  driverId: string;
  platform: Platform;
  startedAt: string;
  minutes: number;
  miles: number;
  /** Rider-paid fare. */
  gross: number;
  /** Platform take from the gross. */
  commission: number;
}

export interface ChargeSession {
  id: string;
  vehicleId: string;
  startedAt: string;
  location: ChargeLocation;
  kwh: number;
  costPerKwh: number;
  cost: number;
  minutes: number;
  /** False when the driver paid at the plug (rental vehicles). */
  billedToOwner: boolean;
}

export interface CostEntry {
  id: string;
  vehicleId: string;
  date: string;
  category: CostCategory;
  amount: number;
  note: string;
}

export interface PlatformAccount {
  platform: Platform;
  label: string;
  connected: boolean;
  lastSyncAt: string;
  commissionRate: number;
}

export interface Fleet {
  generatedAt: string;
  vehicles: Vehicle[];
  drivers: Driver[];
  trips: Trip[];
  charges: ChargeSession[];
  costs: CostEntry[];
  accounts: PlatformAccount[];
}
