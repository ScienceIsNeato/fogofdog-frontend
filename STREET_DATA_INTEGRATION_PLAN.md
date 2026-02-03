# Street Data Integration Plan

## Motivation

FogOfDog is a fog-of-war neighbourhood-exploration app. For it to move beyond a generic GPS-trail
viewer into a real exploration tool, the map needs to understand **where the streets are**. This
plan lays the groundwork: types that model street-level geometry, a service that fetches and
queries that data, a Redux slice that persists per-street exploration state, and dev-tool hooks
that let test-data generators walk the street graph instead of emitting random-walk points.

---

## 1. Data Source Decision

`react-native-maps` renders tiles; it does **not** expose underlying street geometry in its JS
API. We therefore pull street data from **OpenStreetMap via the Overpass API**
(`https://overpass-api.de/api/interpreter`).

Query shape (streets within a radius):

```
[out:json][timeout:25];
(
  way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|service)$"]
    (around:<radius_m>,<lat>,<lon>);
);
out geom;
```

`out geom;` inlines every node's lat/lon so we never need a separate `/node` call.

### Why this is fine for alpha

| Concern            | Mitigation                                                                          |
| ------------------ | ----------------------------------------------------------------------------------- |
| Network dependency | Sample street grid bundled as a static fixture for dev / CI                         |
| Rate limits        | Requests are only issued from dev-tool "Load Streets" button, not on every app open |
| Offline production | Out of scope for this PR; flagged for follow-up                                     |

---

## 2. Type Layer — `src/types/street.ts`

| Type                          | Purpose                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `StreetPoint`                 | Lightweight `{lat, lon}` used everywhere in the street graph                          |
| `StreetSegment`               | A single road segment between two intersections; carries geometry + length            |
| `Intersection`                | A node where ≥ 2 segments meet; knows its own connected segment IDs                   |
| `StreetDataCache`             | Envelope returned by the fetcher: centre, radius, segments, intersections, fetch time |
| `ExplorationFilter`           | `'explored' \| 'unexplored'` — applied to every query method                          |
| `ClosestStreetResult`         | Return shape for `get_closest_streets`                                                |
| `ClosestIntersectionResult`   | Return shape for `get_closest_intersections`                                          |
| `LoopWaypoint` / `LoopResult` | Return shape for `get_shortest_loop`                                                  |

---

## 3. Redux Slice — `src/store/slices/streetSlice.ts`

State:

- `segments / intersections` — loaded street graph keyed by ID
- `exploredSegmentIds / exploredIntersectionIds` — sets of IDs the user has walked near
- `preferStreets` / `preferUnexplored` — dev-tool toggles that alter test-data generation
- `isLoading / lastFetchedAt / error` — fetch lifecycle

Key actions:

- `loadStreetData` — bulk-sets the graph (used by both Overpass fetch and sample-data loader)
- `markSegmentsExplored` / `markIntersectionsExplored` — batch-mark from a GPS path
- `setPreferStreets` / `setPreferUnexplored` — toggled from the developer menu

---

## 4. Service Layer — `src/services/StreetDataService.ts`

All exports are **pure functions**; nothing in this module touches Redux. Callers
read state, call the functions, and dispatch results themselves.

### Geometry helpers

| Function                | Notes                            |
| ----------------------- | -------------------------------- |
| `haversineDistance`     | metres between two lat/lon pairs |
| `bearingBetween`        | 0-360° bearing                   |
| `cardinalDirection`     | N / NE / E … string              |
| `closestPointOnSegment` | projects a point onto a polyline |
| `computeSegmentLength`  | sum of haversine edges           |
| `makeNodeKey`           | rounds lat/lon to node-ID string |

### Query functions

#### `findClosestStreets({ segments, exploredIds, comparisonPoint, numResults, filter? })`

Returns up to `numResults` streets sorted by distance. `filter` limits results to
explored or unexplored segments only.

#### `findClosestIntersections({ intersections, exploredIds, comparisonPoint, numResults, filter? })`

Same contract but over intersections. Returned objects include both street-name pairs and GPS
coords of the node.

#### `findShortestLoop({ segments, intersections, startPoint, maxDistanceMiles })`

Uses the **always-turn-right** heuristic to trace a loop:

1. Project `startPoint` onto the nearest segment.
2. Walk to the nearer intersection.
3. At each intersection, choose the exit whose bearing is the **rightmost** turn
   (formula: sort by `((exitBearing − inBearing − 90 + 720) % 360)` ascending).
4. Stop when we return to the starting intersection (success) or hit a dead end /
   exceed `maxDistanceMiles` (error).

Edge cases handled:

- **Dead end** — intersection with only the segment we arrived on → `error: 'dead_end'`
- **Max distance** — cumulative metres exceeds limit → `error: 'max_distance_exceeded'`
- **No streets loaded** — returns `success: false` immediately

### Street-walk generator

#### `walkStreets({ start, segMap, intMap, count, preferUnexplored, exploredSegmentIds })`

Walks the street graph emitting points ~15 m apart until `count` is reached. Used by
`generateStreetAlignedTestData` in the performance-test utilities.

### Exploration helpers

#### `computeExploredIds(path, segments, intersections)`

Scans every point in a GPS path and returns `{ segmentIds, intersectionIds }` of nearby
streets. The caller dispatches `markSegmentsExplored` / `markIntersectionsExplored`.

#### `getSampleStreetData()`

Static 3×3 grid fixture centred on Eugene South Hills — used by dev tools and CI.

---

### Overpass fetch — `src/services/OverpassClient.ts`

Network access is isolated in its own module. The single public export,
`fetchStreetGraph(centre, radiusMeters)`, hits the Overpass API, parses the response,
and returns `{ segments, intersections }`. It does **not** touch Redux.

> **TODO before production:** add retry with back-off, response caching (keyed on
> centre + radius), and an offline fallback path.

---

## 5. Test-Data Integration

### `src/utils/performanceTestData.ts`

Exported function `generateStreetAlignedTestData(count, streetData, options)`:

- Assembles `segMap` / `intMap` from the flat arrays in `streetData`.
- Delegates the actual graph walk to `walkStreets` (exported from `StreetDataService`).
- Wraps every returned point with a monotonic timestamp.

### `src/utils/injectPerformanceTestData.ts`

`generateSpatialPath` gains a branch: when `state.street.preferStreets` is `true` **and** street
data is loaded, it delegates to `generateStreetAlignedTestData`. After injection it calls
`computeExploredIds` and dispatches `markSegmentsExplored` / `markIntersectionsExplored`
directly — no singleton involved.

---

## 6. Developer Menu — `SettingsDeveloperView.tsx`

New "Street Navigation" section after the Performance Testing panel:

| Control                    | testID                     | Behaviour                                |
| -------------------------- | -------------------------- | ---------------------------------------- |
| Prefer Streets toggle      | `prefer-streets-toggle`    | dispatches `setPreferStreets`            |
| Prefer Unexplored toggle   | `prefer-unexplored-toggle` | dispatches `setPreferUnexplored`         |
| Load Sample Streets button | `load-sample-streets`      | loads the static 3×3 grid                |
| Info text                  | `street-info-loaded`       | shows _"N segments loaded · N explored"_ |

---

## 7. Testing Matrix

| Layer          | File(s)                             | What is verified                                                                                                                                          |
| -------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit — slice   | `streetSlice.test.ts`               | All reducers, initial state, explored tracking                                                                                                            |
| Unit — service | `StreetDataService.test.ts`         | haversine, bearing, closest-point projection, `findClosestStreets`, `findClosestIntersections`, `findShortestLoop`, `computeExploredIds` with sample grid |
| Unit — inject  | `injectPerformanceTestData.test.ts` | Legacy random-walk path, street-aligned path with prefer-unexplored, exploration marking via `computeExploredIds`                                         |
| Unit — perf    | `performanceTestData.test.ts`       | `generateStreetAlignedTestData` on synthetic graph; start-location snap, prefer-unexplored routing                                                        |
| E2E (Maestro)  | `street-navigation-test.yaml`       | Full dev-tool flow: load streets → toggle prefs → inject data → verify explored count                                                                     |

---

## 8. ExplorationNudge — `src/components/ExplorationNudge.tsx`

A floating map overlay added after the initial design doc was written. It is the
first **production** (non-test-injection) consumer of the street-query layer.

Two responsibilities:

1. **Real-time exploration marking** — on every GPS tick it calls `computeExploredIds`
   for the current point and dispatches `markSegmentsExplored` /
   `markIntersectionsExplored`. This is the only place outside of test-data injection
   that keeps the explored set in sync with the live path.
2. **Nearest-unexplored nudge** — calls `findClosestStreets` with `filter: 'unexplored'`
   and renders a small card showing street name, distance, cardinal direction, and a
   running `N / M streets explored` counter. Returns `null` (invisible) when no streets
   are loaded or every street is already explored.

---

## 9. Follow-ups (out of scope)

- **OverpassClient**: retry with back-off, response caching, offline fallback (see TODO in `OverpassClient.ts`)
- Production auto-fetch on map centre change
- T-junction detection (splitting ways at interior nodes)
- Persistent street-exploration cache (AsyncStorage)
- Turn-by-turn navigation UI (ExplorationNudge is a lightweight first step)
- "Alert: unexplored intersection nearby" push notification
