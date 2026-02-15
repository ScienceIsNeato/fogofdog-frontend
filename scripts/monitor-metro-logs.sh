#!/bin/bash

# Monitor Metro Logs - tail or show last N lines of the current Metro log file
# 
# Usage:
#   ./scripts/monitor-metro-logs.sh           # Live monitoring (blocking)
#   ./scripts/monitor-metro-logs.sh --last 50 # Show last 50 lines (non-blocking)

# Parse command line arguments
LAST_LINES=""
LIVE_MODE=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --last)
            LAST_LINES="$2"
            LIVE_MODE=false
            shift 2
            ;;
        -h|--help)
            echo "Metro Log Monitor"
            echo ""
            echo "Usage:"
            echo "  $0                    # Live monitoring (blocking)"
            echo "  $0 --last <number>   # Show last N lines (non-blocking)"
            echo ""
            echo "Examples:"
            echo "  $0 --last 50         # Show last 50 lines"
            echo "  $0 --last 100        # Show last 100 lines"
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

if [ ! -f /tmp/METRO_CURRENT_LOG_FILENAME.txt ]; then
    echo "❌ No Metro log file found. Start Metro first with: ./scripts/deploy_app.sh --device <ios|android> --mode development --data current"
    exit 1
fi

CURRENT_LOG_FILE=$(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)

if [ ! -f "$CURRENT_LOG_FILE" ]; then
    echo "❌ Metro log file not found: $CURRENT_LOG_FILE"
    echo "💡 Start Metro with: ./scripts/deploy_app.sh --device <ios|android> --mode development --data current"
    exit 1
fi

if [ "$LIVE_MODE" = true ]; then
    echo "📋 Monitoring Metro logs: $CURRENT_LOG_FILE"
    echo "📋 Press Ctrl+C to stop monitoring"
    echo ""
    tail -f "$CURRENT_LOG_FILE"
else
    echo "📋 Last $LAST_LINES lines from Metro logs: $CURRENT_LOG_FILE"
    echo ""
    tail -n "$LAST_LINES" "$CURRENT_LOG_FILE"
fi