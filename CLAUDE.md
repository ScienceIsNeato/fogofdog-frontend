# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this React Native/Expo frontend project.

## Quick Start Commands

```bash
# Essential commands for immediate productivity
cd ${AGENT_HOME}

# Start development
npm start                    # Start Expo dev server
npm test                     # Run unit tests
npm run quality:check       # Run all quality checks
npm run lint:strict         # Zero-warnings linting

# Before committing
sm validate commit               # Fast quality gate check (fail-fast, dependency-ordered)
sm validate pr                   # Full PR validation (comprehensive)
```

## Important Notes

### Cursor Rules Integration

This project uses comprehensive cursor-rules from the cursor-rules directory. These rules provide:

- Development workflow guidelines (🌳)
- Testing protocols (🧪)
- Session context management (🕒)
- Path management rules (🛣️)
- Issue reporting protocols (🐛)
- Quality assurance standards
  If cursor-rules are present, they take precedence and should be followed alongside these guidelines.

### Path Requirements

**CRITICAL**: Always use absolute paths in commands. Always use full paths like `cd ${AGENT_HOME}`.

### Current Status

✅ **Production Ready**: Successfully deployed to TestFlight (v1.0.1)
✅ **Quality Gate**: 91.73% test coverage, 84.16% branches, 2.92% duplication
✅ **Dependencies Fixed**: All exact versions, expo-doctor passing  
✅ **Sequential Thinking**: MCP server integrated for systematic debugging
✅ **Background GPS**: Implemented and tested with location tracking
✅ **Integration Testing**: E2E tests with Detox and visual validation

## Development Commands

### Core Development

```bash
# Start development
npm start                           # Start Expo development server
npm start -- --clear               # Start with cache clearing
npm run ios                        # Run on iOS simulator
npx expo-doctor                    # Check project health
```

### Testing

```bash
# Unit tests
npm test                           # Run all tests (watch mode)
npm run test:ci                    # Run tests in CI mode (non-interactive)
npm run test:coverage             # Run with coverage report

# E2E tests (Maestro)
./scripts/run-integration-tests.sh .maestro/        # All integration tests
./scripts/run-integration-tests.sh .maestro/smoke-test.yaml  # Specific test

# Specific test patterns
npm test -- src/components/FogOverlay.test.tsx     # Run specific file
npm test -- --testNamePattern="should render"      # Run by pattern
npm run test:update-snapshots                      # Update snapshots
```

### Quality & Linting

```bash
# Quality gate (recommended before commits)
sm validate commit                             # Fast quality gate check (dependency-ordered)
sm validate pr                                 # Full PR validation (comprehensive)
sm validate -g <gate-name>                     # Run specific gate only
npm run quality:check                              # Core quality checks

# Individual checks
npm run lint:strict                                # Zero-warnings linting
npm run lint:fix                                   # Auto-fix lint issues
npm run type-check                                 # TypeScript validation
npm run format:fix                                 # Format code with Prettier
```

### Build & Deployment

```bash
# EAS builds
npx eas build --platform ios --profile testflight  # TestFlight build
npx eas build --platform ios --profile device      # Internal testing
npx eas submit --platform ios --latest             # Submit to TestFlight
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
   cd ${AGENT_HOME}
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
   - `src/services/BackgroundLocationService.ts` - Background GPS tracking
   - `src/services/LocationStorageService.ts` - Location data persistence

4. **Performance Considerations**:
   - Distance-based filtering to prevent redundant fog holes
   - Skia-based rendering for GPU acceleration
   - Real-time coordinate transformation on map region changes

### Verified Working Features

✅ **Authentication**: Sign-in flow functional  
✅ **GPS Integration**: Live location tracking with background support
✅ **Fog Overlay**: Dynamic rendering with coordinate-based visibility using Skia
✅ **Map Interaction**: Pan, zoom, location controls  
✅ **Redux State**: Centralized state management with exploration tracking
✅ **Background Services**: Location tracking continues when app is backgrounded
✅ **TestFlight Deployment**: Production-ready builds with auto-increment
✅ **Quality Assurance**: Comprehensive testing suite with 91.73% coverage
✅ **E2E Testing**: Detox integration with visual validation
✅ **Code Quality**: ESLint, TypeScript strict mode, automated formatting

### Testing Guidelines

1. **Unit/Integration Tests**:

   - Use Jest and React Testing Library
   - Tests in `__tests__` directories alongside components
   - 80% coverage threshold enforced (statements, functions, lines)
   - Mock all Expo modules using files in `__mocks__/`

2. **E2E Tests**:
   - Use Maestro for end-to-end testing (`.maestro/` directory)
   - Always use `./scripts/run-integration-tests.sh` wrapper (never run maestro directly)
   - Tests include: login flow, GPS tracking, fog rendering validation
   - Visual validation through screenshot analysis

## Build Configuration

### EAS Build Profiles

- **testflight**: Store distribution for TestFlight deployment (autoIncrement: true)
- **production**: Store distribution for production releases (autoIncrement: true)
- **device**: Internal distribution for development testing
- **development**: Development client with simulator support
- **preview**: Internal distribution for preview builds

### Dependencies & Package Management

- **Exact Versions**: All dependencies use exact versions (no wildcards)
- **expo-doctor**: All checks must pass before builds
- **Legacy Peer Deps**: Use `--legacy-peer-deps` for React version conflicts
- **Critical Dependencies**: React Native 0.76.9, Expo SDK 52, React Native Skia 1.5.0

### Quality Assurance

- **ESLint**: Zero warnings policy enforced (`npm run lint:strict`)
- **TypeScript**: Strict mode enabled (`npm run type-check`)
- **Code Coverage**: Minimum 70% coverage required
- **Code Duplication**: Maximum 5% threshold (currently 2.92%)
- **Security**: `npm audit` checks for high-severity vulnerabilities

## Success Metrics

- ✅ **0 black screens** (restored from complete failure)
- ✅ **6-minute build times** for TestFlight deployment
- ✅ **100% core functionality** working in production
- ✅ **91.73% test coverage** with 84.16% branch coverage
- ✅ **Sequential debugging** proven effective for complex issues
- ✅ **Production deployment pipeline** fully operational
- ✅ **Quality gate passing** with zero ESLint warnings
- ✅ **Background GPS tracking** successfully implemented
- ✅ **Integration testing pipeline** with E2E and visual validation

## Important Reminders

### Before Making Changes

1. **Read STATUS.md** - Always check current project status first
2. **Run baseline tests** - `npm test` to verify current state
3. **Use absolute paths** - Always use `${AGENT_HOME}`
4. **Check current quality** - Run `npm run quality:check`

### After Making Changes

1. **Run affected tests** - Test components/areas you modified
2. **Type check** - `npm run type-check` for TypeScript validation
3. **Lint validation** - `npm run lint:strict` must pass with zero warnings
4. **Quality gate** - `sm validate commit` before commits (use `sm validate -g <gate>` for specific checks)
5. **Update STATUS.md** - Document significant changes

### Working with Tests

- **Never skip tests** - Always run tests for modified code
- **Fix test failures immediately** - Don't ignore failing tests
- **Update snapshots carefully** - Only when UI changes are intentional
- **Maintain 80% coverage** - Required for all new code
