# Graphics Layer Research — FogOfDog

## Executive Summary

This document surveys candidate technologies for the graphics/effects layer in FogOfDog, evaluates each along four axes (performance, ease of use, community support, longevity), and documents the chosen approach and its rationale.

---

## 1. Technology Survey

### 1.1 React Native Skia (current renderer + chosen approach)

React Native Skia (`@shopify/react-native-skia`) is already the rendering engine for `OptimizedFogOverlay`. It wraps Google's Skia graphics library, which powers Chrome, Android, Flutter, and many production systems.

**How it works in this codebase:**
The fog overlay creates a Skia `Canvas` component that occupies the full screen (`pointerEvents="none"`). It uses a luminance `Mask` — a white background with black "holes" at each GPS point — so only the fog rectangle shows through where the user has not yet walked. The mask is built from a single batched `Path` containing all visited circles plus a smooth Catmull-Rom spline connecting them, making even thousands of GPS points cheap to render.

**What we add:**

- Fog effects: modify the existing Canvas (fog colour, opacity, animated stroke multiplier, tint overlays).
- Map effect overlay: a second lightweight Canvas between the map and the fog (colour tints, animated sweeps).
- Scent trail: a third lightweight Canvas for the path from the user to the nearest unexplored waypoint.

**Performance:**
All drawing happens on the GPU via Skia's Metal (iOS) or Vulkan/OpenGL (Android) backend. The existing pan-optimisation (GPU translate instead of CPU re-computation) is preserved. Animated values are driven by Reanimated worklets, running entirely on the UI thread with no JS frame budget impact.

**Animations:**
Skia v2 dropped its own clock/value system and integrates exclusively with `react-native-reanimated` (v3/v4). `useSharedValue` + `withRepeat` + `withTiming` from Reanimated drive all animated props. `SharedValue<T>` can be passed directly to most Skia component props (`opacity`, `transform`, `strokeWidth`, …) and evaluated on the UI thread.

**Pros:**

- Already in the project — zero new dependencies.
- GPU-accelerated: Metal on iOS, OpenGL ES / Vulkan on Android.
- Tight Reanimated integration for 60fps animations without JS involvement.
- Full 2D canvas API: paths, masks, shaders, image filters, blend modes.
- Battle-tested at Shopify scale; actively maintained.
- Single Canvas surface per logical layer keeps EGL overhead minimal.

**Cons:**

- Native module: adding new effects requires understanding Skia path / paint APIs.
- Skia v2 animation API changed significantly from v1 (old `useClock`/`useValue` are gone).
- Shader effects (GLSL/SkSL) require extra expertise; we avoid them here.

---

### 1.2 Canvas2D / React Native Canvas

A `<Canvas>` polyfill backed by `react-native-canvas` or `expo-canvas` exposes the browser-style Canvas 2D API.

**Pros:**

- Familiar web API (`fillRect`, `arc`, `drawImage`).
- Easy to prototype effects.

**Cons:**

- JS-thread rendering — every draw call crosses the bridge. On animation, this means 60 JS calls/second, which is prohibitive on lower-end devices.
- No blend-mode masks (no luminance mask for fog-of-war).
- Not maintained at the same quality level as Skia.
- No GPU acceleration for transforms; each frame forces a full CPU re-raster.
- **Rejected**: JS-thread performance is incompatible with the project's FPS requirements.

---

### 1.3 Lottie (`lottie-react-native`)

Lottie plays After Effects animations exported as JSON. It is GPU-accelerated (via the native Lottie renderer) and supports complex motion graphics.

**Pros:**

- Excellent for pre-authored, designer-produced animations.
- Very simple React API (`<LottieView source={...} autoPlay loop />`).
- No drawing code required.

**Cons:**

- Animations must be pre-authored in After Effects + Bodymovin. They cannot respond to real-time data (GPS positions, fog state, waypoint distance).
- Cannot render procedural paths (fog holes, scent trails) driven by live location data.
- Adds ~4 MB native library for a use case that Skia already handles.
- **Rejected**: not suitable for data-driven, procedural graphics.

---

### 1.4 WebGL / OpenGL ES via `expo-gl`

`expo-gl` exposes an OpenGL ES 3.0 surface directly, allowing GLSL vertex/fragment shaders.

**Pros:**

- Maximum flexibility; shaders can implement any visual effect imaginable.
- True per-fragment computation on the GPU.
- Possible to implement noise-based fog, procedural terrain, particle systems.

**Cons:**

- Very high engineering cost: requires matrix math, VAOs/VBOs, shader programming.
- No declarative React component model; everything is imperative GL calls.
- Blending with the map layer is complex (texture sampling + FBO management).
- Difficult to debug; shader errors are often silent.
- Overkill for the effects needed here (colour tints, animated circles, path trails).
- **Rejected**: engineering cost far exceeds the value for the planned effects catalogue.

---

### 1.5 Reanimated + React Native SVG

`react-native-svg` renders SVG elements natively. Combined with Reanimated, SVG attributes can be animated.

**Pros:**

- Declarative: familiar `<Path d="..." stroke="..." />` syntax.
- Works well for relatively simple paths and icons.

**Cons:**

- SVG in React Native renders via the SVG native module bridge; rasterisation is CPU-bound.
- Poor performance for large point counts (the fog overlay processes up to 5,000 GPS points per frame).
- No GPU acceleration equivalent to Skia.
- Blending SVG surfaces with a MapLibre layer requires positioning hacks.
- **Rejected**: performance profile is incompatible with the fog overlay's requirements.

---

### 1.6 Skia Shaders (SkSL / GLSL via Skia Runtime Effects)

Skia exposes `Skia.RuntimeEffect.Make(sksl)` to write custom GPU shaders that run inside the Skia pipeline. This would allow noise-based fog, distortion effects, per-pixel procedural patterns.

**Pros:**

- GPU shaders inside the existing Skia surface — no extra library.
- Full expressiveness of fragment shaders.
- Seamlessly composited with existing Skia paths and masks.

**Cons:**

- SkSL syntax is non-standard; requires Skia-specific knowledge.
- Harder to maintain and debug than path/paint operations.
- For the effects in scope (colour overlays, dashes, animated circles) the extra power is unnecessary.
- Testing shaders in Jest is impractical; all tests would need mocking.
- **Deferred**: suitable for a future "premium effects" tier; not used in this implementation.

---

## 2. Decision

**Chosen: React Native Skia (with Reanimated for animation)**

Rationale:

| Criterion         | Score | Notes                                                             |
| ----------------- | ----- | ----------------------------------------------------------------- |
| Performance       | ★★★★★ | GPU-native, UI-thread animation, no JS bridge for animation ticks |
| Ease of use       | ★★★★☆ | Existing team knowledge, declarative component API                |
| Community support | ★★★★★ | Shopify-maintained, 6k+ GitHub stars, active releases             |
| Longevity         | ★★★★★ | Underpins Flutter-adjacent work; not going away                   |

The codebase already imports and relies on Skia for `OptimizedFogOverlay`. Adding new effects is additive to existing infrastructure — no new native modules, no new link steps, no new EAS build configuration. All animated effects use Reanimated (already in the project at v4.1.1), which runs on the UI thread via JSI worklets, satisfying the ≥5 FPS panning requirement and the ≤30% idle overhead budget.

---

## 3. Implementation Architecture

```
MapView (MapLibre, bottom layer)
  └── MapEffectOverlay (Skia Canvas — map tints, radar sweep)
  └── OptimizedFogOverlay (Skia Canvas — fog mask, effect-aware)
  └── ScentTrail (Skia Canvas — dotted/animated trail to waypoint)
  └── UI overlays (HUD, nudge card, buttons)
```

Three Skia canvases are used. Each is a separate EGL surface, but surfaces 2 and 3 are lightweight (single path + optional animation). The main performance budget is held by surface 1 (existing fog overlay), which is unaffected for the "classic" default effect.

### Fog Effects (integrated into OptimizedFogOverlay)

- **Classic** (static): existing behaviour — black fog, solid circles.
- **Vignette** (static): existing black fog + a radial gradient fade near circle edges using a `MaskFilter` blur on the mask path.
- **Pulse** (animated): existing black fog with animated `strokeWidth` (Reanimated `SharedValue<number>` drives ±12% breathing).
- **Haunted** (animated): dark indigo fog tint achieved with an extra `Rect` inside the Canvas at reduced opacity, whose opacity animates with `withRepeat(withTiming(...))`.

### Map Effects (MapEffectOverlay — new Canvas)

- **None** (static): no-op, Canvas renders nothing (zero cost).
- **Sepia Veil** (static): warm amber `Rect` at 0.12 opacity.
- **Heat Glow** (animated): a path mirroring the explored trail with `MaskFilter` blur and animated opacity.
- **Radar Sweep** (animated): rotating arc drawn with `Skia.Path.Make()` arc + `Group transform` animated via `SharedValue<SkMatrix>`.

### Scent Effects (ScentTrail — new Canvas)

- **Dotted Trail** (static): `Path` with `DashPathEffect([6, 10])` from user to waypoint.
- **Arrow Trail** (static): periodic triangle markers along the great-circle path.
- **Flowing Particles** (animated): dots at fixed spacing along the path whose `dashPhase` shifts via animated `SharedValue`.
- **Pulse Wave** (animated): expanding circles at the waypoint endpoint, animated radius and fading opacity.

---

## 4. Performance Strategy

1. **No additional GPS computations**: effect overlays share the `path` and `pixelCoordinates` already computed by `OptimizedFogOverlay`.
2. **Stable compute regions preserved**: fog effect modifications (stroke multiplier, colour) are GPU-side only; the heavy CPU computation (viewport culling, path simplification) is unchanged.
3. **Animation on UI thread**: all `withRepeat`/`withTiming` calls run as Reanimated worklets, with zero JS frame budget impact.
4. **Conditional rendering**: each overlay is `null`-rendered when its effect is `none`/off, so inactive effects impose zero overhead.
5. **Single path reuse**: ScentTrail and MapEffectOverlay reuse `geoPointToPixel` + simple line construction, not the full 5-stage fog pipeline.

---

## 5. References

- [React Native Skia v2 Migration Guide](https://shopify.github.io/react-native-skia/docs/getting-started/v2)
- [Reanimated 4 Documentation](https://docs.swmansion.com/react-native-reanimated/)
- [Skia Path API](https://shopify.github.io/react-native-skia/docs/shapes/path)
- [MapLibre React Native](https://maplibre.org/maplibre-react-native/)
