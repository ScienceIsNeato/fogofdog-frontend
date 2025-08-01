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

echo -e "${GREEN}🚀 FogOfDog Simulator Deployment Script${NC}"
echo "================================================"

# Default simulator (can be overridden with environment variable)
DEFAULT_SIMULATOR="iPhone 15 Pro"
TARGET_SIMULATOR="${SIMULATOR_NAME:-$DEFAULT_SIMULATOR}"

echo -e "${YELLOW}📱 Target Simulator:${NC} $TARGET_SIMULATOR"
echo -e "${YELLOW}🏗️  Build Configuration:${NC} Debug (Development)"
echo -e "${YELLOW}🔧 Metro Server:${NC} Will start automatically"
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
echo -e "${BLUE}🔥 Metro bundler will continue running for hot reloading${NC}"
echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "  • Use Cmd+R in simulator to reload"
echo "  • Use Cmd+D to open developer menu"
echo "  • Set SIMULATOR_NAME environment variable to use different simulator"
echo "  • Example: SIMULATOR_NAME=\"iPhone 14\" ./scripts/deploy_to_simulator.sh" 