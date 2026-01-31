#!/bin/bash

# validate.sh - Unified Quality Gate Validation using slop-mop
#
# This script replaces the old ship_it.py and maintainAIbility-gate.sh scripts
# with a streamlined slop-mop-based validation workflow.
#
# Usage:
#   ./scripts/validate.sh           # Full validation (recommended before commits)
#   ./scripts/validate.sh quick     # Quick lint-only check
#   ./scripts/validate.sh js        # JavaScript checks only
#   ./scripts/validate.sh types     # TypeScript check only
#   ./scripts/validate.sh full      # Full validation including duplication
#   ./scripts/validate.sh --help    # Show help

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory (for finding venv)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
VENV_PATH="$PROJECT_ROOT/.venv"

# Show help
show_help() {
    echo -e "${GREEN}🧹 Slop-Mop Quality Gate Validation${NC}"
    echo "================================================"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./scripts/validate.sh [PROFILE]"
    echo ""
    echo -e "${YELLOW}Profiles:${NC}"
    echo "  (default)  Full JavaScript validation + TypeScript + duplication"
    echo "  quick      Fast lint-only check"
    echo "  js         JavaScript checks only (lint, tests, coverage)"
    echo "  types      TypeScript check only"
    echo "  full       Full validation including all quality gates"
    echo "  help       Show this help message"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  ./scripts/validate.sh          # Before committing"
    echo "  ./scripts/validate.sh quick    # Quick check during development"
    echo "  ./scripts/validate.sh js       # After modifying JS/TS files"
    exit 0
}

# Check if venv exists
check_venv() {
    if [ ! -d "$VENV_PATH" ]; then
        echo -e "${YELLOW}⚠️  Virtual environment not found. Creating...${NC}"
        python3 -m venv "$VENV_PATH"
        source "$VENV_PATH/bin/activate"
        pip install -e "$PROJECT_ROOT/slop-mop"
    else
        source "$VENV_PATH/bin/activate"
    fi
}

# Run TypeScript check
run_type_check() {
    echo -e "${BLUE}🔧 Running TypeScript check...${NC}"
    cd "$PROJECT_ROOT"
    if npm run type-check > /dev/null 2>&1; then
        echo -e "${GREEN}✅ TypeScript: PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ TypeScript: FAILED${NC}"
        echo "Run 'npm run type-check' for details"
        return 1
    fi
}

# Run duplication check (using existing npm script)
run_duplication_check() {
    echo -e "${BLUE}🔄 Running duplication check...${NC}"
    cd "$PROJECT_ROOT"
    if npm run duplication:check > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Duplication: PASSED (below 3% threshold)${NC}"
        return 0
    else
        echo -e "${RED}❌ Duplication: FAILED${NC}"
        echo "Run 'npm run duplication:check' for details"
        return 1
    fi
}

# Main logic
main() {
    PROFILE="${1:-default}"

    # Handle help
    if [[ "$PROFILE" == "help" ]] || [[ "$PROFILE" == "--help" ]] || [[ "$PROFILE" == "-h" ]]; then
        show_help
    fi

    echo -e "${GREEN}🧹 Slop-Mop Quality Gate Validation${NC}"
    echo "================================================"
    echo -e "📂 Project: $PROJECT_ROOT"
    echo -e "🔍 Profile: $PROFILE"
    echo "================================================"
    echo ""

    FAILED=0

    cd "$PROJECT_ROOT"
    check_venv

    case "$PROFILE" in
        quick)
            # Quick lint check only
            sm validate quick
            ;;
        js|javascript)
            # JavaScript checks only
            sm validate javascript
            ;;
        types|typescript)
            # TypeScript check only
            run_type_check || FAILED=1
            ;;
        full)
            # Full validation
            sm validate javascript || FAILED=1
            run_type_check || FAILED=1
            run_duplication_check || FAILED=1
            ;;
        default|*)
            # Default: JS + TypeScript + Duplication
            sm validate javascript || FAILED=1
            run_type_check || FAILED=1
            run_duplication_check || FAILED=1
            ;;
    esac

    echo ""
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}🎉 ALL QUALITY GATES PASSED!${NC}"
        echo -e "${GREEN}✅ Ready to commit with confidence!${NC}"
        exit 0
    else
        echo -e "${RED}❌ QUALITY GATE FAILED${NC}"
        echo -e "${YELLOW}🔧 Fix the issues above and run again${NC}"
        exit 1
    fi
}

main "$@"
