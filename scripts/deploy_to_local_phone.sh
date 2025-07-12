#!/bin/bash

# Deploy to Local Phone Script
# Automatically deploys release build to device specified in LOCAL_DEVICE_NAME

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 FogOfDog Release Deployment Script${NC}"
echo "================================================"

# Check if LOCAL_DEVICE_NAME is set
if [ -z "$LOCAL_DEVICE_NAME" ]; then
    echo -e "${RED}❌ Error: LOCAL_DEVICE_NAME environment variable is not set${NC}"
    echo "Please set it in your .envrc file:"
    echo "  export LOCAL_DEVICE_NAME=\"YourDeviceName\""
    echo "Then run: direnv allow"
    exit 1
fi

echo -e "${YELLOW}📱 Target Device:${NC} $LOCAL_DEVICE_NAME"
echo -e "${YELLOW}🏗️  Build Configuration:${NC} Release"
echo ""

# Check if device is available
echo -e "${YELLOW}🔍 Checking device availability...${NC}"
if ! npx expo run:ios --device --dry-run 2>/dev/null | grep -q "$LOCAL_DEVICE_NAME"; then
    echo -e "${RED}❌ Warning: Device '$LOCAL_DEVICE_NAME' not found in available devices${NC}"
    echo "Available devices:"
    npx expo run:ios --device --dry-run 2>/dev/null | grep "🌐\|📱" || echo "No devices found"
    echo ""
    echo -e "${YELLOW}⚠️  Continuing anyway - Expo might still find the device...${NC}"
fi

# Build and deploy
echo -e "${GREEN}🔨 Building and deploying to $LOCAL_DEVICE_NAME...${NC}"
echo "Command: npx expo run:ios --device \"$LOCAL_DEVICE_NAME\" --configuration Release"
echo ""

# Use timeout to prevent hanging on device selection
timeout 300 npx expo run:ios --device "$LOCAL_DEVICE_NAME" --configuration Release || {
    exit_code=$?
    if [ $exit_code -eq 124 ]; then
        echo -e "${RED}❌ Deployment timed out after 5 minutes${NC}"
        echo "This might happen if the device selection prompt appeared despite specifying the device name."
    else
        echo -e "${RED}❌ Deployment failed with exit code $exit_code${NC}"
    fi
    exit $exit_code
}

echo ""
echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo -e "${GREEN}📱 FogOfDog should now be running on $LOCAL_DEVICE_NAME${NC}" 