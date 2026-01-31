Understood. I’ll create a comprehensive technical plan for transitioning to a canvas-based fog rendering system anchored to the map using Skia within your current React Native + Expo environment.

The plan will include:

- A detailed rationale for the change
- A safe and minimal-step-by-step implementation path using TDD principles
- Integration guidelines tailored to your existing codebase
- Voluminous code stubs and examples to help an agent implement it with minimal oversight
- A backup plan using an alternative rendering method if Skia proves unsuitable

I'll begin the deep research and development of this plan now and will let you know when it's ready.

# Refactoring the Fog Rendering System – Technical Plan

## Background: Current Fog-of-War Implementation and Challenges

In the current **Fog of Dog** game, the map is covered by an opaque fog layer with circular “holes” punched out along the player’s path. This is implemented using a large **`<Polygon>`** in **react-native-maps** that covers the map, combined with an array of circular hole polygons at explored locations. Each time a new GPS coordinate is recorded, a circle of \~50m radius (approximated by a polygon) is added as a hole in the fog. While this approach works, it has several drawbacks:

- **Performance and Memory:** As the explored path grows, the number of hole polygons increases. Each hole can have dozens of vertices to approximate a circle. Dozens or hundreds of such holes (each with \~16–32 vertices) yield thousands of vertices for the map to render. This can tax the map component and even lead to crashes on low-memory devices. In one case, rendering a polygon with \~12k vertices caused app crashes due to memory usage. Our current method risks similar issues as more areas are explored.
- **Visual Gaps:** The use of discrete circles means the revealed path might have small gaps if consecutive GPS points are more than 2×radius apart. It’s difficult to achieve a smoothly connected thick path with separated circular holes.
- **Map Anchor Issues:** The fog polygon must move with the map. The current implementation recenters the fog polygon periodically around the user’s location, but if the user quickly pans/zooms the map, the fog layer can appear to “drift” or lag before re-centering. Also, on iOS with Apple Maps, a known bug prevents polygon holes from updating reliably when the polygon’s coordinates change, causing inconsistencies. We need a solution that ensures the fog stays perfectly locked to the map beneath at all times.
- **Maintainability:** The logic for generating circular polygons and managing them in Redux (via an `exploredAreas` array with {latitude, longitude, radius}) is complex. It’s hard to extend (for example, drawing a continuous custom-shaped trail or adjusting radius dynamically would require significant geometry calculations). Testing this in isolation is also tricky, as it’s tightly coupled to the map’s rendering.

Given these challenges, a more efficient and flexible approach is needed. The goal is to **refactor the fog rendering to use a canvas-based technique** that draws the explored path as a continuous thick stroke and uses a **mask** to cut that path out of a full-screen fog overlay. This will address performance by offloading work to a GPU-accelerated canvas, improve visual continuity, and ensure easier maintainability and extensibility.

## Objectives for the New Fog System

Our refactored fog-of-war system will meet the following requirements (while respecting existing constraints):

- **Anchored Fog Overlay:** The fog layer must remain perfectly aligned with the map. As the user pans or zooms, the fog (and the “holes” revealing the map) should scroll and scale exactly with the underlying map tiles – no drifting or lag.
- **Continuous Path Reveal:** Instead of many circular holes, we will render a thick stroke following the user’s GPS path. This stroke (with \~50 m width) will produce a continuous “trail” of visibility on the map, matching what the circular holes approximated.
- **Negative Space Masking:** We’ll implement the fog as a fullscreen semi-transparent overlay from which the path area is **subtracted**. In other words, the path will act as a mask that makes those pixels fully transparent, revealing the map beneath. This inverse masking technique is crucial for the fog-of-war effect.
- **Performance:** The solution must be efficient. Drawing updates (adding new path segments or moving the map) should be smooth (60 FPS) even for long paths. GPU acceleration and minimal main-thread work are priorities. The approach should handle thousands of path points without freezing or memory leaks.
- **Testability and Maintainability:** We want a clean separation of concerns. Business logic (like storing GPS points and converting coordinates) should be unit-testable in isolation. The rendering layer should be as simple as possible and decoupled from data storage. We will adopt a **TDD strategy**, writing tests for key logic (Redux reducers, coordinate transforms, etc.) before implementing, to ensure correctness.
- **Future Extensibility:** While we won’t implement data persistence to backend/local storage now, the design must accommodate it. The GPS path layer should have an abstraction (e.g. a single source of truth for path data, perhaps accessed via a module or Redux slice) that we can later extend to load/save from a server or database. Also, the design should be flexible for future features (e.g. varying path width or “fog skins” overlay) without requiring a complete rewrite.

**Constraints:** We will **not** change the map library or eject from Expo. We’ll continue using **react-native-maps** (with AWS Location/MapLibre under the hood) for map display. The solution must work in the **Expo managed workflow**, so any drawing library must be compatible with Expo’s native modules. The implementation should not persist data yet (path lives in-memory), but it will be structured to add persistence easily later. We’ll also avoid any drastic changes to unrelated parts of the codebase – the focus is a drop-in improvement to the fog system, keeping other systems (Redux, map usage, etc.) intact.

## Rationale for a Canvas + Mask Approach (Skia)

After researching possible approaches, a **canvas-based rendering with masking** emerged as the best solution. This is analogous to how 2D games implement fog-of-war – by drawing an overlay and “cutting out” visited areas – but we’ll leverage modern libraries for smooth integration in React Native. Below are the reasons and supporting evidence for this choice:

- **Efficiency of GPU Drawing:** Using a canvas (Skia) allows us to draw the path and overlay using GPU-accelerated graphics, bypassing the overhead of managing many native map polygons via the RN bridge. **Skia** (via the `@shopify/react-native-skia` library) runs high-performance C++ code under the hood, enabling complex drawings at 60 FPS in JavaScript apps. We expect this to handle a long path with thousands of points far more smoothly than updating an ever-growing array of map polygons (which caused RAM spikes and slow renders in RN Maps).
- **Continuous Path Rendering:** With the canvas, we can draw a single continuous **Path** entity for the user’s trail rather than separate shapes. This means perfectly connected segments with a consistent thickness and smooth joins. We can apply stroke styling (e.g. round caps on the path ends, round joins on turns) to make the trail look polished. This directly addresses the gap issues of the old approach.
- **Inverse Masking Capability:** Canvas libraries support advanced compositing. In Skia, we can use a **Luminance Mask** to invert visibility: _“White pixels will be visible and black pixels invisible”_. By drawing a white fullscreen mask and a black path shape, we achieve a “hole” in the fog where the path is (the fog overlay will be invisible where the path goes). This technique was confirmed in an RN Skia discussion: the developer achieved a cut-out effect by using a `Mask` with `mode="luminance"`, a white fill, and a black shape for the hole. This is exactly what we need – effectively the path will punch through the fog.
- **Smooth Map Integration:** We will overlay the Skia canvas on top of the map view. By updating the canvas drawing in sync with map movements, the fog will stay locked to map coordinates. We can convert geo-coordinates to screen coordinates for the current map view, so the drawn path aligns with the map’s roads and features exactly. This gives us fine-grained control. (In contrast, the old polygon was tied to geo-coords inherently, but as noted, updating it had cross-platform quirks. Our approach will manually handle coordinate transforms to avoid such issues.)
- **Expo Compatibility:** The `@shopify/react-native-skia` library is supported in Expo (it’s listed as a compatible third-party library). This means we can add Skia without ejecting. Alternately, if Skia were not available, we considered **React Native SVG** (also Expo-compatible) as a fallback to achieve similar results with an `<Svg>` overlay and mask. Having a backup plan is prudent, but Skia is preferred for performance.
- **Lessons from Other Apps/Games:** The concept of “revealing a map as you move” has been used in apps like _Fog of World_ (a popular exploration tracker) and many video games. _Fog of World_’s long-term success suggests the importance of an efficient data structure and rendering method for potentially huge path data. Indeed, the Fog of World developer mentioned highly optimized data storage for lifetime travel tracks. Our plan won’t implement that level of optimization yet, but by moving to a single continuous path model, we’re aligning with the approaches used in such apps (which typically treat the path as a polyline and use graphics APIs to render it). In game development, fog-of-war is often done by rendering the world to a texture and using a mask layer for fog – our approach is conceptually similar (treating the map view as the “world” and a canvas mask as the fog layer).
- **Maintainability & Extensibility:** The new approach will simplify the code structure: instead of managing an array of circles and a complex polygon state, we’ll maintain just a path (list of coordinates) in state. The rendering component will be self-contained (draw the fog and path mask), and the conversion logic can be isolated for testing. Future changes, such as altering the fog’s appearance or saving the path, will be easier. For example, adjusting the path width dynamically (for faster movement) could be done by changing a stroke width parameter, rather than recalculating different-sized circle polygons. Likewise, persisting the path simply means syncing that list of coordinates to storage periodically.

In summary, moving to a Skia-based canvas overlay with an inverted mask addresses our key goals. It leverages proven graphical techniques and libraries for a smoother, more scalable fog-of-war implementation. Next, we’ll detail how we will implement this solution and provide a fallback alternative if needed.

## Solution Overview: Skia Canvas Fog Overlay

### Anchoring the Fog to Map Coordinates

To ensure the fog overlay moves and zooms exactly with the map, we will overlay a Skia canvas that _tracks the map’s coordinate system_. Concretely, we’ll do the following:

- **Overlay Setup:** In the UI, the Map screen will contain the `MapView` (from `react-native-maps`) and _above it_ a new **`FogOverlay`** component. The `FogOverlay` will use a `<Canvas>` from Skia, styled to absolutely fill the same area as the map. We will set its pointer events to **none** so that it doesn’t block map touches (allowing the user to pan/zoom through it).
- **Coordinate Conversion:** The core trick is converting geographic coordinates (latitude/longitude) into the canvas’s pixel coordinates. React-native-maps provides the current map region (center lat/long, latDelta, lonDelta, etc.) whenever the view changes. Using this, we can calculate how many screen pixels correspond to a degree of latitude and longitude. For small regions, a linear approximation works:

  - **Horizontal:** 1 degree of longitude is \~111 km at the equator, but at latitude φ it’s `111km * cos(φ)`. We compute: `meters_per_pixel_horizontal = (lonDelta * 111,320 * cos(centerLat)) / mapWidthPixels`. Similarly, `meters_per_pixel_vertical = (latDelta * 111,320) / mapHeightPixels`. From this we derive how to translate a 50 m real-world radius into pixels. For example, a 50 m radius at the current zoom would be `pixel_radius = 50 / meters_per_pixel_horizontal` (for horizontal scale; we can average with vertical for simplicity or use horizontal for both axes if map aspect ratio is uniform).
  - **Projection Formula (optional):** For more accuracy, especially if we support wide map views, we can use Mercator projection. Skia doesn’t inherently know about map projections, so we can implement a function `project(lat, lon, region) -> (x, y)` using Mercator math:

    ```ts
    const x = ((lon - region.centerLon) / region.lonDelta) * mapWidthPixels;
    const y = ((region.centerLat - lat) / region.latDelta) * mapHeightPixels;
    ```

    (This is a simplification; a full Mercator projection would use `y = log(tan(pi/4 + lat*pi/360))`, but for small deltas the linear approximation is acceptable.)

  - We will create a utility (e.g. `geoToScreen()` in a `MapUtils` module) that takes a GeoPoint and the current region, and returns the pixel `(x,y)` relative to the canvas.

- **Realtime Updates:** We will subscribe to map region changes. Using the MapView’s `onRegionChangeComplete` (or even `onRegionChange` for continuous updates), the `FogOverlay` can recompute the transform for all path points. This will reposition the drawn path so that it stays locked over the correct map locations. Because this is done in JavaScript, we need to be mindful of performance – we will throttle region change handling (e.g. update at most \~30 fps during active gestures) to keep it smooth. Calculating a few hundred points’ new positions is very fast in JS, so this should be feasible. The Skia canvas will redraw the path at its new coordinates each time, giving the illusion that the fog is attached to the moving map.
- **Zoom Scaling:** When the user zooms, the path’s screen width should scale accordingly (so the real-world 50 m width looks consistent). Our coordinate conversion inherently handles scaling for position, but we also need to scale the stroke width of the path. We will compute the stroke pixel width based on current zoom using the meters-per-pixel factor. For instance, if 1 pixel = 2 meters at the current zoom, a 50 m radius corresponds to 25 px stroke radius (50/2). We’ll double that for full stroke _thickness_ (diameter). This calculation will be done each time the region (specifically zoom level) changes. As a result, when you zoom in, the stroke widens in pixels (to still represent 50 m on the map), and when zooming out it narrows, maintaining consistent real-world coverage.

This anchoring strategy ensures **no drift**. The fog overlay is essentially “glued” to the map – whenever the map moves or zooms, we adjust the overlay’s content synchronously. From the user’s perspective, the fog and revealed trail will appear as if they are part of the map itself.

### Rendering the GPS Path as a Thick Stroke

We will maintain the user’s path as an ordered list of GPS coordinates in the Redux state (more on state changes in the next section). The rendering component will take this list of coordinates and draw a thick stroked path through them:

- **Path Data Structure:** Instead of an array of `ExploredArea` circles, we’ll store an array of `GeoPoint` for the path (in order of travel). For example: `path = [ {lat: 41.123, lon: -91.567}, {lat: 41.124, lon: -91.566}, ... ]`. This is essentially the polyline of the user’s movement.
- **Skia Path Creation:** In the Skia canvas, we will construct a `Path` object from these points. Skia’s API allows us to create a path and add line segments. We can do this either via an SVG path string or imperatively:

  ```tsx
  // Pseudocode inside FogOverlay Skia Canvas drawing:
  const skPath = Skia.Path.Make();
  if (points.length > 0) {
    const firstXY = geoToScreen(points[0], currentRegion);
    skPath.moveTo(firstXY.x, firstXY.y);
    for (let i = 1; i < points.length; i++) {
      const { x, y } = geoToScreen(points[i], currentRegion);
      skPath.lineTo(x, y);
    }
  }
  ```

  We will likely use a Skia `useDerivedValue` or similar hook to recompute this `skPath` whenever the points array or map region changes. The result will be a continuous path connecting all visited coordinates.

- **Stroke Styling:** We’ll render this path with a specified stroke width and color, but **not directly visible to the user** (it will act as a mask). We will choose a stroke cap of “round” so that the path’s endpoints are rounded, and possibly round joins to make turns smoother. The stroke width (in pixels) will be computed as described (based on \~100 m full width, i.e. radius 50 m). For example, at a certain zoom it might be 10 px, at another zoom 30 px, etc. We will update this dynamically.
- **Masking vs. Direct Drawing:** It’s important to note that we are _not_ drawing the path in a visible color on the screen. Instead, the path will be drawn into a mask (more in next section). If we _did_ want a visible trail (for debugging or a “trail line” feature), we could draw it in, say, an outline color. In fact, for testing, we might render the path in a semi-transparent bright color initially to verify alignment. But in final implementation, the path’s role is to carve out transparency from the fog overlay.
- **Incremental Updates:** When a new GPS point is added (via Redux action), we do **not** need to redraw the entire path from scratch on the canvas – Skia can reuse the existing path object and append a new segment. However, for simplicity, we may recompute the path each update (the performance impact is minor for moderate path lengths, and Skia is optimized for this). Still, we’ll design the code such that adding a point only triggers a minimal recompute (for instance, we could keep a reference to the Skia Path and call `lineTo()` for the new point, avoiding re-looping all points). This can be an optimization milestone after correctness is confirmed.

By rendering a single thick stroke path, we ensure the revealed area is continuous and smooth. This approach mirrors how one would draw a route on a map, except here it represents the boundary between fog and clear areas.

### Negative Space Masking (Fog Subtraction Technique)

The crux of the visual effect is making the fog overlay cover everything _except_ the path. We achieve this using **negative masking** with Skia:

- **Full-Screen Fog Layer:** We will have a rectangle (or simply use Skia’s `<Fill>` command) that covers the entire canvas with a fog color. This is typically a semi-transparent black or gray (for example, rgba(0,0,0,0.5) for a dark translucent fog). This layer will make the map dim or invisible wherever it covers. In Skia JSX, we can do: `<Rect x={0} y={0} width={canvasWidth} height={canvasHeight} color="black" opacity={0.5} />` as the fog.
- **Mask Definition:** We use the Skia `<Mask>` component to cut a hole in that fog. Skia’s mask can operate in **luminance mode** where white = visible and black = transparent. We will define the mask as a combination of a white fill and the black path:

  ```tsx
  <Mask
    mode="luminance"
    mask={
      <Group>
        <Fill color="white" /> {/* start with all-white mask (show all) */}
        <Path
          path={skPath}
          color="black"
          style="stroke"
          strokeWidth={trailWidth}
          strokeCap="round"
        />{' '}
        {/* draw the path in black */}
      </Group>
    }
  >
    {/* Children here will be masked */}
    <Rect width={W} height={H} color="black" opacity={0.5} />
  </Mask>
  ```

  Let’s unpack this: The mask group first paints the entire area white (meaning by default the fog will be visible everywhere). Then on top of that it paints the path shape in black. In **luminance mask mode**, the resulting mask image has white everywhere except the thick line where the path is (those pixels are black). White areas of the mask let the masked content show, black areas hide it. Since our masked content is the fog rectangle, this means _the fog is drawn everywhere except where the path goes_. The path becomes a transparent tunnel through the fog, revealing the map.

- **Verification:** This approach was verified in a similar context where a developer needed an “inverted mask” (holes in a view) – the solution was exactly to use a white background and black shapes in a luminance mask. We will follow that pattern.
- **Edge Handling:** The path stroke will naturally create a smooth boundary in the mask. We should ensure the stroke width is slightly larger than needed if we want a softer edge (we could also consider a slight blur mask filter for a smoother gradient edge in the future, but likely not needed). Also, by using round stroke caps, the path’s ends will be nicely rounded in the mask rather than cut off abruptly.
- **Multiple Paths (Future):** If we ever needed to mask multiple disjoint shapes (e.g., revealed regions not contiguous with the path), we could draw multiple black shapes in the mask. For now, the player’s path is one continuous line, so one path suffices. If the user _teleports_ (jumps far without continuous tracking), we might have separate segments – in that case we could either still use one Path (with moveTo for a break) or multiple Path components in the mask. Skia mask can handle that easily by just layering shapes (multiple black Paths).
- **Masking with React Native SVG (Fallback concept):** In case we switch to RN SVG, a similar mask can be defined in SVG markup (white rect + black path in a `<Mask>` def, applied to a fog `<Rect>`). The concept remains: white = show overlay, black = cut hole. The specifics differ, but RN-SVG supports masks and even-odd fill rules to achieve holes. This gives us confidence that even outside Skia, the approach is feasible.

Using this masking technique, the visual output will be exactly as desired: the map is initially under a semi-transparent fog; wherever the user has been (their trail), the fog is fully erased, showing the map clearly. The mask approach is efficient as it is all GPU compositing – we are not physically modifying images, just telling the renderer to not draw fog in certain places.

### Performance Considerations and Testing Implications

The combination of Skia canvas and masking should be very performant, but we will still be careful:

- **Rendering Frequency:** The path will update when either (a) a new GPS point is added (occasionally, maybe once every few seconds while moving) or (b) the map view changes (potentially continuously while panning/zooming). Skia is quite optimized for drawing static content; rapid panning means our JS has to churn out new coordinates for the path. We will benchmark this on a device – if it proves expensive with a very long path, we can implement optimizations (like simplifying the path when zoomed out, or only updating at certain frame intervals). However, given a typical device can handle thousands of simple JS operations per frame, reprojecting, say, 500 points 30 times a second (\~15k ops/sec) is reasonable. We will also consider using `requestAnimationFrame` or Skia’s \[useSharedValue + Animation] to offload some work off the JS thread if needed.
- **Memory:** We avoid storing large structures for rendering. The path coordinate list is just an array of {lat, lon}. Even 10,000 points would be manageable in memory. The Skia `Path` object is a lightweight wrapper around native objects. By contrast, the old approach could accumulate many polygon components on the map, which had significant native memory overhead. Also, since we reuse one canvas and one mask, we’re not mounting/unmounting lots of views – it’s a steady state component.
- **Testing Strategy:** We will leverage the improved separation for testing:

  - **Unit Tests:** The coordinate conversion function will be pure; we can feed it a known region and coordinate and assert the expected screen point. For example, if the map is centered at (lat=0, lon=0) with latDelta=0.1, lonDelta=0.1 on a 300x300 px view, a point at the center should convert to (150, 150). We can test edge points similarly. This ensures our math is correct.
  - **Redux Logic Tests:** We will write Jest tests for the Redux slice to ensure that adding a new GPS location updates the path array correctly and doesn’t introduce duplicates. We can simulate stationary updates and moving updates to ensure the logic (e.g. “if exact same lat/lon already exists, skip”) still works or is adjusted for our new data structure.
  - **Component Tests:** We can use React Native Testing Library to render the `FogOverlay` with a fake set of points and a fake region, then inspect that it produces a Skia `Path` of the right length. While we can’t “see” the canvas in a typical test environment, we might expose some helper from `FogOverlay` that returns the computed skPath or the list of screen points, which we can verify. Alternatively, we can do a snapshot test of the component’s JSON tree to ensure the Mask and Path props are set as expected (e.g. the Path has the correct strokeWidth).
  - **Manual & Integration Testing:** On a device/emulator, we will test scenarios: moving in a straight line (does it reveal a continuous bar?), walking in a loop (does the path correctly show a loop of cleared area?), rapid panning (does the fog stick without lag?), zooming in/out (does path width scale correctly?). We will also test on both Android and iOS to ensure parity. The Apple Maps hole bug is sidestepped completely by our custom overlay, but we’ll confirm the Skia view overlays properly on both platforms (Expo should handle that seamlessly).

Next, we detail the step-by-step implementation plan, including how we will phase development with tests (TDD) and highlight important code segments for each part of the system.

## Implementation Plan and Milestones

We will tackle the refactoring in stages, verifying each piece with tests before moving on. Below is a high-level plan with milestones:

1. **Setup and Library Integration** – _Milestone:_ Project is ready to use Skia (or alternative) in the Expo app.

   - Add the `@shopify/react-native-skia` package to the project (`expo install @shopify/react-native-skia`). Since Expo SDK (as of 2025) supports it, this should autolink the native components. Write a quick test component in isolation (e.g. a simple Canvas drawing a circle) to ensure Skia works in development. _Testing:_ Not much to unit test here, but manual verification that the canvas appears on device is needed. If Skia for some reason cannot be used, plan B is to install `react-native-svg` (which Expo also supports) and adjust the approach accordingly. We won’t implement SVG yet, just keep it as fallback if integration fails.

2. **Redux State Refactor for Path Data** – _Milestone:_ Redux store can track the path instead of individual circles.

   - Modify the `explorationSlice` (or equivalent) in the Redux store. Currently it might look like:

     ```ts
     interface ExploredArea { latitude: number; longitude: number; radius: number; }
     interface ExplorationState {
       currentLocation: GeoPoint | null;
       exploredAreas: ExploredArea[];
     }
     // ...
     case updateLocation(newLat, newLon): {
       state.currentLocation = { lat: newLat, lon: newLon };
       if (!state.exploredAreas.find(a => a.latitude === newLat && a.longitude === newLon)) {
         state.exploredAreas.push({ latitude: newLat, longitude: newLon, radius: R });
       }
     }
     ```

     We will change this to maintain a **path array**. For example:

     ```ts
     interface ExplorationState {
       currentLocation: GeoPoint | null;
       path: GeoPoint[];  // sequence of coordinates forming the path
     }
     // Initial state
     const initialState: ExplorationState = {
       currentLocation: null,
       path: []
     };
     // Reducer case
     case updateLocation(newLat, newLon): {
       state.currentLocation = { latitude: newLat, longitude: newLon };
       const prevPoint = state.path[state.path.length - 1];
       if (!prevPoint || (prevPoint.latitude !== newLat || prevPoint.longitude !== newLon)) {
         state.path.push({ latitude: newLat, longitude: newLon });
       }
     }
     ```

     Here we append the new coordinate if it’s not identical to the last one. (We might later consider a distance threshold if GPS jitters). We also remove the `radius` since the path’s thickness is now a rendering concern, not state.

   - Write **unit tests** for this reducer logic. For example: dispatch `updateLocation(41.0, -91.0)` on an empty state – expect `path.length == 1`. Dispatch the same location again – expect no new point added (no duplicate). Dispatch a new location – expect length 2 and that last point matches. Test that `currentLocation` always updates to the latest. These Jest tests ensure our state update logic is correct before we hook it into the UI.
   - **Data Interface for Future Persistence:** At this stage, consider abstracting the path storage behind an interface. For instance, define a simple class or module `PathRepository` with methods like `addPoint(lat, lon)` and `getPath()`. For now, they can just call the Redux actions/selectors. But by coding against this interface in the rest of the app, we prepare for the future where `PathRepository` might save to AsyncStorage or call an API. We might not fully implement this now, but keeping the concept in mind (and perhaps coding the FogOverlay to use a prop or selector for path data) will ease future changes.

3. **Implement the Coordinate Conversion Utility** – _Milestone:_ We have a reliable way to map geo-coordinates to screen pixels.

   - Create a utility function (e.g., `mapUtils.ts` in `frontend/src/utils/`):

     ```ts
     interface MapRegion {
       latitude: number;
       longitude: number;
       latitudeDelta: number;
       longitudeDelta: number;
       width: number;
       height: number;
     }
     function geoPointToPixel(point: GeoPoint, region: MapRegion): { x: number; y: number } {
       const { latitude, longitude } = point;
       const {
         latitude: centerLat,
         longitude: centerLon,
         latitudeDelta,
         longitudeDelta,
         width,
         height,
       } = region;
       // Convert lat to y (flipped vertically: north = up on screen)
       const latDiff = centerLat - latitude;
       const y = (latDiff / latitudeDelta) * height + height / 2;
       // Convert lon to x
       const lonDiff = longitude - centerLon;
       const x = (lonDiff / longitudeDelta) * width + width / 2;
       return { x, y };
     }
     ```

     This assumes the map region’s center corresponds to screen center (which is how `react-native-maps` Region works) and linear scaling. We’ll refine if needed. Also note: This simplified approach doesn’t account for Earth curvature, but over small deltas (when the map is zoomed in relatively close, which is typical for this game), it’s acceptable. If more accuracy is needed, we can incorporate Mercator projection for y as mentioned earlier.

   - Write **unit tests** for this function. We can simulate a known scenario: e.g., center (0,0), region span 0.1°, screen 300x300. Then test that a point exactly at center returns (150,150). Test edges: point at north edge (centerLat + latDelta/2) should map to y=0; point at south edge (centerLat - latDelta/2) -> y=300; similarly for east/west edges of lon. These tests will verify our math. Also test a point like 0.05° east of center (half of lonDelta) gives x≈225 (quarter of screen to the right of center). We should also test with a non-zero center (to ensure offset logic correct).
   - We will use this conversion inside our Skia drawing. Integration testing for this will come when we see the overlay aligning; for now, unit tests give confidence.

4. **Create the FogOverlay Skia Component** – _Milestone:_ A new React component that renders the fog mask on top of the map.

   - In `frontend/src/components/` (or `screens/` if tightly coupled to map screen), create `FogOverlay.tsx`. This will use Skia’s Canvas. Let’s outline its structure:

     ```tsx
     import { Canvas, Mask, Fill, Group, Rect, Path } from '@shopify/react-native-skia';
     import { useSelector } from 'react-redux';
     import { geoPointToPixel } from '../utils/mapUtils';

     const FogOverlay: React.FC<{ mapRegion: MapRegion }> = ({ mapRegion }) => {
       // Select the path of GeoPoints from Redux
       const pathPoints = useSelector((state) => state.exploration.path);
       // Compute the Skia path from geo points:
       const skiaPath = useMemo(() => {
         const p = Skia.Path.Make();
         if (pathPoints.length === 0) return p;
         // Move to first point
         const { x: x0, y: y0 } = geoPointToPixel(pathPoints[0], mapRegion);
         p.moveTo(x0, y0);
         // Draw lines through all points
         for (let i = 1; i < pathPoints.length; i++) {
           const { x, y } = geoPointToPixel(pathPoints[i], mapRegion);
           p.lineTo(x, y);
         }
         return p;
       }, [pathPoints, mapRegion]);
       // Calculate stroke width in pixels for the 50m radius:
       const metersPerPixel =
         (mapRegion.longitudeDelta * 111320 * Math.cos((mapRegion.latitude * Math.PI) / 180)) /
         mapRegion.width;
       const strokeWidthPx = (50 / metersPerPixel) * 2; // 50m radius *2 for full diameter

       return (
         <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
           <Mask
             mode="luminance"
             mask={
               <Group>
                 <Fill color="white" />
                 {/* Draw the path as black stroke for masking */}
                 {pathPoints.length > 0 && (
                   <Path
                     path={skiaPath}
                     color="black"
                     style="stroke"
                     strokeWidth={strokeWidthPx}
                     strokeCap="round"
                     strokeJoin="round"
                   />
                 )}
               </Group>
             }
           >
             {/* Fog overlay rectangle */}
             <Rect
               x={0}
               y={0}
               width={mapRegion.width}
               height={mapRegion.height}
               color="black"
               opacity={0.5}
             />
           </Mask>
         </Canvas>
       );
     };
     ```

     _(Note: This code assumes `mapRegion.width`/`height` are the pixel dimensions of the map view, which we’d set before rendering.)_

   - A few points about this code:

     - We use `useSelector` to get the latest path from Redux. The component will re-render when path updates.
     - We take `mapRegion` as a prop (provided by parent) which contains the current map center/deltas and the view’s pixel size. The parent (MapScreen) will pass this whenever the map region changes (likely storing it in state or using `onRegionChangeComplete` to update).
     - We compute the Skia Path in a memoized way. We could also use Skia’s `useComputedValue`, but since our inputs are plain JS, `useMemo` is fine. We make sure to rebuild when either the path points or region changes.
     - We convert each GeoPoint to pixel (using our utility) and line-to that point.
     - The stroke width is computed from the region’s scale. We used the horizontal meters-per-pixel (which should be fine unless at extreme latitudes). We multiply by 2 because if 50m = radius, the full stroke thickness should cover 100m (diameter). If we interpret 50m as full width already, we’d adjust accordingly. (We will test this by checking if the revealed corridor roughly matches the old 50m radius holes in size on the map).
     - We set the Mask as described: white fill then black path. The `<Fill>` component fills the canvas with white (essentially a white rect covering everything).
     - Inside the Mask, we place the fog rectangle. Its opacity 0.5 means 50% transparent black fog. We can tweak this opacity or color (e.g., maybe a slightly bluish fog for style) – the key is it’s drawn where mask is white.
     - Pointer events are none to allow map interaction through the Canvas.

   - **Testability:** We can add some props or hooks to help test this component. For example, we could export a plain function that given `pathPoints` and `mapRegion` returns the computed `skiaPath` or a list of pixel coordinates (so our unit tests can verify the internal math via the component). However, since we already tested `geoPointToPixel`, and Redux logic, this component’s main risk is integration. We will likely rely on running the app and verifying that, for known test movements, the visuals match expectations. We can simulate a short path by dispatching a few coordinates and then manually check that the Canvas appears with corresponding holes (for instance, if we add points forming a line, we should see a visible line of map uncovered).
   - Write a **snapshot test** for `FogOverlay` rendering: Using React Test Renderer or RTL, feed it some sample props (a small region and a couple of path points). The output tree should contain a `<Mask>` with a `<Path>` child if points exist. We can verify the strokeWidth prop and path presence in the JSON. This at least ensures the component renders without error and uses the correct structure. (Skia components might not render in a typical test environment, so we may need to mock them or just ensure no runtime errors.)

5. **Integrate FogOverlay into MapScreen** – _Milestone:_ The map screen now uses the new fog system instead of polygon holes.

   - Open the `MapScreen.tsx` (which currently sets up the MapView and polygons). We will remove the `<Polygon>` that served as the fog and its `holes` prop. Instead:

     - Keep the `MapView` (likely from `react-native-maps`). Ensure we have a ref or a way to get its dimensions and current region. One way is to use the `onRegionChangeComplete={(region) => setRegion(region)}` to save the region in local state. Also, we can measure the map view to get width/height (or use Dimensions if it’s full-screen).
     - Provide the region and dimensions to the `FogOverlay`. For example:

       ```tsx
       <View style={styles.container}>
         <MapView ... onRegionChangeComplete={r => setRegion(r)}>
           {/* other map children like user marker, etc. */}
         </MapView>
         {region && (
           <FogOverlay mapRegion={{ ...region, width: mapWidth, height: mapHeight }} />
         )}
       </View>
       ```

       We ensure `region` includes the necessary fields (lat, lon, latDelta, lonDelta). `mapWidth/Height` can be obtained via onLayout of the MapView’s parent or using `Dimensions.get("window")` if fullscreen.

     - The FogOverlay will then use this `mapRegion`. When the user pans/zooms, `onRegionChangeComplete` updates the region state, causing FogOverlay to re-render with new props. (We might also use `onRegionChange` for realtime; but onRegionChangeComplete may be enough if the delay is minor. For an absolutely smooth experience, we _could_ tie into `onRegionChange` and update more continuously. However, to start, using the “complete” event keeps updates infrequent and is simpler. We’ll test if any noticeable lag occurs; if it does, we can optimize).
     - Remove any Redux selectors for `exploredAreas` that fed the old polygon. Also remove the old `createCirclePolygon` utility if it’s no longer needed.

   - **Testing:** Now we test the whole system:

     - In the simulator, move the device or simulate location changes. As new points dispatch, confirm the Redux `path` grows and the FogOverlay’s mask updates to reveal those areas. We should see a corridor of map visible along the path traveled.
     - Try panning: drag the map – the fog overlay should move exactly with it. There should be no “white seams” or misalignment between the fog mask and map tiles. If we scroll far, areas with no path should remain covered. If we scroll such that the path goes off-screen, the fog should cover everything on screen (since the black path in the mask is off-canvas, the mask there is all white => fog fully visible). Scroll back, and the revealed path should reappear in the correct place.
     - Try zooming: zoom in/out and ensure the visible path width scales. We can compare the width to what 50m looks like – e.g., zoom in until the scale bar on map indicates 50m, the cleared trail should be about that width. This is a validation of our stroke width calculation.
     - Test on both iOS and Android. On iOS (Apple Maps), the previous hole issue should be moot – we verify that by adding a new point, the mask updates (if not, maybe our FogOverlay isn’t updating – likely a logic bug we’d fix).
     - Edge cases: If path is empty (no exploration yet), our FogOverlay should still render the fog fully. In our code, if `pathPoints.length === 0`, the `<Path>` is not rendered, meaning mask = all white fill. All white (with no black) means the mask is fully “visible”, so the fog rect will be fully applied – which is correct (full fog when no path). We’ll test that initial state shows a full fog.
     - Also test app background/foreground: when the app returns, ensure the fog overlay still matches the map (this should be fine since it derives from state each render).

   - We should remove or feature-flag the old implementation so we don’t double-render fog. A clean-up step is to delete the polygon logic and ensure the new system is the only one active.

6. **Fallback Plan (if Skia issues arise)** – _Milestone:_ Have a working alternative with RN-SVG if needed.

   - If during implementation we find Skia is not viable (e.g., some Expo compatibility issue or unexpected performance problem), we will implement a similar `FogOverlaySvg` using `react-native-svg`. This would involve:

     - Using an `<Svg height="100%" width="100%">` overlay with a defined `<Mask>` in its `<Defs>`. We can define a mask with id, containing a white rect and a black `<Path>` that follows the coordinates (SVG Path data can be constructed similarly from points).
     - Then draw a rect with the fog color that uses `mask="url(#maskId)"`.
     - The coordinate conversion would be the same; we’d just plug the pixel coords into an SVG Path `d` attribute (e.g. `M x0,y0 L x1,y1 L x2,y2 ...`).
     - The logic in Redux and coordinate math all stays the same. Only the rendering layer changes.
     - Performance might be slightly lower (RN-SVG runs on the native UI thread, but it might handle even a thousand-point path acceptably). If performance is a concern, we could simplify the path for SVG (e.g. reduce points via sampling when zoomed out). But this is only a fallback.

   - Since our primary plan is Skia, we’ll only develop this if necessary. However, we will keep the design such that swapping the rendering component is easy (perhaps by making an interface or at least isolating all rendering inside FogOverlay, so replacing its internals or switching out the component is not too entangled with the rest of the app).

7. **Testing & QA Checkpoints** – _Milestone:_ All new functionality is verified by automated tests and manual exploration.

   - By this stage, we should have unit tests for Redux slice and conversion math (from step 2 and 3). Run the test suite (`npm test`) to ensure all pass. Add any tests for new utility functions or any bug fixes encountered.
   - Write a few more tests if needed: for example, if we add a `PathRepository` abstraction, test that switching out its implementation (e.g., a stub that returns a preset path) still results in the FogOverlay rendering expected results.
   - Ensure lint and type-check pass (TypeScript types for Skia components and our utils should all be correct).
   - Conduct a real-world test: perhaps take the app for a short walk (or simulate movement by feeding location data) and see the fog uncover in realtime. Observe the performance (should remain at a high FPS, no stutters when adding points or panning).
   - Test various screen sizes (if on tablet vs phone, ensure our width/height usage works).
   - Regression test other map features: confirm that our changes didn’t break anything like user location marker, map skins (if any image filters are applied, our overlay should not interfere), or friend-sharing (likely not applicable yet in MVP). Basically ensure the map still loads and updates properly aside from fog.
   - Once satisfied, remove any leftover debug code (for instance, if we temporarily drew the path in a visible color for debugging, revert it to proper mask usage).

8. **Documentation and Clean-up** – _Milestone:_ Code is clean and maintainable, and team is informed of changes.

   - Document the new fog system in the project’s docs (maybe update `fog-filter-plan.md` or create a README section). Explain how the fog overlay works, so future developers (or the backend dev audience) understand it. This can include a summary of this plan, and perhaps notes on how to adjust parameters (like changing fog opacity or path width).
   - Remove deprecated code: the old polygon approach code should be deleted to avoid confusion. Also remove any temporary logs or experimental code.
   - Ensure the repository reflects these changes (update tests, snapshots, etc., so CI passes).
   - Plan for deployment: since this is a noticeable change, we might do a beta release to ensure it works on all devices. But that’s beyond scope; at least we ensure our Expo app can be published with Skia (should be fine as it’s supported).

Throughout the implementation, our approach is test-driven and iterative. We started by securing the core data logic (Redux path storage) with tests, then added rendering step by step. By verifying each layer (data, math, UI) in isolation, we minimized the chances of complex bugs. For example, if we see the path misaligned on screen, we can use our tests to verify whether the math is wrong or the integration (knowing the math function passed unit tests, the issue might be how we gather region data or apply it).

Finally, we highlight that the new design is **extensible**: In the future, we could easily add saving/loading of the `path` array (e.g. when a user logs in, fetch their saved path and dispatch an action to set `state.exploration.path`). We could also add features like **remote persistence** by implementing a storage interface in parallel to Redux – our code changes in this refactor ensure all fog rendering reads from a single source (`state.exploration.path` via selector), so by updating that source we update the UI. Additionally, altering the fog visual (say, using an image texture instead of plain color, or adding a gradient at the edges) can be done by modifying the drawn overlay or mask – the architecture supports swapping those as needed without affecting the game logic.

## Conclusion

By switching from the old polygon-holes method to a canvas-based masked overlay, we achieve a more robust and scalable fog-of-war system. The **design rationale** is backed by known best practices and addresses the shortcomings of the initial approach. The **architectural changes** (Redux state, Skia overlay) isolate responsibilities: the Redux store now cleanly holds the path data, and the FogOverlay component focuses purely on rendering. We included a **fallback (SVG)** to de-risk the choice of Skia, and ensured the solution stays within Expo’s managed workflow.

This comprehensive plan not only meets the immediate goals (anchored fog, thick path reveal, performance) but also lays the groundwork for future enhancements like persistent world exploration, dynamic fog effects, or even multi-player shared maps. All code is written with clarity (suitable for a Python/backend developer to follow, with comments explaining TypeScript/React specifics), and critical pieces are covered by tests to prevent regressions. With this refactor, **Fog of Dog** will have a smooth, visually appealing fog-of-war experience similar to renowned apps and games, ready to handle an expanding world of exploration.

**Sources:**

- React Native Skia mask (luminance mode) – inverted mask technique
- React Native Maps polygon holes (current approach limitations)
- Performance issues with many map polygons (need for canvas approach)
- Fog of World concept and data persistence insights (inspired design for lifetime path tracking)
