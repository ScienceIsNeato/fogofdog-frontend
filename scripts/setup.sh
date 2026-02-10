#!/usr/bin/env bash
# FogOfDog Frontend Setup Script
#
# Initializes the project, including git submodules (slop-mop) and dependencies.
# Can be sourced by other scripts to use the check_submodules function.
#
# Usage:
#   ./scripts/setup.sh           # Full setup
#   source ./scripts/setup.sh && check_submodules  # Just check submodules

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

#######################################
# Check if git submodules are initialized
# Returns 0 if all submodules are initialized, 1 otherwise
#######################################
check_submodules() {
    local missing=0
    
    # Check slop-mop specifically
    if [[ ! -f "$PROJECT_ROOT/slop-mop/pyproject.toml" ]]; then
        echo -e "${YELLOW}⚠️  slop-mop submodule not initialized${NC}"
        echo ""
        echo "Run one of these commands to fix:"
        echo "  git submodule update --init --recursive"
        echo "  ./scripts/setup.sh"
        echo ""
        missing=1
    fi
    
    return $missing
}

#######################################
# Initialize git submodules
#######################################
init_submodules() {
    echo -e "${GREEN}📦 Initializing git submodules...${NC}"
    cd "$PROJECT_ROOT"
    git submodule update --init --recursive
    echo -e "${GREEN}✅ Submodules initialized${NC}"
}

#######################################
# Install npm dependencies
#######################################
install_npm_deps() {
    echo -e "${GREEN}📦 Installing npm dependencies...${NC}"
    cd "$PROJECT_ROOT"
    npm install
    echo -e "${GREEN}✅ npm dependencies installed${NC}"
}

#######################################
# Install slop-mop (quality gate tool)
#######################################
install_slopmop() {
    echo -e "${GREEN}📦 Installing slop-mop...${NC}"
    cd "$PROJECT_ROOT/slop-mop"
    
    # Find Python 3.9+
    local python_cmd=""
    for cmd in python3.13 python3.12 python3.11 python3.10 python3.9 python3 python; do
        if command -v "$cmd" &> /dev/null; then
            local version=$("$cmd" -c "import sys; print(sys.version_info[:2])" 2>/dev/null || echo "(0, 0)")
            local major=$(echo "$version" | grep -oE "[0-9]+" | head -1)
            local minor=$(echo "$version" | grep -oE "[0-9]+" | tail -1)
            if [[ "$major" -ge 3 ]] && [[ "$minor" -ge 9 ]]; then
                python_cmd="$cmd"
                break
            fi
        fi
    done
    
    if [[ -z "$python_cmd" ]]; then
        echo -e "${YELLOW}⚠️  Python 3.9+ not found, skipping slop-mop installation${NC}"
        echo "Install Python 3.9+ and run: pip install -e slop-mop"
        return 1
    fi
    
    echo "Using $python_cmd"
    "$python_cmd" -m pip install -e . --quiet --break-system-packages 2>/dev/null || \
        "$python_cmd" -m pip install -e . --quiet
    
    echo -e "${GREEN}✅ slop-mop installed (run 'sm validate commit' to check quality)${NC}"
}

#######################################
# Main setup flow
#######################################
main() {
    echo ""
    echo -e "${GREEN}🐕 FogOfDog Frontend Setup${NC}"
    echo "================================"
    echo ""
    
    # 1. Initialize submodules
    if ! check_submodules 2>/dev/null; then
        init_submodules
    else
        echo -e "${GREEN}✅ Submodules already initialized${NC}"
    fi
    
    # 2. Install npm dependencies
    install_npm_deps
    
    # 3. Install slop-mop
    install_slopmop || true
    
    echo ""
    echo -e "${GREEN}🎉 Setup complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "  npm start           # Start development server"
    echo "  npm run ios         # Run on iOS simulator"
    echo "  npm run android     # Run on Android emulator"
    echo "  sm validate commit  # Run quality checks"
    echo ""
}

# Only run main if script is executed (not sourced)
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
