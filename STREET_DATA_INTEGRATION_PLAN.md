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

### Utility helpers (pure, exported, independently testable)

| Function                | Notes                            |
| ----------------------- | -------------------------------- |
| `haversineDistance`     | metres between two lat/lon pairs |
| `bearingBetween`        | 0-360° bearing                   |
| `cardinalDirection`     | N / NE / E … string              |
| `closestPointOnSegment` | projects a point onto a polyline |
| `computeSegmentLength`  | sum of haversine edges           |

### Query methods (on the `StreetDataService` singleton)

#### `get_closest_streets({ numResults?, comparisonPoint?, filter? })`

Returns up to `numResults` streets sorted by distance. `comparisonPoint` defaults to the current
GPS location. `filter` limits results to explored or unexplored segments only.

#### `get_closest_intersections({ numResults?, comparisonPoint?, filter? })`

Same contract but over intersections. Returned objects include both street-name pairs and GPS
coords of the node.

#### `get_shortest_loop({ maxDistanceMiles? })`

Uses the **always-turn-right** heuristic to trace a loop:

1. Project current location onto the nearest segment.
2. Walk to the nearer intersection.
3. At each intersection, choose the exit whose bearing is the **rightmost** turn
   (formula: sort by `((exitBearing − inBearing − 90 + 720) % 360)` ascending).
4. Stop when we return to the starting intersection (success) or hit a dead end /
   exceed `maxDistanceMiles` (error).

Edge cases handled:

- **Dead end** — intersection with only the segment we arrived on → `error: 'dead_end'`
- **Max distance** — cumulative metres exceeds limit → `error: 'max_distance_exceeded'`
- **No streets loaded** — returns `success: false` immediately

### Bulk helpers

- `markPathAsExplored(path)` — scans every point in a GPS path, batch-dispatches explored IDs
- `fetchAndStore(centre, radiusMiles)` — hits Overpass, parses, dispatches `loadStreetData`
- `getSampleStreetData()` — static 3×3 grid fixture centred on Eugene South Hills

---

## 5. Test-Data Integration

### `src/utils/performanceTestData.ts`

New exported function `generateStreetAlignedTestData(count, streetData, options)`:

- Projects the starting point onto the nearest segment.
- Walks the street graph, choosing random (or prefer-unexplored) exits at intersections.
- Emits one `GeoPoint` every `intervalSeconds` spaced ~15 m apart along the polyline.

### `src/utils/injectPerformanceTestData.ts`

`generateSpatialPath` gains a branch: when `state.street.preferStreets` is `true` **and** street
data is loaded, it delegates to `generateStreetAlignedTestData` and, after injection, calls
`markPathAsExplored` so the streetSlice stays in sync.

---

## 6. Developer Menu — `SettingsDeveloperView.tsx`

New "Street Navigation" section after the Performance Testing panel:

| Control                    | testID                     | Behaviour                               |
| -------------------------- | -------------------------- | --------------------------------------- |
| Prefer Streets toggle      | `prefer-streets-toggle`    | dispatches `setPreferStreets`           |
| Prefer Unexplored toggle   | `prefer-unexplored-toggle` | dispatches `setPreferUnexplored`        |
| Load Sample Streets button | `load-sample-streets`      | loads the static 3×3 grid               |
| Info text                  | `street-info-loaded`       | shows _"Streets: N loaded, N explored"_ |

---

## 7. Testing Matrix

| Layer          | File(s)                                 | What is verified                                                                                                                    |
| -------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Unit — types   | `street.test.ts`                        | All interfaces compile; runtime shape checks                                                                                        |
| Unit — slice   | `streetSlice.test.ts`                   | All reducers, initial state, explored tracking                                                                                      |
| Unit — service | `StreetDataService.test.ts`             | haversine, bearing, closest-point projection, `findClosestStreets`, `findClosestIntersections`, `findShortestLoop` with sample grid |
| Integration    | `StreetDataService.integration.test.ts` | Service ↔ real Redux store; filter round-trips; markPathAsExplored                                                                 |
| E2E (Maestro)  | `street-navigation-test.yaml`           | Full dev-tool flow: load streets → toggle prefs → inject data → verify explored count                                               |

---

## 8. Follow-ups (out of scope)

- Production auto-fetch on map centre change
- T-junction detection (splitting ways at interior nodes)
- Persistent street-exploration cache (AsyncStorage)
- "Guide me to nearest street" navigation UI
- "Alert: unexplored intersection nearby" push notification
