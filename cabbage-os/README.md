# CABBAGE OS — demo

Per-vehicle profit and loss for multi-car rideshare fleet owners: the operator
running 5–50 cars on Uber/Lyft/black-car who can't answer "what did car #7 net
last month" without a spreadsheet and an evening.

**This is a demo, not a product.** There is no backend, no auth, and no real
platform integrations. Every number comes from a seeded generator in
`lib/seed.ts`. It exists to be shown — a URL and a 90-second screen recording
that starts a conversation with a real fleet owner.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run seedcheck    # determinism + P&L arithmetic checks
```

## What's here

| Route | What it argues |
|---|---|
| `/` | Net profit after commission, energy and the note — plus **Money leaks**, every finding denominated in dollars and linked to the rows that prove it |
| `/vehicles` | Per-vehicle P&L. The screen that sells: sort by net, start at the bottom |
| `/vehicles/[id]` | One car's daily earnings vs cost, line-item P&L, trips, charging, repairs |
| `/drivers` | Who has which car, what it produces, who is behind on rental |
| `/map` | Live positions, coloured and glyphed by state |
| `/charging` | Depot vs Supercharger cost, and what shifting volume is worth |

## The model

Two revenue models, because real fleets run both:

- **Flat rental** — the driver pays a weekly rate and buys their own energy.
  Lower variance, lower ceiling. Rental income only accrues on days the car
  actually moved, so a day in the shop is a day of income that never arrives.
- **Revenue split** — the owner takes a share of the fare net of platform
  commission and pays for charging. Higher ceiling, more exposure.

```
net = owner revenue
    − charging billed to the owner
    − maintenance, tires, damage
    − cleaning
    − tolls and misc.
    − insurance + note, prorated across the window
```

Fixed costs are prorated from the monthly figures rather than summed from the
booked entries, so 7-, 30- and 90-day windows are comparable and the vehicle
detail page always adds up to the number in the table. `npm run seedcheck`
asserts exactly that.

## Data

`buildFleet(now)` is seeded by calendar day: the demo always looks current, and
any given day regenerates byte-identically, so screenshots are reproducible.
Today is partial — trips only exist for hours that have actually elapsed.

24 vehicles, 24 drivers (22 assigned — the two idle cars are one of the money
leaks), 90 days of trips, charge sessions and cost entries. Roughly $235/car/day
in fares, 25% platform commission, $0.13/kWh at the depot against $0.44 at a
Supercharger.

## Charts

Hand-rolled SVG, no chart library. Series colours are validated against the dark
chart surface for colour-vision separation: revenue green `#57a838` against cost
magenta `#d55181` (CVD ΔE 9.1), depot blue `#3987e5` against Supercharger yellow
`#c98500` (ΔE 27.4). Cost is dashed as well as differently hued, so the two
series stay separable without colour. Green↔orange — the obvious profit/cost
pair — fails deutan separation at ΔE 3.0, which is why cost isn't orange.

The map is a stylized SVG rather than real tiles: no API key, no tile bill, works
offline, and renders identically in every screenshot.

## Not in scope

Auth, a database, real Uber/Lyft/Tesla APIs, multi-tenant, mobile, analytics,
reports, settings. Those come after someone pays.
