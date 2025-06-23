# 🧪 Testing Documentation

This document covers the comprehensive testing strategy for FogOfDog frontend, including unit tests, integration tests, and end-to-end testing.

## 💰 CI Cost Awareness (Updated June 22, 2025)

**GitHub Actions Pricing** (current rates):
- **Linux runners**: $0.008/minute
- **macOS runners**: $0.08/minute (10x more expensive!)
- **Storage**: $0.000336/GB-month

**Current Usage** (June 2025):
- Actions Linux: 921 min = $7.37
- Actions macOS: 107.9 min = $8.63
- Actions storage: 1.91 GB-hr = <$0.01

**Cost Control Measures**:
- Maestro integration tests run **manual trigger only** (not on every PR)
- Use `workflow_dispatch` for expensive macOS tests
- Monitor usage via GitHub billing dashboard
- Target <30 minutes total macOS time per month

## 📋 Testing Strategy

Our testing approach follows a pyramid structure:
1. **Unit Tests** (Jest) - Fast, isolated component and utility testing
2. **Integration Tests** (Jest) - Testing component interactions and Redux integration  
3. **End-to-End Tests** (Maestro) - Complete user flow validation

---

## 🎯 Unit & Integration Testing (Jest)

### Quick Commands
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests in CI mode (single run)
npm run test:ci

# Run with coverage report
npm run test:coverage

# Run specific test file
npm test -- LocationButton.test.tsx

# Run tests matching pattern
npm test -- --testNamePattern="should render"
```

### Test Structure
```
src/
├── __tests__/           # Utility and shared test files
├── components/
│   └── __tests__/       # Component unit tests
├── screens/
│   └── **/__tests__/    # Screen integration tests
├── services/
│   └── __tests__/       # Service layer tests
├── store/
│   └── slices/__tests__/ # Redux slice tests
└── utils/
    └── __tests__/       # Utility function tests
```

### Coverage Targets
- **Statements**: 92%+ (currently 91.78%)
- **Branches**: 84%+ (currently 84.16%)
- **Functions**: 92%+ (currently 92.3%)
- **Lines**: 92%+ (currently 92.17%)

---

## 🚀 End-to-End Testing (Maestro)

### Why Maestro?
We switched from Detox to Maestro for E2E testing because:
- ✅ **Simpler Setup**: No complex native dependencies
- ✅ **Better Reliability**: More stable test execution
- ✅ **Faster Execution**: Significantly faster than Detox
- ✅ **Easier Debugging**: Built-in recording and screenshots
- ✅ **YAML Configuration**: Human-readable test flows

### Prerequisites

#### Install Maestro CLI
```bash
# Install Maestro (one-time setup)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Add to PATH (add to ~/.zshrc or ~/.bashrc for persistence)
export PATH="$PATH":"$HOME/.maestro/bin"

# Verify installation
maestro -v
```

#### iOS Setup (Optional - for better integration)
```bash
# Install IDB (iOS debugging bridge) for enhanced iOS support
brew tap facebook/fb
brew install facebook/fb/idb-companion
```

### Build Requirements

Maestro requires a **standalone app build** with the JavaScript bundle embedded. This differs from development builds that depend on Metro server.

#### Create Release Build
```bash
# Build standalone release version for iOS
npm run ios -- --configuration Release

# Alternative: Build with EAS (includes Fastlane complexity)
npx eas build --platform ios --profile e2e --local --no-wait
```

**Important**: The app must include the embedded JS bundle and run independently without Metro server.

### Test Structure

Our Maestro tests are located in `.maestro/` directory:

```
.maestro/
└── login-to-map-test.yaml    # Complete user flow test
```

### Running Tests

#### Basic Test Execution
```bash
# Run all Maestro tests
maestro test .maestro/

# Run specific test flow
maestro test .maestro/login-to-map-test.yaml

# Run test with verbose output
maestro test .maestro/login-to-map-test.yaml --debug
```

#### Test Recording & Debugging
```bash
# Record test execution (creates MP4 video)
maestro record .maestro/login-to-map-test.yaml

# Record will output a shareable link like:
# https://maestro-record.ngrok.io/uploads/[unique-id].mp4
```

#### Test Artifacts
Maestro automatically saves test artifacts to `~/.maestro/tests/[timestamp]/`:
- **HTML Report**: `ai-report-[test-name].html` - Visual test summary
- **JSON Metadata**: `ai-[test-name].json` - Execution data
- **Command Log**: `commands-[test-name].yaml` - Step-by-step log
- **Maestro Log**: `maestro.log` - Detailed execution logs

### Test Flow Example

Our current test covers the complete user journey:

```yaml
appId: com.fogofdog.app
---
# 1. Launch app with clean state
- launchApp:
    appId: com.fogofdog.app
    clearState: true

# 2. Verify we're on login screen
- assertVisible: 
    text: "Sign In"
- assertVisible:
    id: "signInButton"

# 3. Perform authentication
- tapOn:
    id: "signInButton"

# 4. Handle location permissions (if prompted)
- runFlow:
    when:
      visible: "Allow"
    commands:
      - tapOn: "Allow While Using App"

# 5. Verify navigation to map screen
- waitForAnimationToEnd
- assertVisible:
    id: "map-screen"
```

### GPS Location Injection for Testing

For complete GPS injection documentation including coordinates, commands, and troubleshooting, see:

📍 **[GPS Injection Guide](./GPS_INJECTION_GUIDE.md)**

### Writing New Tests

#### Test Flow Structure
```yaml
# App identifier (must match app.json)
appId: com.fogofdog.app
jsEngine: graaljs  # REQUIRED for JavaScript features
---
# Test steps go here
- launchApp:
    appId: com.fogofdog.app
    clearState: true
    
- assertVisible:
    text: "Expected Text"
    
- tapOn:
    id: "button-test-id"
    
- waitForAnimationToEnd
```

#### Common Maestro Commands
- `launchApp`: Start the application
- `assertVisible`: Verify element is visible
- `tapOn`: Tap on element (by text, id, or coordinates)
- `inputText`: Enter text into fields
- `scrollUntilVisible`: Scroll to find element
- `waitForAnimationToEnd`: Wait for animations
- `runFlow`: Conditional execution

#### Element Selection
```yaml
# By test ID (preferred)
- tapOn:
    id: "signInButton"

# By visible text
- tapOn:
    text: "Sign In"

# By coordinates (last resort)
- tapOn:
    point: "50%,25%"
```

### Best Practices

#### Test Design
- ✅ **Use testID attributes** in React components for reliable element selection
- ✅ **Start with clean state** using `clearState: true`
- ✅ **Handle optional dialogs** with conditional `runFlow` blocks
- ✅ **Wait for animations** before asserting visibility
- ✅ **Test realistic user flows** rather than isolated interactions

#### Element Identification
```tsx
// React Native component with testID
<TouchableOpacity testID="signInButton" onPress={handleSignIn}>
  <Text>Sign In</Text>
</TouchableOpacity>
```

#### Error Handling
- Use `runFlow` with `when` conditions for optional dialogs
- Add `waitForAnimationToEnd` before critical assertions
- Include fallback strategies for flaky elements

### CI/CD Integration

#### GitHub Actions (Future)
```yaml
# Example CI step for Maestro (not yet implemented)
- name: Run Maestro E2E Tests
  run: |
    # Build release app
    npm run ios -- --configuration Release
    
    # Run Maestro tests
    maestro test .maestro/
    
    # Upload test artifacts
    # (artifacts automatically saved in ~/.maestro/tests/)
```

#### Debugging CI Failures
When Maestro tests fail in CI:
1. **Check artifacts** in `~/.maestro/tests/[timestamp]/`
2. **Review maestro.log** for detailed execution
3. **Use recording locally** to reproduce issues
4. **Verify element selectors** haven't changed

---

## 🔧 Test Configuration

### Jest Configuration
Located in `jest.config.js`:
- Custom test environment setup
- Mock configurations for React Native modules
- Coverage thresholds and reporting
- Transform and module resolution

### Maestro Configuration
Maestro uses simple YAML files with no complex configuration needed.

**App Requirements**:
- Bundle ID: `com.fogofdog.app` (defined in `app.json`)
- Standalone build with embedded JS bundle
- TestID attributes on interactive elements

---

## 📊 Quality Metrics

### Current Test Status
- **Jest Tests**: 186 tests passing
- **Test Suites**: 16 suites passing  
- **Maestro Tests**: 1 complete user flow (6 test steps)
- **Coverage**: 91.78% statements, 84.16% branches

### Quality Gates
All tests must pass before merge:
1. ✅ Jest unit/integration tests
2. ✅ ESLint with zero warnings
3. ✅ TypeScript compilation
4. ✅ Prettier formatting
5. ✅ Maestro E2E tests (when available in CI)

---

## 🚨 Troubleshooting

### Common Issues

#### Jest Tests
```bash
# Clear Jest cache
npm test -- --clearCache

# Update snapshots
npm test -- --updateSnapshot

# Debug specific test
npm test -- --verbose ComponentName.test.tsx
```

#### Maestro Tests
```bash
# Verify app is installed
maestro test .maestro/login-to-map-test.yaml --debug

# Check available simulators
xcrun simctl list devices

# Reset simulator state
xcrun simctl erase all
```

#### Build Issues
```bash
# Clean iOS build
cd ios && xcodebuild clean && cd ..

# Rebuild with fresh bundle
rm -rf node_modules && npm install
npm run ios -- --configuration Release
```

### Getting Help
- **Jest Issues**: Check React Native Testing Library docs
- **Maestro Issues**: Check [Maestro documentation](https://maestro.mobile.dev/)
- **Build Issues**: Verify Expo and React Native setup

---

## 📚 Resources

### Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Maestro Documentation](https://maestro.mobile.dev/)
- [Expo Testing Guide](https://docs.expo.dev/guides/testing/)

### Tools
- [Maestro Studio](https://maestro.mobile.dev/studio) - Visual test creation
- [Maestro Cloud](https://maestro.mobile.dev/cloud) - Cloud testing platform
- [React Native Debugger](https://github.com/jhen0409/react-native-debugger)

---

*Last Updated: January 2025* 