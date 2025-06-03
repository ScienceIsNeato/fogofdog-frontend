# Project Structure

This document outlines the structure and organization of the Fog of Dog frontend project.

Fog of Dog is a standalone React Native/Expo frontend application for a mobile game that implements fog-of-war mechanics for real-world GPS movement.

## Directory Structure

```
fogofdog-frontend/
├── .expo/                 # Expo build cache and configuration
├── .git/                  # Git repository data
├── PROJECT_DOCS/          # Project documentation
│   ├── DESIGN.md          # UI/UX design specifications
│   ├── PROJECT.md         # High-level project overview
│   ├── STRUCTURE.md       # This file - code organization
│   └── CURRENT_DIRECTION_ANALYSIS_5_20_2025.md
├── android/               # Android native build files
├── ios/                   # iOS native build files
├── assets/                # Static assets (images, fonts, etc.)
├── cursor-rules/          # AI development rules and scripts
├── e2e/                   # End-to-end testing with Detox
│   ├── actions/           # Reusable test actions
│   ├── artifacts/         # Test artifacts and screenshots
│   └── helpers/           # Test utility functions
├── coverage/              # Test coverage reports
├── scripts/               # Build and deployment scripts
└── src/                   # Main source code
    ├── components/        # Reusable UI components
    ├── screens/           # Screen components
    │   ├── Auth/          # Authentication screens
    │   ├── Map/           # Map screen with fog overlay
    │   ├── Profile/       # User profile screens
    │   └── main/          # Main navigation screens
    ├── navigation/        # React Navigation configuration
    ├── store/             # Redux store and state management
    │   └── slices/        # Redux Toolkit slices
    ├── types/             # TypeScript type definitions
    ├── utils/             # Utility functions and helpers
    ├── config/            # App configuration
    └── __tests__/         # Unit and integration tests
```

## Core Configuration Files

### Frontend

- `package.json`: Node.js dependencies and scripts
- `app.json`: Expo configuration
- `eas.json`: EAS Build configuration for deployment
- `tsconfig.json`: TypeScript configuration
- `jest.config.js`: Jest testing configuration
- `metro.config.js`: Metro bundler configuration
- `babel.config.js`: Babel transpilation configuration
- `.detoxrc.js`: Detox E2E testing configuration

### Development Tools

- `eslint.config.js`: ESLint linting rules
- `.gitignore`: Git ignore patterns
- `STATUS.md`: Current project status and debugging journey
- `README.md`: Project overview and quick start guide
- `CLAUDE.md`: AI development guidance

## Source Code Organization

### Core Application Structure

```
src/
├── components/
│   ├── __tests__/         # Component unit tests
│   └── [ComponentName]/   # Individual component directories
├── screens/
│   ├── Auth/
│   │   └── SignInScreen.tsx
│   ├── Map/
│   │   ├── index.tsx      # Main map screen with fog overlay
│   │   ├── __tests__/     # Map screen tests
│   │   └── components/    # Map-specific components
│   ├── Profile/
│   │   └── ProfileScreen.tsx
│   └── main/
│       └── MainScreen.tsx
├── navigation/
│   ├── AppNavigator.tsx   # Main navigation setup
│   ├── __tests__/         # Navigation tests
│   └── __mocks__/         # Navigation mocks for testing
├── store/
│   ├── index.ts           # Store configuration
│   └── slices/
│       ├── explorationSlice.ts  # Fog of war state management
│       ├── userSlice.ts         # User authentication state
│       └── __tests__/           # Store tests
├── types/
│   ├── navigation.ts      # Navigation type definitions
│   └── index.ts           # General type exports
├── utils/
│   ├── mapUtils.ts        # Geographic coordinate utilities
│   └── __tests__/         # Utility function tests
└── config/
    └── index.ts           # App configuration constants
```

### Key Implementation Files

#### State Management
- `src/store/slices/explorationSlice.ts`: Redux slice managing user's explored areas and GPS path
- `src/store/slices/userSlice.ts`: User authentication and profile state
- `src/store/index.ts`: Root store configuration with Redux Toolkit

#### Map and Fog Rendering
- `src/screens/Map/index.tsx`: Main map screen integrating React Native Maps with fog overlay
- `src/components/FogOverlay.tsx`: React Native Skia canvas component for fog rendering
- `src/utils/mapUtils.ts`: Coordinate conversion and geographic calculations

#### Navigation
- `src/navigation/AppNavigator.tsx`: React Navigation setup with authenticated and unauthenticated flows
- `src/types/navigation.ts`: TypeScript types for navigation parameters

## Testing Structure

### Unit and Integration Tests
- Tests are co-located with source files in `__tests__/` directories
- Uses Jest and React Native Testing Library
- Mock files for external dependencies in `__mocks__/` directories

### End-to-End Tests
```
e2e/
├── actions/
│   ├── loginActions.js    # Reusable login test actions
│   └── mapActions.js      # Map interaction test actions
├── artifacts/             # Test screenshots and videos
├── helpers/
│   └── testUtils.js       # E2E test utilities
└── [ScreenName].test.js   # Individual E2E test files
```

### Coverage Reports
- Generated in `coverage/` directory
- HTML reports available in `coverage/lcov-report/`

## Build and Deployment

### EAS Build Configuration
- **testflight**: Store distribution for TestFlight deployment
- **device**: Internal distribution for development testing  
- **development**: Development client with simulator support

### iOS Native Files
```
ios/
├── FogOfDog/
│   ├── AppDelegate.mm     # iOS app delegate
│   ├── Images.xcassets/   # App icons and launch images
│   └── Supporting/        # Supporting iOS files
├── FogOfDog.xcodeproj/    # Xcode project configuration
└── Pods/                  # CocoaPods dependencies
```

### Android Native Files
```
android/
├── app/
│   └── src/
│       └── main/
│           ├── java/      # Android Java code
│           └── res/       # Android resources
└── gradle/                # Gradle build system
```

## Dependencies and Package Management

### Production Dependencies
- **React Native**: Core framework
- **Expo**: Development platform and SDK
- **React Navigation**: Navigation library
- **Redux Toolkit**: State management
- **React Native Maps**: Map integration
- **React Native Skia**: Graphics rendering for fog overlay
- **Expo Location**: GPS and location services

### Development Dependencies
- **TypeScript**: Type checking
- **Jest**: Unit testing framework
- **Detox**: E2E testing framework
- **ESLint**: Code linting
- **React Native Testing Library**: Component testing utilities

### Build Tools
- **EAS Build**: Cloud build service
- **Metro**: JavaScript bundler
- **Babel**: JavaScript transpilation

## Code Style and Standards

### TypeScript Guidelines
- Strict TypeScript configuration enabled
- Prefer interfaces over type aliases for object shapes
- Use explicit return types for functions
- Leverage type inference where appropriate

### React/React Native Patterns
- Functional components with hooks
- Custom hooks for shared logic
- Component composition over inheritance
- Props interfaces defined per component

### Redux Patterns
- Redux Toolkit for all state management
- Separate slices for different domains (user, exploration, etc.)
- Async thunks for side effects
- Immer for immutable state updates

### File Organization
- Index files for clean imports
- Co-located tests with source files
- Consistent naming conventions (PascalCase for components, camelCase for utilities)
- Absolute imports configured via TypeScript paths

## Development Workflow

### Local Development
1. **Start Metro**: `npx expo start`
2. **Test on Device**: Use Expo Go app
3. **Run Tests**: `npm test`
4. **Lint Code**: `npm run lint`

### Testing Workflow
1. **Unit Tests**: Test individual components and utilities
2. **Integration Tests**: Test component interactions
3. **E2E Tests**: Test complete user flows
4. **Visual Testing**: Screenshot comparison for UI regression

### Build Process
1. **Development Builds**: Use Expo Go for rapid iteration
2. **Internal Testing**: EAS device profile for ad-hoc builds
3. **Production**: EAS testflight profile for App Store distribution

## Performance Considerations

### Bundle Size
- Tree shaking enabled via Metro
- Asset optimization for images
- Code splitting where appropriate

### Runtime Performance
- React Native Skia for GPU-accelerated fog rendering
- Memoization for expensive calculations
- Efficient Redux selectors
- Geographic coordinate caching

### Memory Management
- Proper cleanup of location listeners
- Canvas memory management for fog overlay
- Image cache optimization

## Security and Privacy

### Location Data
- Location permissions properly requested
- GPS data stored locally in Redux store
- No persistent storage of location data (currently)

### Build Security
- Signed builds via EAS Build
- Proper certificate management
- No sensitive data in bundle

## Future Extensibility

### Architecture Patterns
- Modular component design for feature additions
- Redux slice pattern allows easy state domain expansion
- Navigation structure supports new screen additions
- Testing patterns established for new features

### Scalability Considerations
- Geographic data can be optimized with spatial indexing
- Redux state can be persisted if needed
- Component library patterns established
- Build pipeline supports multiple environments 