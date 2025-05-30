# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Frontend (React Native/Expo)

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Expo development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android simulator
npm run android

# Run unit and integration tests
npm test

# Run tests with watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run E2E tests in debug mode with screenshots
cd frontend && npx detox test --reuse --take-screenshots all --configuration ios.sim.debug e2e/

# Build for E2E tests (release configuration)
cd frontend && npx detox build --configuration ios.sim.release

# Run E2E tests in release mode
cd frontend && npx detox test --configuration ios.sim.release e2e/

# Build for production
eas build --platform all
```

### Backend (Go)

```bash
# Navigate to backend directory
cd backend

# Install Go dependencies
go mod download

# Run the server
go run cmd/server/main.go

# Run backend tests
cd backend && go test ./...
```

## Architecture Overview

Fog of Dog is a mobile game that implements a fog-of-war mechanic for real-world GPS movement. Players explore and reveal areas on the map by physically moving in the real world.

### Key Components

1. **Frontend**: React Native application with Expo
   - Redux for state management (`@reduxjs/toolkit` and `react-redux`)
   - Map implementation using `react-native-maps`
   - Location services via `expo-location`
   - UI rendering with React Native components
   - Canvas-based rendering with `@shopify/react-native-skia`

2. **Backend**: Go service (currently minimal implementation)
   - RESTful API with standard Go patterns
   - Authentication via AWS Cognito (planned)
   - Storage in DynamoDB (planned)

### Fog of War Implementation

The core game mechanic is implemented in the frontend with the following components:

1. **State Management**: 
   - Redux store with `explorationSlice` that tracks:
     - Current GPS location
     - Array of explored areas (each with lat, lon, radius)
   - New areas are revealed when player moves at least 25m from existing explored areas

2. **Rendering**:
   - MapScreen uses react-native-maps
   - Fog overlay implemented with <Polygon> that has holes for visited areas
   - Each visited area creates a circular hole (approx. 50m radius) in the fog
   - The fog is dynamically centered on the player's position
   - Current implementation avoids redundant "fog holes" by checking distances

3. **Testing Approach**:
   - Unit tests for Redux logic and map components
   - E2E tests using Detox to validate user flows
   - Visual validation tests that capture screenshots and analyze fog patterns

## Project Structure

```
fog-of-dog/
├── frontend/              # React Native/Expo application
│   ├── src/               # Source code
│   │   ├── components/    # Reusable UI components
│   │   ├── screens/       # Screen components (MapScreen contains fog logic)
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API and external service integrations
│   │   ├── store/         # Redux store configuration
│   │   │   ├── slices/    # Redux slice implementations
│   │   │   │   ├── explorationSlice.ts  # Fog of war state management
│   │   │   │   └── userSlice.ts         # User authentication state
│   │   ├── types/         # TypeScript type definitions
│   │   └── utils/         # Utility functions
│   ├── e2e/               # Detox End-to-End tests
│   │   ├── actions/       # Reusable test actions (e.g., login)
│   │   └── ...            # Test files (.test.js)
│
├── backend/               # Go backend service
│   ├── cmd/               # Main applications
│   ├── internal/          # Private packages
│   └── pkg/               # Public packages
│
└── PROJECT_DOCS/          # Project documentation
    ├── DESIGN.md          # Design documentation
    └── CURRENT_DIRECTION_ANALYSIS_5_20_2025.md  # Implementation analysis
```

## Development Notes

### Fog of War Implementation

The project is undergoing refactoring to improve the fog-of-war rendering approach. As outlined in `PROJECT_DOCS/DESIGN.md`, the team is moving from a polygon-with-holes approach to a Skia canvas-based implementation to improve performance and visual quality.

Key aspects of this transition:

1. **Current Implementation**: Uses `<Polygon>` from react-native-maps with holes property
2. **Target Implementation**: Canvas-based rendering with Skia for better performance
3. **Coordinate System**: Conversion between geographic coordinates and screen pixels
4. **Mask Approach**: Using luminance mask to cut out visited areas from the fog overlay

When working with the fog effect, be aware that both implementations may coexist during the transition period. The upcoming Skia approach will address performance issues when dealing with many explored areas.

### Testing Guidelines

1. **Unit/Integration Tests**:
   - Use Jest and React Testing Library
   - Tests are co-located with components or in `__tests__` directories
   - Mock location services and map components appropriately

2. **E2E Tests**:
   - Use Detox for end-to-end testing
   - Run tests against both debug and release builds
   - Visual validation uses PNG analysis to verify fog holes
   - Always use testID props for reliable element selection

### Deployment Workflow

1. **Development**: 
   - Use Expo Go for quick testing
   - Development client for native module testing

2. **Testing**: 
   - Build app with Detox for E2E tests
   - Unit tests should pass before deployment

3. **Production**:
   - Use EAS Build for app store submissions
   - Update version in app.json before builds