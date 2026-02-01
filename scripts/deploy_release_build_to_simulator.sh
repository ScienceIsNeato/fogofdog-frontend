#!/bin/bash

# Deploy Release Build to iOS Simulator Script
# Builds and deploys production-ready release build to iOS simulator
# Used for E2E testing and production validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
FRESH_INSTALL=false
FORCE_REBUILD=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --fresh)
      FRESH_INSTALL=true
      shift
      ;;
    --force)
      FORCE_REBUILD=true
      shift
      ;;
    --help|-h)
      SHOW_HELP=true
      shift
      ;;
    *)
      echo -e "${RED}❌ Unknown option: $1${NC}"
      SHOW_HELP=true
      shift
      ;;
  esac
done

if [ "$SHOW_HELP" = true ]; then
  echo -e "${GREEN}🚀 FogOfDog Release Build Deployment Script${NC}"
  echo "================================================"
  echo ""
  echo -e "${YELLOW}Usage:${NC}"
  echo "  $0 [OPTIONS]"
  echo ""
  echo -e "${YELLOW}Options:${NC}"
  echo "  --fresh    Clear simulator app data (simulate first-time user)"
  echo "  --force    Force rebuild even if release build exists"
  echo "  --help,-h  Show this help message"
  echo ""
  echo -e "${YELLOW}Environment Variables:${NC}"
  echo "  SIMULATOR_NAME    Override default simulator (default: iPhone 15 Pro)"
  echo ""
  echo -e "${YELLOW}Examples:${NC}"
  echo "  $0                                    # Normal release deployment"
  echo "  $0 --fresh                           # Fresh release install (shows onboarding)"
  echo "  $0 --force                           # Force rebuild release build"
  echo "  SIMULATOR_NAME=\"iPhone 14\" $0 --fresh  # Fresh release install on iPhone 14"
  exit 0
fi

echo -e "${GREEN}🚀 FogOfDog Release Build Deployment Script${NC}"
echo "================================================"

# Use currently booted simulator or default
BOOTED_SIMULATOR=$(xcrun simctl list devices | grep "Booted" | head -1 | sed 's/.*iPhone \([^(]*\).*/iPhone \1/' | sed 's/ *$//')
if [ -n "$BOOTED_SIMULATOR" ]; then
    DEFAULT_SIMULATOR="$BOOTED_SIMULATOR"
    echo -e "${BLUE}🎯 Using currently booted simulator: $DEFAULT_SIMULATOR${NC}"
else
    DEFAULT_SIMULATOR="iPhone 15 Pro"
    echo -e "${YELLOW}⚠️  No booted simulator found, will use: $DEFAULT_SIMULATOR${NC}"
fi
TARGET_SIMULATOR="${SIMULATOR_NAME:-$DEFAULT_SIMULATOR}"

echo -e "${YELLOW}📱 Target Simulator:${NC} $TARGET_SIMULATOR"
echo -e "${YELLOW}🏗️  Build Configuration:${NC} Release (Production)"
echo -e "${YELLOW}🔧 Metro Server:${NC} Not needed (bundled)"
if [ "$FRESH_INSTALL" = true ]; then
  echo -e "${YELLOW}🆕 Fresh Install:${NC} Yes (will show onboarding tutorial)"
else
  echo -e "${YELLOW}🆕 Fresh Install:${NC} No (preserves app data)"
fi
if [ "$FORCE_REBUILD" = true ]; then
  echo -e "${YELLOW}🔄 Force Rebuild:${NC} Yes (will rebuild regardless)"
else
  echo -e "${YELLOW}🔄 Force Rebuild:${NC} No (uses existing build if available)"
fi
echo ""

# Check if simulators are available
echo -e "${YELLOW}🔍 Checking available simulators...${NC}"
if command -v xcrun >/dev/null 2>&1; then
    AVAILABLE_SIMS=$(xcrun simctl list devices available | grep "iPhone\|iPad" | head -5)
    if [ -n "$AVAILABLE_SIMS" ]; then
        echo -e "${BLUE}Available simulators:${NC}"
        echo "$AVAILABLE_SIMS" | sed 's/^/  /'
        echo ""
    else
        echo -e "${YELLOW}⚠️  No simulators found, but continuing anyway...${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  xcrun not available, skipping simulator check...${NC}"
fi

# Find the target simulator device ID
DEVICE_ID=$(xcrun simctl list devices | grep "$TARGET_SIMULATOR.*Booted" | head -1 | grep -o '[A-F0-9-]\{36\}')

if [ -z "$DEVICE_ID" ]; then
  # Try to find any available device with that name
  DEVICE_ID=$(xcrun simctl list devices | grep "$TARGET_SIMULATOR" | head -1 | grep -o '[A-F0-9-]\{36\}')
  
  if [ -n "$DEVICE_ID" ]; then
    echo -e "${BLUE}Booting simulator: $TARGET_SIMULATOR${NC}"
    xcrun simctl boot "$DEVICE_ID" || true
    sleep 3
  else
    echo -e "${RED}❌ Could not find simulator: $TARGET_SIMULATOR${NC}"
    exit 1
  fi
fi

# Clear app data if fresh install requested
if [ "$FRESH_INSTALL" = true ]; then
  echo -e "${YELLOW}🧹 Clearing app data for fresh install...${NC}"
  echo -e "${BLUE}Clearing app data for com.fogofdog.app...${NC}"
  # Clear app data (this resets AsyncStorage and all app data)
  xcrun simctl uninstall "$DEVICE_ID" com.fogofdog.app 2>/dev/null || echo "  App not installed yet, skipping uninstall"
  echo -e "${GREEN}✅ App data cleared - onboarding will appear${NC}"
  echo ""
fi

# Setup simulator location for testing
echo -e "${YELLOW}🌍 Setting up simulator location...${NC}"
if command -v jq >/dev/null 2>&1; then
  # Use the dedicated setup script
  if [ -f "scripts/setup-simulator-location.sh" ]; then
    echo "Running location setup script..."
    bash scripts/setup-simulator-location.sh || {
      echo -e "${YELLOW}⚠️  Location setup failed, continuing anyway...${NC}"
    }
  else
    # Fallback: Set location directly
    echo "Setting default location (Eugene, Oregon South Hills)..."
    xcrun simctl location booted set "44.0248,-123.1044" 2>/dev/null || {
      echo -e "${YELLOW}⚠️  Could not set location, continuing anyway...${NC}"
    }
  fi
else
  echo -e "${YELLOW}⚠️  jq not available, skipping location setup...${NC}"
fi
echo ""

# Check if release build exists
APP_NAME="FogOfDog"
BUILD_PATH="/Users/pacey/Library/Developer/Xcode/DerivedData/Build/Products/Release-iphonesimulator/${APP_NAME}.app"

if [ "$FORCE_REBUILD" = true ]; then
    echo -e "${YELLOW}🔄 Force rebuild requested - removing existing build...${NC}"
    rm -rf "$BUILD_PATH"
fi

# Build release version if needed
if [ ! -d "$BUILD_PATH" ] || [ "$FORCE_REBUILD" = true ]; then
    echo -e "${GREEN}🔨 Building Release configuration...${NC}"
    echo "This may take a few minutes..."
    echo ""
    
    # Build release without installing (we'll install manually for better control)
    timeout 600 npx expo run:ios --configuration Release --no-install || {
        exit_code=$?
        if [ $exit_code -eq 124 ]; then
            echo -e "${RED}❌ Release build timed out after 10 minutes${NC}"
        else
            echo -e "${RED}❌ Release build failed with exit code $exit_code${NC}"
        fi
        exit $exit_code
    }
    echo -e "${GREEN}✅ Release build completed${NC}"
else
    echo -e "${GREEN}✅ Release build already exists at $BUILD_PATH${NC}"
fi

# Install release build on simulator
echo -e "${YELLOW}📱 Installing Release build on simulator...${NC}"

# First uninstall any existing version to ensure clean state
echo -e "${BLUE}🗑️ Removing any existing app version...${NC}"
xcrun simctl uninstall "$DEVICE_ID" com.fogofdog.app 2>/dev/null || true

echo -e "${BLUE}📦 Installing Release build...${NC}"
xcrun simctl install "$DEVICE_ID" "$BUILD_PATH"

# Record deployment type for E2E script reference
echo "release" > .currently_deployed_type
echo "$(date '+%Y-%m-%d %H:%M:%S') - Release build deployed to $TARGET_SIMULATOR" >> .deployment_history

echo ""
echo -e "${GREEN}✅ Release deployment completed successfully!${NC}"
echo -e "${GREEN}📱 FogOfDog Release build is now running on $TARGET_SIMULATOR${NC}"
echo -e "${BLUE}📝 Deployment type recorded: release${NC}"
echo ""
echo -e "${YELLOW}💡 Release Build Notes:${NC}"
echo "  • No Metro development server needed"
echo "  • No development menu available (Cmd+D won't work)"
echo "  • App bundle is self-contained and production-ready"
echo "  • Perfect for E2E testing and production validation"
echo ""

# Fresh install specific tips
if [ "$FRESH_INSTALL" = true ]; then
  echo -e "${GREEN}🎯 Fresh Install Mode:${NC}"
  echo "  • App data has been cleared"
  echo "  • You should see the 6-step onboarding tutorial"  
  echo "  • This simulates a first-time user experience"
  echo "  • Default location (Eugene, Oregon) has been set automatically"
  echo ""
fi

echo -e "${GREEN}🎉 Ready for E2E testing!${NC}"
