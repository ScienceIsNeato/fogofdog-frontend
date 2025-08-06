#!/bin/bash

# FogOfDog Simulator Log Monitor Script
# Monitors live Metro development server logs for FogOfDog app

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

LIVE_LOG_FILE="/tmp/fog_of_dog_expo_simulator_live.log"

# Parse command line arguments
LINES=50
FOLLOW=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    -f|--follow)
      FOLLOW=true
      shift
      ;;
    -n|--lines)
      LINES="$2"
      shift 2
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
  echo -e "${GREEN}📋 FogOfDog Simulator Log Monitor${NC}"
  echo "========================================"
  echo ""
  echo -e "${YELLOW}Usage:${NC}"
  echo "  $0 [OPTIONS]"
  echo ""
  echo -e "${YELLOW}Options:${NC}"
  echo "  -f, --follow       Follow log output in real-time (like tail -f)"
  echo "  -n, --lines NUM    Show last NUM lines (default: 50)"
  echo "  --help, -h         Show this help message"
  echo ""
  echo -e "${YELLOW}Examples:${NC}"
  echo "  $0                 # Show last 50 lines"
  echo "  $0 -f              # Follow logs in real-time"
  echo "  $0 -n 100          # Show last 100 lines"
  echo "  $0 -f -n 20        # Follow logs, starting with last 20 lines"
  echo ""
  echo -e "${YELLOW}Log File Location:${NC}"
  echo "  $LIVE_LOG_FILE"
  exit 0
fi

echo -e "${GREEN}📋 FogOfDog Simulator Log Monitor${NC}"
echo "========================================"
echo -e "${BLUE}Log file: $LIVE_LOG_FILE${NC}"

# Check if log file exists
if [ ! -f "$LIVE_LOG_FILE" ]; then
  echo ""
  echo -e "${YELLOW}⚠️  Log file not found!${NC}"
  echo "Make sure you've deployed to simulator first:"
  echo "  ./scripts/deploy_development_build_to_simulator.sh"
  echo ""
  echo "Or check if Metro server is running:"
  echo "  ps aux | grep 'expo start'"
  exit 1
fi

# Get file age and size info
FILE_AGE=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$LIVE_LOG_FILE" 2>/dev/null || echo "unknown")
FILE_SIZE=$(ls -lh "$LIVE_LOG_FILE" | awk '{print $5}' 2>/dev/null || echo "unknown")

echo -e "${BLUE}Last modified: $FILE_AGE${NC}"
echo -e "${BLUE}File size: $FILE_SIZE${NC}"
echo ""

# Check if Metro server is running
METRO_PROCESSES=$(ps aux | grep -v grep | grep "expo start" | wc -l | tr -d ' ')
if [ "$METRO_PROCESSES" -gt 0 ]; then
  echo -e "${GREEN}✅ Metro server is running ($METRO_PROCESSES process(es))${NC}"
else
  echo -e "${YELLOW}⚠️  Metro server doesn't appear to be running${NC}"
fi

echo ""
echo -e "${YELLOW}=== LOG OUTPUT ===${NC}"

if [ "$FOLLOW" = true ]; then
  echo -e "${BLUE}Following logs in real-time (Ctrl+C to exit)...${NC}"
  echo ""
  # Show last N lines, then follow
  tail -n "$LINES" -f "$LIVE_LOG_FILE"
else
  echo -e "${BLUE}Showing last $LINES lines:${NC}"
  echo ""
  tail -n "$LINES" "$LIVE_LOG_FILE"
  echo ""
  echo -e "${YELLOW}💡 Tip: Use -f flag to follow logs in real-time${NC}"
fi 