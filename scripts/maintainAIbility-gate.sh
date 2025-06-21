#!/bin/bash

# maintainAIbility-gate - AI-Enhanced Code Quality Framework
# This script ensures code maintainability through comprehensive quality checks
# Mirrors Git Hooks & CI exactly - if this passes, your commit WILL succeed
#
# An AI-assisted quality gate that validates:
# - Code formatting and consistency (with auto-fix)
# - TypeScript linting and best practices (with auto-fix)
# - Type safety and compilation
# - Test coverage and reliability
# - Code duplication prevention
# - Advanced quality analysis
#
# Usage:
#   ./scripts/maintainAIbility-gate.sh           # All checks (strict mode with auto-fix)
#   ./scripts/maintainAIbility-gate.sh --full    # All checks including SonarQube
#   ./scripts/maintainAIbility-gate.sh --format  # Check/fix formatting only
#   ./scripts/maintainAIbility-gate.sh --lint    # Check/fix linting only
#   ./scripts/maintainAIbility-gate.sh --types   # Check types only
#   ./scripts/maintainAIbility-gate.sh --tests   # Run tests with coverage
#   ./scripts/maintainAIbility-gate.sh --duplication # Check code duplication
#   ./scripts/maintainAIbility-gate.sh --sonar   # Run SonarQube analysis
#   ./scripts/maintainAIbility-gate.sh --help    # Show this help

set -e

# Individual check flags
RUN_FORMAT=false
RUN_LINT=false
RUN_TYPES=false
RUN_TESTS=false
RUN_DUPLICATION=false
RUN_SONAR=false
RUN_ALL=false

# Parse arguments
if [ $# -eq 0 ]; then
  RUN_ALL=true
elif [ "$1" = "--full" ]; then
  RUN_ALL=true
  RUN_SONAR=true
else
  while [[ $# -gt 0 ]]; do
    case $1 in
      --format) RUN_FORMAT=true ;;
      --lint) RUN_LINT=true ;;
      --types) RUN_TYPES=true ;;
      --tests) RUN_TESTS=true ;;
      --duplication) RUN_DUPLICATION=true ;;
      --sonar) RUN_SONAR=true ;;
      *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
  done
fi

# Set all flags if RUN_ALL is true
if [[ "$RUN_ALL" == "true" ]]; then
  RUN_FORMAT=true
  RUN_LINT=true
  RUN_TYPES=true
  RUN_TESTS=true
  RUN_DUPLICATION=true
fi

# Track failures
FAILED_CHECKS=0

echo "🔍 Running maintainAIbility quality checks (STRICT MODE with auto-fix)..."
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FORMAT CHECK & AUTO-FIX
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_FORMAT" == "true" ]]; then
  echo "🎨 Format Check & Auto-Fix"
  
  # First, try to auto-fix formatting issues
  echo "🔧 Auto-fixing formatting issues..."
  npm run format:fix
  
  # Then verify everything is properly formatted
  if npm run format:check; then
    echo "✅ Format Check: PASSED (auto-fixed)"
  else
    echo "❌ Format Check: FAILED (could not auto-fix all issues)"
    ((FAILED_CHECKS++))
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LINT CHECK & AUTO-FIX (STRICT MODE)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_LINT" == "true" ]]; then
  echo "🔍 Lint Check & Auto-Fix (STRICT MODE)"
  
  # First, try to auto-fix linting issues
  echo "🔧 Auto-fixing linting issues..."
  npm run lint:fix || true  # Don't fail if some issues can't be auto-fixed
  
  # Then run strict linting (zero warnings allowed)
  if npm run lint:strict; then
    echo "✅ Lint Check: PASSED (strict mode - zero warnings)"
  else
    echo "❌ Lint Check: FAILED (strict mode - zero warnings allowed)"
    echo "💡 Some issues may require manual fixing"
    ((FAILED_CHECKS++))
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TYPE CHECK (STRICT MODE)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_TYPES" == "true" ]]; then
  echo "🔧 Type Check (STRICT MODE)"
  if npm run type-check; then
    echo "✅ Type Check: PASSED (strict TypeScript compilation)"
  else
    echo "❌ Type Check: FAILED (strict TypeScript compilation)"
    ((FAILED_CHECKS++))
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TEST COVERAGE (STRICT THRESHOLDS)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_TESTS" == "true" ]]; then
  echo "🧪 Test Coverage (STRICT THRESHOLDS)"
  if npm run test:coverage; then
    echo "✅ Test Coverage: PASSED (strict coverage thresholds)"
  else
    echo "❌ Test Coverage: FAILED (strict coverage thresholds)"
    ((FAILED_CHECKS++))
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DUPLICATION CHECK
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_DUPLICATION" == "true" ]]; then
  echo "🔄 Duplication Check"
  if npm run duplication:check; then
    echo "✅ Duplication Check: PASSED"
  else
    echo "❌ Duplication Check: FAILED"
    ((FAILED_CHECKS++))
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SONARQUBE ANALYSIS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_SONAR" == "true" ]]; then
  echo "📊 SonarQube Analysis"
  if npm run sonar:check:warn; then
    echo "✅ SonarQube Analysis: PASSED"
  else
    echo "❌ SonarQube Analysis: FAILED"
    ((FAILED_CHECKS++))
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUMMARY
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "📊 Quality Check Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILED_CHECKS -eq 0 ]; then
  echo "🎉 ALL CHECKS PASSED!"
  echo "✅ Ready to commit with confidence!"
  exit 0
else
  echo "❌ $FAILED_CHECKS CHECK(S) FAILED"
  echo "⚠️  Fix the issues and run again"
  exit 1
fi 