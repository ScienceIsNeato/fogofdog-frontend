# 🌟 FogOfDog Frontend

<div align="center">

**An interactive location-based exploration app that reveals the world as you walk through it**

[![GitHub Actions](https://github.com/ScienceIsNeato/fogofdog-frontend/workflows/maintainAIbility-gate/badge.svg)](https://github.com/ScienceIsNeato/fogofdog-frontend/actions)
[![GitHub Issues](https://img.shields.io/github/issues/ScienceIsNeato/fogofdog-frontend)](https://github.com/ScienceIsNeato/fogofdog-frontend/issues)
[![GitHub Pull Requests](https://img.shields.io/github/issues-pr/ScienceIsNeato/fogofdog-frontend)](https://github.com/ScienceIsNeato/fogofdog-frontend/pulls)
[![GitHub Last Commit](https://img.shields.io/github/last-commit/ScienceIsNeato/fogofdog-frontend)](https://github.com/ScienceIsNeato/fogofdog-frontend/commits/main)

</div>

---

## 🚦 Quality & Build Status

<div align="center">

### 🏗️ Continuous Integration
[![Build Status](https://github.com/ScienceIsNeato/fogofdog-frontend/workflows/maintainAIbility-gate/badge.svg)](https://github.com/ScienceIsNeato/fogofdog-frontend/actions)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/ScienceIsNeato/fogofdog-frontend/maintainAIbility-gate.yml?branch=main&label=Quality%20Gate)](https://github.com/ScienceIsNeato/fogofdog-frontend/actions)

### 📊 Code Quality Metrics
[![CodeFactor](https://www.codefactor.io/repository/github/ScienceIsNeato/fogofdog-frontend/badge)](https://www.codefactor.io/repository/github/ScienceIsNeato/fogofdog-frontend)
[![Maintainability](https://api.codeclimate.com/v1/badges/YOUR_CODECLIMATE_ID/maintainability)](https://codeclimate.com/github/ScienceIsNeato/fogofdog-frontend/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/YOUR_CODECLIMATE_ID/test_coverage)](https://codeclimate.com/github/ScienceIsNeato/fogofdog-frontend/test_coverage)

### 🔒 Security & Dependencies  
[![Known Vulnerabilities](https://snyk.io/test/github/ScienceIsNeato/fogofdog-frontend/badge.svg)](https://snyk.io/test/github/ScienceIsNeato/fogofdog-frontend)
[![Dependencies](https://img.shields.io/david/ScienceIsNeato/fogofdog-frontend)](https://david-dm.org/ScienceIsNeato/fogofdog-frontend)
[![DevDependencies](https://img.shields.io/david/dev/ScienceIsNeato/fogofdog-frontend)](https://david-dm.org/ScienceIsNeato/fogofdog-frontend?type=dev)

### 📱 Platform & Framework
[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-blue?logo=react&logoColor=white)](https://reactnative.dev/)
[![Framework](https://img.shields.io/badge/Built%20with-Expo%20%7C%20React%20Native-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Quality Gates:** This project enforces strict quality standards with automated testing, linting, type checking, security scanning, and code coverage analysis on every commit.

</div>

---

## ✨ Features

🗺️ **Interactive Map Experience**
- Real-time location tracking with Expo Location
- Dynamic fog-of-war reveals explored areas
- Smooth map interactions with React Native Maps

🎨 **Beautiful UI/UX** 
- Custom Skia-powered fog overlay effects
- Responsive design with safe area handling
- Smooth animations and gestures

🧪 **Production-Ready Quality**
- 100% TypeScript with strict mode
- Comprehensive Jest test suite with high coverage
- Zero ESLint warnings enforced in CI
- Enterprise-level code quality monitoring

⚡ **Performance Optimized**
- Efficient Redux state management
- Optimized bundle size monitoring
- Fast cold starts and smooth rendering

🔧 **Advanced Development Tools**
- GPS injection system for testing without walking
- HUD stats panel for real-time performance monitoring
- Comprehensive quality gate system (ship_it.py)
- Parallel quality checks with fail-fast execution

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

## 🏗️ Architecture

### 📁 Project Structure
```
src/
├── components/          # Reusable UI components
│   ├── FogOverlay.tsx  # Skia-powered fog effects
│   └── LocationButton.tsx
├── screens/            # Screen components
│   ├── Auth/          # Authentication screens
│   └── Map/           # Main map experience
├── store/             # Redux state management
│   └── slices/        # Redux toolkit slices
├── types/             # TypeScript definitions
└── utils/             # Utility functions
```

### 🔧 Tech Stack
- **Frontend Framework**: React Native + Expo
- **State Management**: Redux Toolkit
- **Navigation**: React Navigation v6
- **Maps**: React Native Maps
- **Graphics**: React Native Skia
- **Location**: Expo Location
- **Testing**: Jest + React Native Testing Library + Maestro E2E
- **Quality**: ESLint + SonarJS + Prettier

---

## 📊 Quality Dashboard

Our project maintains enterprise-level code quality through automated monitoring:

### 🎯 Quality Metrics
- **Code Coverage**: Above threshold with comprehensive test suite
- **Code Duplication**: Well below threshold (excellent code quality)
- **Circular Dependencies**: 0 (clean architecture)
- **Security Vulnerabilities**: 0 (all dependencies secure)
- **ESLint Warnings**: 0 (strict enforcement)

### 🔧 Quality Tools
- **SonarQube Cloud**: Enterprise-grade static analysis with A ratings across Security, Reliability, and Maintainability
- **SonarJS**: Same quality rules as SonarCloud Enterprise (integrated via ESLint)
- **jscpd**: Duplicate code detection
- **madge**: Circular dependency analysis  
- **Prettier**: Consistent code formatting
- **unimported**: Dead code detection
- **npm audit**: Security vulnerability scanning

### 📈 CI/CD Pipeline
Our GitHub Actions workflow ensures quality:
1. **🔒 Security Audit** - High-priority vulnerability scanning
2. **🧹 Lint Check** - Zero warnings policy
3. **🔧 TypeScript Check** - Strict type safety
4. **📊 Test Coverage** - Comprehensive test execution
5. **🏗️ Build Verification** - Multi-platform export validation

---



## 📄 License

This project is proprietary software. All rights reserved.

---



<div align="center">

**FogOfDog - Private GPS Exploration App**

[![🐛 Report Bug](https://img.shields.io/badge/Report-Bug-red?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ScienceIsNeato/fogofdog-frontend/issues)
[![💡 Request Feature](https://img.shields.io/badge/Request-Feature-blue?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ScienceIsNeato/fogofdog-frontend/issues)

</div>