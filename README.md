# 🌟 FogOfDog Frontend

<div align="center">

![FogOfDog Logo](https://img.shields.io/badge/🗺️-FogOfDog-purple?style=for-the-badge&logoColor=white)

**An interactive location-based exploration app that reveals the world as you walk through it**

[![📱 Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-blue?style=for-the-badge&logo=react&logoColor=white)](https://reactnative.dev/)
[![⚡ Framework](https://img.shields.io/badge/Built%20with-Expo%20%7C%20React%20Native-000020?style=for-the-badge&logo=expo&logoColor=white)](https://expo.dev/)
[![🚀 Quality Gate](https://img.shields.io/badge/Quality%20Gate-PASSING-brightgreen?style=for-the-badge&logo=github-actions&logoColor=white)](https://github.com/your-username/fogofdog-frontend/actions)

</div>

---

## 🚦 Build & Quality Status

<div align="center">

### 🏗️ Build Pipeline

[![🔨 Build Status](https://img.shields.io/github/actions/workflow/status/your-username/fogofdog-frontend/quality-gate.yml?branch=main&style=flat-square&logo=github-actions&label=Build)](https://github.com/your-username/fogofdog-frontend/actions)
[![📦 EAS Build](https://img.shields.io/badge/EAS%20Build-Ready-brightgreen?style=flat-square&logo=expo&logoColor=white)](https://expo.dev/)
[![🔄 CI/CD](https://img.shields.io/badge/CI%2FCD-Automated-blue?style=flat-square&logo=github-actions&logoColor=white)](https://github.com/your-username/fogofdog-frontend/actions)

### 🔍 Code Quality

[![🧹 ESLint](https://img.shields.io/badge/ESLint-Zero%20Warnings-brightgreen?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org/)
[![🏗️ SonarJS](https://img.shields.io/badge/SonarJS-Quality%20Rules-orange?style=flat-square&logo=eslint&logoColor=white)](https://github.com/SonarSource/eslint-plugin-sonarjs)
[![🎨 Prettier](https://img.shields.io/badge/Code%20Style-Prettier-ff69b4?style=flat-square&logo=prettier&logoColor=white)](https://prettier.io/)

### 🧪 Testing & Coverage

[![✅ Tests](https://img.shields.io/badge/Tests-47%2F47%20Passing-brightgreen?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/)
[![📈 Coverage](https://img.shields.io/badge/Coverage-72%25-yellow?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/)
[![🎯 Test Suites](https://img.shields.io/badge/Test%20Suites-8%2F8-brightgreen?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/)
[![⚡ Test Speed](https://img.shields.io/badge/Test%20Speed-1.7s-blue?style=flat-square&logo=jest&logoColor=white)](https://jestjs.io/)

### 🔒 Security & Dependencies

[![🛡️ Security](https://img.shields.io/badge/Security-No%20Vulnerabilities-brightgreen?style=flat-square&logo=npm&logoColor=white)](https://npmjs.com/)
[![📦 Dependencies](https://img.shields.io/badge/Dependencies-Up%20to%20Date-brightgreen?style=flat-square&logo=dependabot&logoColor=white)](https://github.com/dependabot)
[![🧩 Dead Code](https://img.shields.io/badge/Dead%20Code-Monitored-blue?style=flat-square&logo=typescript&logoColor=white)](https://github.com/unimported/unimported)

### 📊 Code Analysis

[![🔄 Duplicates](https://img.shields.io/badge/Code%20Duplication-3.49%25-brightgreen?style=flat-square&logo=codeclimate&logoColor=white)](https://github.com/kucherenko/jscpd)
[![🔗 Circular Deps](https://img.shields.io/badge/Circular%20Dependencies-0-brightgreen?style=flat-square&logo=madge&logoColor=white)](https://github.com/pahen/madge)
[![🧠 Complexity](https://img.shields.io/badge/Cognitive%20Complexity-Managed-orange?style=flat-square&logo=eslint&logoColor=white)](https://github.com/SonarSource/eslint-plugin-sonarjs)

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
- Comprehensive Jest test suite (47 tests)
- Zero ESLint warnings enforced in CI
- Enterprise-level code quality monitoring

⚡ **Performance Optimized**

- Efficient Redux state management
- Optimized bundle size monitoring
- Fast cold starts and smooth rendering

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **Expo CLI** (`npm install -g @expo/cli`)
- **iOS Simulator** or **Android Emulator**

### Installation

```bash
# Clone the repository (with submodules)
git clone --recurse-submodules https://github.com/your-username/fogofdog-frontend.git
cd fogofdog-frontend

# If you already cloned without --recurse-submodules:
git submodule update --init --recursive

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

**Use `slop-mop` for comprehensive quality checks:**

```bash
# Fast commit validation (recommended)
sm validate commit

# Full PR validation (comprehensive)
sm validate pr

# Run a specific gate only
sm validate -g javascript:tests

# Available gates: javascript:lint-format, javascript:tests, javascript:types,
# javascript:coverage, quality:complexity, quality:duplication, security:local
```

**What it runs (in parallel):**

- 🎨 Format Check & Auto-Fix (Prettier)
- 🔍 Lint Check & Auto-Fix (ESLint strict mode)
- 🔧 Type Check (TypeScript)
- 🧪 Test Suite & Coverage
- 🔄 Duplication Check
- 🔒 Security Audit & Auto-Fix

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
- **Quality**: ESLint + SonarJS (ESLint plugin) + Prettier

---

## 📊 Quality Dashboard

Our project maintains enterprise-level code quality through automated monitoring:

### 🎯 Quality Metrics

- **Code Coverage**: 72% (statements), 69% (branches)
- **Code Duplication**: 3.49% (excellent - under 5% threshold)
- **Circular Dependencies**: 0 (clean architecture)
- **Security Vulnerabilities**: 0 (all dependencies secure)
- **ESLint Warnings**: 0 (strict enforcement)

### 🔧 Quality Tools

- **SonarJS**: Quality rules for cognitive complexity, duplication detection, and code smells (integrated via ESLint)
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

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Run** quality checks (`npm run quality:check`)
4. **Commit** changes (`git commit -m 'Add amazing feature'`)
5. **Push** to branch (`git push origin feature/amazing-feature`)
6. **Open** a Pull Request

### 📋 Development Guidelines

- ✅ All tests must pass (`npm run test:ci`)
- ✅ Zero ESLint warnings (`npm run lint:strict`)
- ✅ Code coverage maintained above 70%
- ✅ TypeScript strict mode compliance
- ✅ Functions under 80 lines (enforced by ESLint)

---

## 📄 License

© 2024-2026 William Martin. All rights reserved. See [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **React Native Community** for the amazing framework
- **Expo Team** for the incredible developer experience
- **SonarSource** for the eslint-plugin-sonarjs quality rules
- **Jest Team** for the robust testing framework

---

<div align="center">

**Made with ❤️ and ☕ by the FogOfDog Team**

[![⭐ Star this repo](https://img.shields.io/github/stars/your-username/fogofdog-frontend?style=social)](https://github.com/your-username/fogofdog-frontend)
[![🐛 Report Bug](https://img.shields.io/badge/Report-Bug-red?style=for-the-badge&logo=github&logoColor=white)](https://github.com/your-username/fogofdog-frontend/issues)
[![💡 Request Feature](https://img.shields.io/badge/Request-Feature-blue?style=for-the-badge&logo=github&logoColor=white)](https://github.com/your-username/fogofdog-frontend/issues)

</div>
