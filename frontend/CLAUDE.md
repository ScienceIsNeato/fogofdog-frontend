# Claude Configuration

This file provides configuration options and instructions for Claude Code when working with the FogOfDog application.

## Cursor Rules Loading

If a .cursorrules file is present in the base directory, load it and treat its content as if it were part of this CLAUDE.md file itself.

## Test Procedures

Before submitting any changes, run the test suite:

```bash
cd ${AGENT_HOME}/frontend && npm test
```

## Common Issues

### Fog of War Alignment

The fog of war effect is implemented using a Skia canvas overlay with the FogOverlay component. Key things to be aware of:

1. The fog holes should remain anchored to absolute geographic coordinates
2. When panning the map, the relationship between the fog holes and the underlying map content should remain stable
3. The geoPointToPixel function in mapUtils.ts handles the conversion from geographic coordinates to screen pixels
4. When rotating the map, the rotation pivot should be centered on the current GPS location

### Test Configuration

Tests should:
1. Check that the FogOverlay component correctly receives the current map region
2. Verify that panning the map doesn't change the path points stored in Redux
3. Confirm that the path to screen coordinate conversion preserves absolute positioning
4. Ensure the rotation pivot is correctly centered on the user's current location

## Project Structure

- frontend/src/components/FogOverlay.tsx - Canvas-based fog rendering
- frontend/src/utils/mapUtils.ts - Geo to screen coordinate conversion utilities
- frontend/src/store/slices/explorationSlice.ts - State management for user path
- frontend/src/screens/Map/index.tsx - Main map screen component

## Development Workflow

### Starting the App
```bash
kill -9 $(lsof -ti :8081) 2>/dev/null || true && cd ${AGENT_HOME}/frontend && EXPO_DEBUG=1 npx expo start --ios --dev-client
```

### Running Tests
```bash
cd ${AGENT_HOME}/frontend && npm test
```

### Running E2E Tests
```bash
cd ${AGENT_HOME}/frontend && npx detox test --reuse --take-screenshots all --configuration ios.sim.debug e2e/
```