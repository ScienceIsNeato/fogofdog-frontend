# Street Data Integration Plan

## Executive Summary

This document outlines the plan to integrate street-level data into the Fog of Dog application, transforming it from a simple GPS-based exploration app into a true neighborhood exploration platform with street-aware navigation and tracking.

## Investigation Results

### react-native-maps Analysis

**Capabilities:**

- Provides map rendering and visualization (Google Maps, Apple Maps)
- Supports markers, polygons, polylines, and overlays
- Handles map gestures and region changes
- Does NOT expose street-level data, road networks, or routing information

**Conclusion:** react-native-maps is insufficient for street-level data integration. We need an external data source.

### OpenStreetMap (OSM) Integration Strategy

**Selected Approach: Overpass API**

The Overpass API is ideal for our use case because:

- **Free and Open Source**: No API keys or usage limits for reasonable usage
- **Query-Based**: Can fetch streets and intersections within a bounding box
- **Structured Data**: Provides detailed metadata (street names, types, coordinates)
- **Real-Time**: No need to download large datasets
- **Flexible Filters**: Can filter by road type (residential, primary, secondary, etc.)

**API Endpoint:** `https://overpass-api.de/api/interpreter`

**Alternative Considered:**

- OSRM (Open Source Routing Machine): Better for routing, but overkill for our initial needs
- OSM Data Extracts: Requires local database, too heavyweight
- Nominatim: Better for geocoding, less suitable for road network queries

## Architecture Overview

### Data Flow

```
1. User Location (GPS) → StreetDataService
2. StreetDataService → Overpass API (fetch nearby streets/intersections)
3. Overpass API → Structured Street Data
4. Street Data → Redux Store (streetSlice)
5. Redux Store → Performance Test Data Generator
6. Redux Store → UI Components (Developer Menu, Map Overlays)
```

### Component Hierarchy

```
src/
├── types/
│   └── street.ts                    # NEW: Street data type definitions
├── services/
│   └── StreetDataService.ts         # NEW: Core street data logic
├── store/
│   └── slices/
│       └── streetSlice.ts           # NEW: Redux state management
├── utils/
│   ├── performanceTestData.ts       # UPDATED: Use street-based paths
│   └── injectPerformanceTestData.ts # UPDATED: Inject street-aware data
└── components/
    └── UnifiedSettingsModal/
        └── SettingsDeveloperView.tsx # UPDATED: Add street toggles
```

## Detailed Implementation Plan

### Phase 1: Type Definitions (src/types/street.ts)

**Data Structures:**

```typescript
// Core street segment representation
export interface StreetSegment {
  id: string; // OSM way ID
  name: string; // Street name (e.g., "Main St")
  type: StreetType; // Road classification
  coordinates: GeoPoint[]; // Array of points forming the segment
  isExplored: boolean; // Whether user has traveled this segment
  exploredAt?: number; // Timestamp when first explored
}

// Street intersection (where 2+ streets meet)
export interface StreetIntersection {
  id: string; // Unique identifier
  location: GeoPoint; // Intersection center point
  streetNames: string[]; // Names of intersecting streets (2+)
  streetIds: string[]; // IDs of intersecting street segments
  isExplored: boolean; // Whether user has visited
  exploredAt?: number; // Timestamp when first explored
}

// Road classification based on OSM highway types
export enum StreetType {
  Residential = 'residential', // Local neighborhood streets
  Primary = 'primary', // Major roads
  Secondary = 'secondary', // Secondary roads
  Tertiary = 'tertiary', // Connecting roads
  Path = 'path', // Walking/hiking paths
  Track = 'track', // Unpaved roads
}

// Result from get_closest_streets
export interface ClosestStreetResult {
  street: StreetSegment;
  distance: number; // Distance in meters
  direction: string; // Cardinal direction (N, NE, E, etc.)
  bearing: number; // Bearing in degrees (0-359)
}

// Result from get_closest_intersections
export interface ClosestIntersectionResult {
  intersection: StreetIntersection;
  distance: number; // Distance in meters
  direction: string; // Cardinal direction
  bearing: number; // Bearing in degrees
}

// Loop path result from get_shortest_loop
export interface LoopPath {
  segments: StreetSegment[]; // Ordered street segments
  totalDistance: number; // Total distance in meters
  estimatedTime: number; // Estimated time in minutes
  turns: TurnInstruction[]; // Turn-by-turn directions
  isPossible: boolean; // Whether loop is feasible
  reason?: string; // If not possible, why
}

// Turn instruction for navigation
export interface TurnInstruction {
  location: GeoPoint;
  instruction: string; // "Turn left on Main St"
  direction: 'left' | 'right' | 'straight';
  streetName: string;
}
```

### Phase 2: StreetDataService (src/services/StreetDataService.ts)

**Core Methods:**

#### 1. `fetchStreetsInBoundingBox()`

- Query Overpass API for streets within a bounding box
- Parse OSM data into StreetSegment objects
- Cache results to minimize API calls
- Handle rate limiting and errors gracefully

**Overpass Query Example:**

```
[out:json];
(
  way["highway"]["name"]({{bbox}});
);
out geom;
```

#### 2. `fetchIntersectionsInBoundingBox()`

- Query Overpass API for intersections (nodes where ways meet)
- Parse into StreetIntersection objects
- Link to parent street segments

#### 3. `getClosestStreets(numResults = 1, comparisonPoint?, filters?)`

- Calculate distances from comparison point to all cached streets
- Apply exploration filters (explored/unexplored)
- Sort by distance
- Return top N results with direction and bearing

**Distance Calculation:**

- Use Haversine formula for point-to-line distance
- Calculate bearing using atan2

#### 4. `getClosestIntersections(numResults = 1, comparisonPoint?, filters?)`

- Similar to getClosestStreets but for intersections
- Filter by exploration status
- Return sorted results with metadata

#### 5. `getShortestLoop(maxDistanceMiles = 3, direction = 'right')`

- Implement "always turn right/left" algorithm
- Start from current location
- Follow adjacent streets, always choosing specified direction
- Detect dead ends (return isPossible: false)
- Detect loops exceeding max distance
- Calculate total distance and estimated time

**Algorithm:**

```
1. Find closest street to current location
2. Start traversing in a direction
3. At each intersection:
   - If direction === 'right': choose rightmost street
   - If direction === 'left': choose leftmost street
4. Track visited intersections to detect when we return to start
5. Stop if:
   - Back at starting point (success)
   - Dead end encountered (failure)
   - Distance exceeds max (failure)
```

### Phase 3: Redux State Management (src/store/slices/streetSlice.ts)

**State Structure:**

```typescript
interface StreetState {
  streets: Record<string, StreetSegment>; // Indexed by ID
  intersections: Record<string, StreetIntersection>; // Indexed by ID
  exploredStreetIds: string[]; // IDs of explored streets
  exploredIntersectionIds: string[]; // IDs of explored intersections
  lastFetchTimestamp: number; // Cache invalidation
  isLoading: boolean;
  error: string | null;
}
```

**Actions:**

- `fetchStreetsRequest` / `Success` / `Failure`
- `markStreetExplored(streetId, timestamp)`
- `markIntersectionExplored(intersectionId, timestamp)`
- `bulkMarkExplored(streetIds[], intersectionIds[])`
- `resetExplorationData()`

**Logic for Marking as Explored:**

- When user's GPS path crosses a street segment → mark street as explored
- When user gets within 10m of intersection → mark intersection as explored
- Use point-in-polygon / distance calculations

### Phase 4: Performance Test Data Integration

**Update `src/utils/performanceTestData.ts`:**

1. Add new test pattern: `STREET_BASED_WALK`
2. Generate paths that follow actual street networks
3. Use StreetDataService to:
   - Fetch streets in target area (Eugene South Hills)
   - Generate realistic walking paths along streets
   - Add slight GPS noise/deviation (realistic GPS drift)

**Update `src/utils/injectPerformanceTestData.ts`:**

1. Add option: `preferStreets: boolean`
2. If enabled, generate data using street-based paths
3. Mark streets/intersections as explored based on injected data
4. Ensure no GPS points fall off street network

**Implementation:**

```typescript
// Generate path along streets
const generateStreetBasedPath = async (
  count: number,
  startLocation: GeoPoint
): Promise<GeoPoint[]> => {
  const streetService = StreetDataService.getInstance();

  // Fetch nearby streets
  const bbox = calculateBoundingBox(startLocation, radiusKm);
  await streetService.fetchStreetsInBoundingBox(bbox);

  // Pick random connected streets
  // Interpolate points along street segments
  // Add GPS noise for realism

  return pathPoints;
};
```

### Phase 5: Developer Menu Integration

**Update `src/components/UnifiedSettingsModal/SettingsDeveloperView.tsx`:**

Add two new toggles:

1. **Prefer Streets** (preferStreets: boolean)

   - Description: "Generate test data along actual streets"
   - Default: false
   - Persisted in DeveloperSettingsService

2. **Prefer Unexplored Territory** (preferUnexplored: boolean)
   - Description: "Prioritize unexplored streets in test data"
   - Default: false
   - Only enabled if Prefer Streets is enabled

**UI Flow:**

```
Developer Settings
├── Show Onboarding [Toggle]
├── Prefer Streets [Toggle]
│   └── Prefer Unexplored Territory [Toggle] (conditional)
└── Performance Testing Panel
```

### Phase 6: Testing Strategy

#### Unit Tests

**`src/services/__tests__/StreetDataService.test.ts`:**

- Test Overpass API query generation
- Test parsing of OSM data
- Test distance calculations (Haversine)
- Test bearing calculations
- Test `getClosestStreets` with filters
- Test `getClosestIntersections` with filters
- Test `getShortestLoop` algorithm
  - Success case: valid loop
  - Failure case: dead end
  - Failure case: exceeds max distance
- Mock Overpass API responses

**`src/store/slices/__tests__/streetSlice.test.ts`:**

- Test state initialization
- Test marking streets as explored
- Test marking intersections as explored
- Test filtering explored/unexplored
- Test cache invalidation

**`src/utils/__tests__/performanceTestData.test.ts`:**

- Test street-based path generation
- Test that generated points stay on streets
- Test GPS noise/deviation is realistic

#### Integration Tests

**`src/services/__tests__/StreetDataService.integration.test.ts`:**

- Test actual Overpass API calls (with test data)
- Test caching behavior
- Test rate limiting handling
- Test error recovery

**`src/utils/__tests__/injectPerformanceTestData.integration.test.ts`:**

- Test end-to-end injection with street preference
- Verify streets are marked as explored correctly
- Verify intersections are detected and marked

#### Maestro E2E Test

**`.maestro/street-based-navigation.yaml`:**

```yaml
appId: com.fogofdog.app
---
# Test street-based navigation features

# 1. Open app and navigate to developer menu
- launchApp
- tapOn: 'Settings'
- tapOn: 'Developer Settings'

# 2. Enable street preferences
- tapOn: 'Prefer Streets'
- assertVisible: 'Prefer Streets.*enabled'
- tapOn: 'Prefer Unexplored Territory'
- assertVisible: 'Prefer Unexplored Territory.*enabled'

# 3. Inject street-based test data
- tapOn: 'Back'
- tapOn: 'Performance Testing'
- tapOn: 'Clear All Data'
- tapOn: 'Inject Real-Time Data'
- inputText: '100' # 100 points
- tapOn: 'Inject'
- waitForAnimationToEnd

# 4. Verify GPS points are on streets
- tapOn: 'Map'
# Visual validation: all GPS points should align with streets

# 5. Test get_closest_streets API
# (This would be done via console/debug output)

# 6. Test get_closest_intersections with filters
# Verify explored intersections are marked correctly

# 7. Test get_shortest_loop
# Generate a loop, verify it returns to start
```

**Visual Validation Test:**

- Capture screenshot after data injection
- Analyze GPS path overlay
- Ensure path follows street network
- Flag any points > 20m from nearest street

## Data Caching Strategy

### Cache Layers

1. **In-Memory Cache** (Redux store)

   - Streets and intersections for current viewport
   - Invalidate when user moves > 1km
   - LRU eviction if memory exceeds threshold

2. **Persistent Cache** (AsyncStorage)
   - Cache recent Overpass API responses
   - Key: `street_cache_{lat}_{lon}_{radius}`
   - TTL: 7 days (streets rarely change)
   - Max size: 10 MB

### Cache Invalidation

- **Time-based:** 7 days
- **Location-based:** User moves > 1km from last fetch center
- **Manual:** Developer menu option to clear cache

## Error Handling

### API Failures

1. **Network Errors:**

   - Retry with exponential backoff (3 attempts)
   - Fall back to cached data if available
   - Show user-friendly error message

2. **Rate Limiting:**

   - Respect Overpass API rate limits (10 requests/minute)
   - Queue requests if limit exceeded
   - Use local cache aggressively

3. **Invalid Data:**
   - Validate all OSM responses
   - Skip malformed street segments
   - Log errors for debugging

### Edge Cases

1. **No Streets Found:**

   - User in remote area with no mapped streets
   - Fall back to coordinate-based exploration
   - Show message: "No street data available in this area"

2. **GPS Drift:**

   - Filter out GPS points with low accuracy
   - Snap to nearest street if within 50m
   - Don't mark street as explored if confidence < 0.7

3. **Dead Ends in Loop Algorithm:**
   - Return `isPossible: false` with reason
   - Suggest alternative directions
   - Show message: "No loop possible from current location"

## Performance Considerations

### API Call Optimization

- **Batch Requests:** Fetch large bounding box at once
- **Preemptive Fetching:** Load streets ahead of user's direction
- **Debouncing:** Don't refetch on every location update

### Rendering Optimization

- **Viewport Culling:** Only render streets in current map viewport
- **Level of Detail:** Simplify street geometries when zoomed out
- **Lazy Loading:** Load intersection data on demand

### Memory Management

- **LRU Cache:** Evict least recently used streets
- **Polygon Simplification:** Reduce coordinate precision for distant streets
- **WeakMaps:** Use for temporary data structures

## Migration Strategy

### Phase 1: Foundation (Week 1)

- Implement types and StreetDataService
- Add basic Overpass API integration
- Create streetSlice

### Phase 2: Core Features (Week 2)

- Implement get_closest_streets
- Implement get_closest_intersections
- Add exploration tracking

### Phase 3: Advanced Features (Week 3)

- Implement get_shortest_loop
- Integrate with performance test data
- Add developer menu toggles

### Phase 4: Testing & Polish (Week 4)

- Write comprehensive unit tests
- Create integration tests
- Develop Maestro E2E tests
- Performance optimization
- Bug fixes

## Success Criteria

### Functional Requirements

- [ ] Streets and intersections can be fetched from Overpass API
- [ ] Streets are correctly marked as explored when user traverses them
- [ ] `get_closest_streets` returns accurate results with filters
- [ ] `get_closest_intersections` returns accurate results with filters
- [ ] `get_shortest_loop` generates valid loops or correctly identifies impossibility
- [ ] Performance test data can be generated along streets
- [ ] Developer menu toggles work as expected

### Quality Requirements

- [ ] Unit test coverage > 80% for new code
- [ ] All integration tests pass
- [ ] Maestro E2E test validates end-to-end flow
- [ ] No API calls during offline mode
- [ ] Cache hit rate > 70% for street data
- [ ] CI pipeline passes all checks

### Performance Requirements

- [ ] API response time < 2s for typical bounding box
- [ ] Street rendering doesn't degrade map framerate
- [ ] Memory usage stays under 50 MB for street data

## Security & Privacy

### API Security

- No authentication required for Overpass API
- Use HTTPS for all requests
- Don't expose API keys (none needed)

### User Privacy

- Street data is fetched based on location, but not shared
- No tracking of user's street exploration outside app
- All data stored locally

## Future Enhancements

### Beyond Initial Implementation

1. **Street-Based Achievements:**

   - "Explored every street in your neighborhood"
   - "Visited 100 intersections"
   - "Completed a 5-mile loop"

2. **Guided Tours:**

   - "Complete this historic walking route"
   - Turn-by-turn navigation to unexplored areas

3. **Social Features:**

   - Share favorite walking loops
   - Compare street exploration with friends

4. **Offline Mode:**

   - Download street data for offline use
   - Background sync when online

5. **Advanced Routing:**
   - Integrate OSRM for shortest path calculations
   - Avoid busy streets
   - Prefer scenic routes

## Appendix A: Overpass API Queries

### Fetch Streets in Bounding Box

```
[out:json];
(
  way["highway"~"^(residential|primary|secondary|tertiary|path|track)$"]
      ["name"]
      ({{south}},{{west}},{{north}},{{east}});
);
out geom;
```

### Fetch Intersections in Bounding Box

```
[out:json];
(
  node({{south}},{{west}},{{north}},{{east}});
  way["highway"](bn);
);
out geom;
```

### Response Format Example

```json
{
  "elements": [
    {
      "type": "way",
      "id": 123456789,
      "tags": {
        "name": "Main Street",
        "highway": "residential"
      },
      "geometry": [
        { "lat": 44.0462, "lon": -123.0236 },
        { "lat": 44.0463, "lon": -123.0235 }
      ]
    }
  ]
}
```

## Appendix B: Distance Calculations

### Haversine Formula (Point to Point)

```typescript
const haversineDistance = (p1: GeoPoint, p2: GeoPoint): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (p1.latitude * Math.PI) / 180;
  const φ2 = (p2.latitude * Math.PI) / 180;
  const Δφ = ((p2.latitude - p1.latitude) * Math.PI) / 180;
  const Δλ = ((p2.longitude - p1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
```

### Point to Line Distance

```typescript
const pointToLineDistance = (point: GeoPoint, lineStart: GeoPoint, lineEnd: GeoPoint): number => {
  // Project point onto line segment
  // Calculate perpendicular distance
  // Return minimum distance to segment
};
```

### Bearing Calculation

```typescript
const calculateBearing = (from: GeoPoint, to: GeoPoint): number => {
  const φ1 = (from.latitude * Math.PI) / 180;
  const φ2 = (to.latitude * Math.PI) / 180;
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);

  return ((θ * 180) / Math.PI + 360) % 360; // Normalize to 0-359
};
```

## Appendix C: Cardinal Direction Mapping

```typescript
const bearingToDirection = (bearing: number): string => {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index] || 'N';
};
```

## Conclusion

This integration plan provides a comprehensive roadmap for adding street-level data to Fog of Dog. By leveraging OpenStreetMap's Overpass API, we can transform the app from a simple GPS tracker into an intelligent neighborhood exploration platform that understands streets, intersections, and navigation patterns.

The phased approach ensures we build a solid foundation before adding advanced features, and the comprehensive testing strategy ensures reliability and quality.
