# 🌟 FogOfDog Frontend

<div align="center">

**An interactive location-based exploration app that reveals the world as you walk through it**

[![GitHub Actions](https://github.com/ScienceIsNeato/fogofdog-frontend/workflows/maintainAIbility-gate/badge.svg)](https://github.com/ScienceIsNeato/fogofdog-frontend/actions/workflows/maintainAIbility-gate.yml)
[![GitHub Issues](https://img.shields.io/github/issues/ScienceIsNeato/fogofdog-frontend)](https://github.com/ScienceIsNeato/fogofdog-frontend/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/ScienceIsNeato/fogofdog-frontend)](https://github.com/ScienceIsNeato/fogofdog-frontend/pulls)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/ScienceIsNeato/fogofdog-frontend)](https://github.com/ScienceIsNeato/fogofdog-frontend/commits/main)

</div>

---

## 🚦 Build Status

All quality checks are automated via GitHub Actions. Check the [workflow runs](https://github.com/ScienceIsNeato/fogofdog-frontend/actions/workflows/maintainAIbility-gate.yml) for detailed results.

---

## 🛠️ Core Functionality

**Location-Based Exploration**
- Real-time GPS tracking via Expo Location API
- Fog-of-war overlay system using React Native Skia
- Map integration with React Native Maps
- Persistent exploration state with Redux

**Development & Testing Infrastructure**
- TypeScript strict mode enforcement
- Jest unit testing with coverage thresholds
- Maestro end-to-end testing framework
- GPS injection system for development testing

**Code Quality Automation**
- ESLint with zero-warning enforcement
- Prettier code formatting
- SonarQube static analysis integration
- Automated security vulnerability scanning
- Circular dependency detection
- Code duplication monitoring

**Advanced Development Tools**
- GPS coordinate injection for testing
- Real-time performance monitoring HUD
- Parallel quality check execution (ship_it.py)
- Metro bundler management scripts

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ 
- **Expo CLI** (`npm install -g @expo/cli`)
- **iOS Simulator** or **Android Emulator**

### Installation

```bash
# Clone the repository
git clone https://github.com/ScienceIsNeato/fogofdog-frontend.git
cd fogofdog-frontend

# Install dependencies
npm install

# Start the development server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator  
npm run android
```

---

## 🛠️ Development Workflow

### 🚀 Metro Development Server

**Always use the refresh-metro script to start Metro:**

```bash
# Start Metro with persistent logging
./scripts/refresh-metro.sh

# Monitor logs in real-time (run in separate terminal)
./scripts/monitor-metro-logs.sh
```

**Benefits:**
- 📁 Persistent logs saved to timestamped files in `/tmp/`
- 📍 Current log tracker at `/tmp/METRO_CURRENT_LOG_FILENAME.txt`
- 🔄 Programmatic app reload to connect to Metro
- 🔒 Never lose logs when terminals close
- 📡 Can monitor from any directory

**Workflow:**
1. Run `./scripts/refresh-metro.sh` (kills old Metro, starts new one, reloads app)
2. Run `./scripts/monitor-metro-logs.sh` in another terminal to watch logs
3. Develop with real-time log visibility

### ✅ Quality Gate (Before Committing)

**Use `ship_it.py` for parallelized quality checks:**

```bash
# Fast parallel execution (recommended)
python scripts/ship_it.py --fail-fast

# Full quality gate
python scripts/ship_it.py

# Run specific checks only
python scripts/ship_it.py --checks tests lint format
```

**Parallel execution includes:**
- 🎨 Format Check & Auto-Fix (Prettier)
- 🔍 Lint Check & Auto-Fix (ESLint strict mode) 
- 🔧 Type Check (TypeScript strict mode)
- 🧪 Test Suite & Coverage (78%+ threshold)
- 🔄 Duplication Check (<3% threshold)
- 🔒 Security Audit & Auto-Fix
- 📊 SonarQube Analysis

### 🧪 Testing

#### Unit & Integration Tests (Jest)
```bash
# Run all tests
npm test

# Run tests in CI mode
npm run test:ci

# Run with coverage
npm run test:coverage
```

#### End-to-End Testing (Maestro)
```bash
# Install Maestro CLI (one-time setup)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Add to PATH
export PATH="$PATH":"$HOME/.maestro/bin"

# Build standalone app for testing
npm run ios -- --configuration Release

# ⚠️ IMPORTANT: Always use the integration test script (never run maestro directly)
# This ensures proper app readiness checks and prevents white screen issues

# Run all integration tests
./scripts/run_integration_tests.sh .maestro/

# Run specific test flow
./scripts/run_integration_tests.sh .maestro/login-to-map-test.yaml
./scripts/run_integration_tests.sh .maestro/background-gps-test.yaml

# For debugging only (record test execution)
maestro record .maestro/login-to-map-test.yaml
```

### 🔍 Code Quality
```bash
# Check code quality (full pipeline)
npm run quality:check

# Fix linting and formatting
npm run quality:fix

# Advanced code analysis
npm run quality:advanced

# Run security audit
npm run audit:security
```

### 🏗️ Building
```bash
# Build for production
npm run build:verify

# Analyze bundle size
npm run bundle:analyze

# Build with EAS
npx eas build --platform ios --profile production
```

---

## 🏗️ System Architecture

### Technical Stack
- **Runtime**: React Native 0.74+ with Expo SDK 51+
- **Language**: TypeScript 5.x with strict mode
- **State Management**: Redux Toolkit with RTK Query
- **Navigation**: React Navigation v6 (stack + tab navigation)
- **Graphics Rendering**: React Native Skia for fog overlay
- **Geolocation**: Expo Location with background permissions
- **Map Engine**: React Native Maps (iOS MapKit / Android Google Maps)
- **Storage**: AsyncStorage for persistence
- **Testing**: Jest + React Native Testing Library + Maestro

### Application Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
├─────────────────────────────────────────────────────────────┤
│  Screens/          │  Components/       │  Navigation/      │
│  - MapScreen       │  - OptimizedFog    │  - TabNavigator   │
│  - AuthScreens     │  - HUDStatsPanel   │  - StackNavigator │
│  - ProfileScreen   │  - LocationButton  │                   │
├─────────────────────────────────────────────────────────────┤
│                     Business Logic Layer                    │
├─────────────────────────────────────────────────────────────┤
│  Services/                        │  Store/                 │
│  - BackgroundLocationService      │  - explorationSlice     │
│  - GPSInjectionService            │  - statsSlice           │
│  - StatsCalculationService        │  - userSlice            │
│  - PermissionsOrchestrator        │                         │
├─────────────────────────────────────────────────────────────┤
│                      Data Layer                             │
├─────────────────────────────────────────────────────────────┤
│  - AsyncStorage (exploration state)                         │
│  - Expo Location API                                        │
│  - React Native Maps                                        │
│  - React Native Skia (fog rendering)                        │
└─────────────────────────────────────────────────────────────┘
```

View current status: [Quality Gate Workflow](https://github.com/ScienceIsNeato/fogofdog-frontend/actions/workflows/maintainAIbility-gate.yml)

---



## 📄 License

This project is proprietary software. All rights reserved.

---


