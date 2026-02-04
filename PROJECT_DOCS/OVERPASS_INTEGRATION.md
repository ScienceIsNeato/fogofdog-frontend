# Overpass API Integration

Street geometry for FogOfDog is sourced from **OpenStreetMap** via the
**[Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)** — a
read-only query interface to the OSM planet database.

---

## Why Overpass?

| Consideration           | Decision                                                                 |
| ----------------------- | ------------------------------------------------------------------------ |
| **Map-tile limitation** | `react-native-maps` renders tiles but does **not** expose street geometry in its JS API |
| **Cost**                | Overpass is free; no API key required                                    |
| **Coverage**            | Global, community-maintained street data                                 |
| **Offline needs**       | Responses can be cached locally or bundled as fixtures                   |

---

## Query Shape

Streets within a radius:

```overpassql
[out:json][timeout:25];
(
  way["highway"~"^(residential|primary|secondary|tertiary|unclassified|living_street|service)$"]
    (around:<radius_m>,<lat>,<lon>);
);
out geom;
```

> **Key detail:** `out geom;` inlines every node's lat/lon so we never need a
> separate `/node` lookup.

### Highway Types

The `highway` tag values we query correspond to the **OSM Highway Key**:

| Value            | Meaning                                     |
| ---------------- | ------------------------------------------- |
| `motorway`       | Major divided highway (limited access)      |
| `motorway_link`  | Highway ramps                               |
| `primary`        | Major arterial roads                        |
| `secondary`      | Collector roads                             |
| `tertiary`       | Minor through roads                         |
| `residential`    | Residential streets                         |
| `unclassified`   | Minor public roads without classification   |
| `service`        | Access roads (driveways, parking, alleys)   |
| `living_street`  | Low-speed residential shared-space          |
| `pedestrian`     | Pedestrian-only ways                        |
| `footway`        | Designated foot paths                       |
| `cycleway`       | Designated cycle paths                      |
| `track`          | Unpaved rural roads                         |
| `path`           | Generic walking / cycling paths             |

**Canonical reference:** <https://wiki.openstreetmap.org/wiki/Key:highway>

---

## API Endpoint

- **URL:** `https://overpass-api.de/api/interpreter`
- **Method:** `POST` with `data=<query>` form body
- **Rate limits:** Fair-use; not formally defined. ~10 000 requests/day typical limit before throttling.

### Mirror Instances

If the primary endpoint is overloaded:

- `https://overpass.kumi.systems/api/interpreter`
- `https://lz4.overpass-api.de/api/interpreter`

---

## Code Location

All network access lives in **`src/services/OverpassClient.ts`**:

| Export                | Responsibility                                |
| --------------------- | --------------------------------------------- |
| `fetchStreetGraph()`  | Fetches + parses response, returns `{ segments, intersections }` |
| Internal cache        | In-memory LRU (max 50 entries, 5-minute TTL)  |
| Retry logic           | Exponential back-off (1 s → 2 s → 4 s)        |

The client does **not** touch Redux; callers dispatch results themselves.

---

## Caching Strategy

1. **In-memory cache** — keyed on `(lat, lon, radius)`. TTL = 5 minutes.
2. **Sample data fixture** — `getSampleStreetData()` in `StreetDataService.ts`
   returns a static 3×3 grid for dev tools and CI without network.
3. **(Future) AsyncStorage** — persist street cache for true offline support.

---

## Known Limitations & Risks

| Issue                            | Impact                                          | Mitigation                               |
| -------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| **Network dependency**           | App needs connectivity for initial fetch        | Bundle sample grid; cache aggressively   |
| **Fair-use rate limits**         | Heavy usage could be throttled                  | Only fetch on explicit user action (dev tool) or map-centre change (future) |
| **Data freshness**               | OSM data can lag reality by days/weeks          | Acceptable for exploration app           |
| **Response size**                | Large radius → large payload                    | Cap radius; paginate or stream (future)  |
| **Schema changes**               | OSM tags are community-defined; could evolve    | Pin to known `highway` values; monitor OSM changelog |

---

## Future Work

- **Offline-first production:** auto-fetch on map-centre shift, cache in AsyncStorage.
- **Streaming / pagination:** for very large bounding boxes.
- **Alternative sources:** Google Roads API (paid), Mapbox Vector Tiles.

---

## Related Files

| File                              | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `src/services/OverpassClient.ts`  | Network fetch + cache                        |
| `src/services/StreetDataService.ts` | Pure query functions over cached data       |
| `src/types/street.ts`             | Type definitions (see header docblock)       |
| `src/store/slices/streetSlice.ts` | Redux state for exploration tracking         |
