# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this React Native/Expo frontend project.

## Important Notes

### Cursor Rules Integration
This project uses cursor-rules from the cursor-rules directory. If cursor-rules are present, they take precedence and should be followed alongside these guidelines.

### Path Requirements  
**CRITICAL**: Always use absolute paths in commands. Always use full paths like `cd /Users/pacey/Documents/SourceCode/fogofdog-frontend`.

### Current Status
✅ **Production Ready**: Successfully deployed to TestFlight  
✅ **Dependencies Fixed**: All exact versions, expo-doctor passing  
✅ **Sequential Thinking**: MCP server integrated for systematic debugging  

## Common Commands

### Frontend (React Native/Expo)

```bash
# Navigate to project directory
cd /Users/pacey/Documents/SourceCode/fogofdog-frontend

# Install dependencies
npm install

# Start Expo development server
npx expo start

# Start with cache clearing
npx expo start --clear

# Run on iOS simulator
npx expo run:ios

# Run tests
npm test

# Run tests in CI mode (non-interactive)
npm run test:ci

# Run E2E tests
npm run test:e2e

# Run tests with coverage
npm test -- --coverage

# Lint code
npm run lint

# Build for TestFlight
npx eas build --platform ios --profile testflight

# Submit to TestFlight
npx eas submit --platform ios --latest

# Build for internal testing
npx eas build --platform ios --profile device

# Check project health
npx expo-doctor
```

## Architecture Overview

Fog of Dog is a mobile game that implements a fog-of-war mechanic for real-world GPS movement. Players explore and reveal areas on the map by physically moving in the real world.

### Frontend Stack (Production Ready)

- **React Native 0.76.9** - Core framework
- **Expo SDK 52** - Development platform  
- **React Native Skia 1.5.0** - Graphics rendering for fog overlay
- **React Native Maps** - GPS and map integration
- **Redux Toolkit** - State management
- **EAS Build** - Cloud build and distribution

### Key Components

1. **Frontend**: React Native application with Expo
   - Redux for state management (`@reduxjs/toolkit` and `react-redux`)
   - Map implementation using `react-native-maps`
   - Location services via `expo-location`
   - UI rendering with React Native components
   - Canvas-based rendering with `@shopify/react-native-skia`

### Fog of War Implementation

The core game mechanic is implemented with the following components:

1. **State Management**: 
   - Redux store with `explorationSlice` that tracks:
     - Current GPS location
     - Array of explored areas (each with lat, lon, radius)
   - New areas are revealed when player moves at least 25m from existing explored areas

2. **Rendering**:
   - MapScreen uses react-native-maps
   - Fog overlay implemented with React Native Skia Canvas
   - Each visited area creates a circular hole (approx. 50m radius) in the fog
   - The fog is dynamically centered on the player's position
   - Current implementation avoids redundant "fog holes" by checking distances

3. **Testing Approach**:
   - Unit tests for Redux logic and map components
   - E2E tests using Detox to validate user flows
   - Visual validation tests that capture screenshots and analyze fog patterns

## Project Structure

```
fogofdog-frontend/
├── src/                   # Source code
│   ├── components/        # Reusable UI components
│   ├── screens/           # Screen components
│   │   └── Map/           # MapScreen contains fog logic
│   ├── navigation/        # React Navigation setup
│   ├── store/             # Redux store configuration
│   │   └── slices/        # Redux slice implementations
│   │       ├── explorationSlice.ts  # Fog of war state management
│   │       └── userSlice.ts         # User authentication state
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utility functions
├── e2e/                   # Detox End-to-End tests
│   ├── actions/           # Reusable test actions
│   └── helpers/           # Test utilities
├── PROJECT_DOCS/          # Project documentation
│   ├── DESIGN.md          # Design documentation
│   ├── PROJECT.md         # Project overview
│   ├── STRUCTURE.md       # Code organization
│   └── CURRENT_DIRECTION_ANALYSIS_5_20_2025.md
├── assets/                # Static assets
├── ios/                   # iOS native build files
├── android/               # Android native build files
└── cursor-rules/          # AI development rules
```

## Development Workflow

### Daily Development

1. **Start Development Server**:
   ```bash
   cd /Users/pacey/Documents/SourceCode/fogofdog-frontend
   npx expo start
   ```

2. **Test on Device**: Use Expo Go app to scan QR code

3. **Run Tests**: 
   ```bash
   npm test
   ```

4. **Validate Health**:
   ```bash
   npx expo-doctor
   ```

### Production Deployment

1. **Build for TestFlight**:
   ```bash
   npx eas build --platform ios --profile testflight
   ```

2. **Submit to TestFlight**:
   ```bash
   npx eas submit --platform ios --latest
   ```

3. **Install on Device**: Via TestFlight app

### Debugging Methodology

1. **Use Sequential Thinking**: Systematic approach vs random fixes
2. **Check Dependencies**: Run `npx expo-doctor` before builds  
3. **Validate Each Step**: Test incrementally
4. **Document Findings**: Update STATUS.md with learnings

## Key Implementation Details

### Fog of War Implementation

1. **Current Implementation**: 
   - Uses Redux store with `explorationSlice` tracking path coordinates
   - State includes both `path: GeoPoint[]` and `exploredAreas: GeoPoint[]`
   - Minimum distance threshold of 20m for new areas, with 50m radius fog holes
   - FogOverlay component using React Native Skia canvas rendering

2. **Technical Approach**:
   - Uses `@shopify/react-native-skia` for canvas rendering
   - Implements luminance masking to cut holes in fog overlay
   - Coordinate conversion from geographic to screen pixels via `mapUtils.ts`
   - Canvas overlay positioned absolutely over MapView with `pointerEvents="none"`

3. **Key Implementation Files**:
   - `src/store/slices/explorationSlice.ts` - State management for user path
   - `src/components/FogOverlay.tsx` - Canvas-based fog rendering  
   - `src/utils/mapUtils.ts` - Geo to screen coordinate conversion
   - `src/screens/Map/index.tsx` - Main map screen integration

4. **Performance Considerations**:
   - Distance-based filtering to prevent redundant fog holes
   - Skia-based rendering for GPU acceleration
   - Real-time coordinate transformation on map region changes

### Verified Working Features

✅ **Authentication**: Sign-in flow functional  
✅ **GPS Integration**: Live location tracking  
✅ **Fog Overlay**: Dynamic rendering with coordinate-based visibility  
✅ **Map Interaction**: Pan, zoom, location controls  
✅ **Redux State**: Centralized state management  
✅ **TestFlight Deployment**: Production-ready builds  

### Testing Guidelines

1. **Unit/Integration Tests**:
   - Use Jest and React Testing Library
   - Tests are co-located with components or in `__tests__` directories
   - Mock location services and map components appropriately

2. **E2E Tests**:
   - Use Detox for end-to-end testing
   - Run tests against both debug and release builds
   - Visual validation uses PNG analysis to verify fog holes

## Build Configuration

### EAS Build Profiles

- **testflight**: Store distribution for TestFlight deployment
- **device**: Internal distribution for development testing
- **development**: Development client with simulator support

### Dependencies

- **Exact Versions**: All dependencies use exact versions (no wildcards)
- **expo-doctor**: All 15 checks must pass before builds
- **Legacy Peer Deps**: Use `--legacy-peer-deps` for React version conflicts

## Success Metrics

- ✅ **0 black screens** (restored from complete failure)
- ✅ **6-minute build times** for TestFlight deployment  
- ✅ **100% core functionality** working in production
- ✅ **Sequential debugging** proven effective for complex issues
- ✅ **Production deployment pipeline** fully operational