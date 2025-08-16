#!/bin/bash

# Deploy to iOS Simulator Script
# Automatically deploys development build to iOS simulator

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
FRESH_INSTALL=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --fresh)
      FRESH_INSTALL=true
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
  echo -e "${GREEN}🚀 FogOfDog Simulator Deployment Script${NC}"
  echo "================================================"
  echo ""
  echo -e "${YELLOW}Usage:${NC}"
  echo "  $0 [OPTIONS]"
  echo ""
  echo -e "${YELLOW}Options:${NC}"
  echo "  --fresh    Clear simulator app data (simulate first-time user)"
  echo "  --help,-h  Show this help message"
  echo ""
  echo -e "${YELLOW}Environment Variables:${NC}"
  echo "  SIMULATOR_NAME    Override default simulator (default: iPhone 15 Pro)"
  echo ""
  echo -e "${YELLOW}Examples:${NC}"
  echo "  $0                                    # Normal deployment"
  echo "  $0 --fresh                           # Fresh install (shows onboarding)"
  echo "  SIMULATOR_NAME=\"iPhone 14\" $0 --fresh  # Fresh install on iPhone 14"
  exit 0
fi

echo -e "${GREEN}🚀 FogOfDog Simulator Deployment Script${NC}"
echo "================================================"

# Default simulator (can be overridden with environment variable)
DEFAULT_SIMULATOR="iPhone 15 Pro"
TARGET_SIMULATOR="${SIMULATOR_NAME:-$DEFAULT_SIMULATOR}"

echo -e "${YELLOW}📱 Target Simulator:${NC} $TARGET_SIMULATOR"
echo -e "${YELLOW}🏗️  Build Configuration:${NC} Debug (Development)"
echo -e "${YELLOW}🔧 Metro Server:${NC} Will start automatically"
if [ "$FRESH_INSTALL" = true ]; then
  echo -e "${YELLOW}🆕 Fresh Install:${NC} Yes (will show onboarding tutorial)"
else
  echo -e "${YELLOW}🆕 Fresh Install:${NC} No (preserves app data)"
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

# Clear app data if fresh install requested
if [ "$FRESH_INSTALL" = true ]; then
  echo -e "${YELLOW}🧹 Clearing app data for fresh install...${NC}"
  
  # Find the target simulator device ID
  DEVICE_ID=$(xcrun simctl list devices | grep "$TARGET_SIMULATOR.*Booted" | head -1 | sed -n 's/.*(\(.*\)).*/\1/p')
  
  if [ -z "$DEVICE_ID" ]; then
    # Try to find any available device with that name
    DEVICE_ID=$(xcrun simctl list devices | grep "$TARGET_SIMULATOR" | head -1 | sed -n 's/.*(\(.*\)).*/\1/p')
    
    if [ -n "$DEVICE_ID" ]; then
      echo -e "${BLUE}Booting simulator: $TARGET_SIMULATOR${NC}"
      xcrun simctl boot "$DEVICE_ID" || true
      sleep 3
    fi
  fi
  
  if [ -n "$DEVICE_ID" ]; then
    echo -e "${BLUE}Clearing app data for com.fogofdog.app...${NC}"
    # Clear app data (this resets AsyncStorage and all app data)
    xcrun simctl uninstall "$DEVICE_ID" com.fogofdog.app 2>/dev/null || echo "  App not installed yet, skipping uninstall"
    echo -e "${GREEN}✅ App data cleared - onboarding will appear${NC}"
  else
    echo -e "${YELLOW}⚠️  Could not find device ID for $TARGET_SIMULATOR, continuing anyway...${NC}"
  fi
  echo ""
fi

# Setup simulator location for development
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

# Clear Metro cache for fresh development build
echo -e "${YELLOW}🧹 Clearing Metro cache for fresh build...${NC}"
npx expo start --clear --no-dev --minify >/dev/null 2>&1 &
METRO_PID=$!
sleep 2
kill $METRO_PID 2>/dev/null || true
echo "Metro cache cleared"
echo ""

# Build and deploy to simulator
echo -e "${GREEN}🔨 Building and deploying to simulator...${NC}"
if [ "$TARGET_SIMULATOR" = "$DEFAULT_SIMULATOR" ]; then
    echo "Command: npx expo run:ios --configuration Debug"
else
    echo "Command: npx expo run:ios --simulator \"$TARGET_SIMULATOR\" --configuration Debug"
fi
echo ""

# Use timeout to prevent hanging
if [ "$TARGET_SIMULATOR" = "$DEFAULT_SIMULATOR" ]; then
    # Use default simulator (faster)
    timeout 300 npx expo run:ios --configuration Debug || {
        exit_code=$?
        if [ $exit_code -eq 124 ]; then
            echo -e "${RED}❌ Deployment timed out after 5 minutes${NC}"
        else
            echo -e "${RED}❌ Deployment failed with exit code $exit_code${NC}"
        fi
        exit $exit_code
    }
else
    # Use specific simulator
    timeout 300 npx expo run:ios --simulator "$TARGET_SIMULATOR" --configuration Debug || {
        exit_code=$?
        if [ $exit_code -eq 124 ]; then
            echo -e "${RED}❌ Deployment timed out after 5 minutes${NC}"
        else
            echo -e "${RED}❌ Deployment failed with exit code $exit_code${NC}"
        fi
        exit $exit_code
    }
fi

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}📱 FogOfDog should now be running on $TARGET_SIMULATOR${NC}"

# Start persistent Metro development server with live logging
LIVE_LOG_FILE="/tmp/fog_of_dog_expo_simulator_live.log"
echo -e "${BLUE}🚀 Starting persistent Metro development server with live logging...${NC}"
echo "$(date '+%Y-%m-%d %H:%M:%S') - FogOfDog Metro Server Started for $TARGET_SIMULATOR" > "$LIVE_LOG_FILE"

# Start Metro server in background with live logging
nohup npx expo start --dev-client 2>&1 | tee -a "$LIVE_LOG_FILE" > /dev/null &
METRO_SERVER_PID=$!

echo -e "${GREEN}🔥 Metro development server running in background (PID: $METRO_SERVER_PID)${NC}"
echo -e "${BLUE}📋 Live logs available at: $LIVE_LOG_FILE${NC}"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
## Usage Tips

### �� Simulator Control
  * Use Cmd+R in simulator to reload
  * Use Cmd+D to open developer menu
  * Set SIMULATOR_NAME environment variable to use different simulator
  * Example: SIMULATOR_NAME=\"iPhone 14\" ./scripts/deploy_to_simulator.sh

### 📋 Log Monitoring
  * Monitor live logs: ./scripts/monitor-metro-logs.sh
  * Direct log access: tail -f $LIVE_LOG_FILE
  * Logs persist across deployments and terminals

### 🔄 Metro Server Management
  * Kill Metro server: pkill -f "expo start" 
  * Restart Metro: ./scripts/refresh-metro.sh
  * Fresh deployment: ./scripts/deploy_development_build_to_simulator.sh --fresh

### 🌍 Location Setup
  * Default location (Eugene, Oregon) is set automatically
  * Manual location setup: ./scripts/setup-simulator-location.sh
  * Custom location: xcrun simctl location booted set <lat>,<lon>

# Fresh install specific tips
if [ "$FRESH_INSTALL" = true ]; then
  echo ""
  echo -e "${GREEN}🎯 Fresh Install Mode:${NC}"
  echo "  • App data has been cleared"
  echo "  • You should see the 6-step onboarding tutorial"  
  echo "  • This simulates a first-time user experience"
  echo "  • Default location (Eugene, Oregon) has been set automatically"
fi 