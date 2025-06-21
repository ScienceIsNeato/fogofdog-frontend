#!/bin/bash

# maintainAIbility-gate - AI-Enhanced Code Quality Framework
# This script ensures code maintainability through comprehensive quality checks
# Mirrors Git Hooks & CI exactly - if this passes, your commit WILL succeed
#
# An AI-assisted quality gate that validates:
# - Code formatting and consistency
# - TypeScript linting and best practices  
# - Type safety and compilation
# - Test coverage and reliability
# - Code duplication prevention
# - Advanced quality analysis
#
# Usage:
#   ./scripts/maintainAIbility-gate.sh           # Run all checks
#   ./scripts/maintainAIbility-gate.sh --format  # Format code only
#   ./scripts/maintainAIbility-gate.sh --lint    # Lint TypeScript only
#   ./scripts/maintainAIbility-gate.sh --types   # Check types only
#   ./scripts/maintainAIbility-gate.sh --tests   # Run tests with coverage
#   ./scripts/maintainAIbility-gate.sh --duplication # Check code duplication
#   ./scripts/maintainAIbility-gate.sh --sonar   # Run SonarQube analysis
#   ./scripts/maintainAIbility-gate.sh --full    # All checks including SonarQube
#   ./scripts/maintainAIbility-gate.sh --help    # Show this help

# Parse command line arguments
FULL_CHECK=false
RUN_LINT=false
RUN_FORMAT=false
RUN_TYPES=false
RUN_TESTS=false
RUN_DUPLICATION=false
RUN_SONAR=false
RUN_ALL=true  # Default behavior when no specific flags

# Parse all arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --full)
      FULL_CHECK=true
      RUN_ALL=true
      shift
      ;;
    --lint)
      RUN_LINT=true
      RUN_ALL=false
      shift
      ;;
    --format)
      RUN_FORMAT=true
      RUN_ALL=false
      shift
      ;;
    --types)
      RUN_TYPES=true
      RUN_ALL=false
      shift
      ;;
    --tests)
      RUN_TESTS=true
      RUN_ALL=false
      shift
      ;;
    --duplication)
      RUN_DUPLICATION=true
      RUN_ALL=false
      shift
      ;;
    --sonar)
      RUN_SONAR=true
      RUN_ALL=false
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--full] [--lint] [--format] [--types] [--tests] [--duplication] [--sonar]"
      echo "  No args: Run all standard checks (no SonarQube)"
      echo "  --full: Run all checks including SonarQube"
      echo "  --lint: Run linting checks only"
      echo "  --format: Run formatting checks only"
      echo "  --types: Run TypeScript type checking only"
      echo "  --tests: Run unit tests with coverage only"
      echo "  --duplication: Run code duplication check only"
      echo "  --sonar: Run SonarQube analysis only"
      exit 1
      ;;
  esac
done

# Set defaults for --full and standard runs
if [[ "$RUN_ALL" == "true" ]]; then
  RUN_LINT=true
  RUN_FORMAT=true
  RUN_TYPES=true
  RUN_TESTS=true
  RUN_DUPLICATION=true
  if [[ "$FULL_CHECK" == "true" ]]; then
    RUN_SONAR=true
  fi
fi

# Display what we're running
if [[ "$FULL_CHECK" == "true" ]]; then
    echo "🔍 Running FULL comprehensive quality checks..."
    echo "📋 This mirrors exactly what CI will run (including SonarQube)"
    echo "🎯 Including SonarQube analysis (Medium/Low severity issues)"
    echo "⏱️  This will take longer but catches all issues before PR merge"
elif [[ "$RUN_ALL" == "true" ]]; then
    echo "🔍 Running fast local quality checks..."
    echo "📋 This mirrors exactly what git hooks will run"
    echo "💨 For comprehensive analysis including SonarQube, use: ./scripts/maintainAIbility-gate.sh --full"
else
    echo "🔍 Running specific quality checks..."
    echo "📋 Individual check mode - use for targeted validation"
fi
echo ""

# Track failures
FAILED_CHECKS=0
FAILED_NAMES=()

# Function to run a check and track failures
run_check() {
  local check_name="$1"
  local command="$2"
  
  echo "🔍 Running: $check_name"
  echo "   Command: $command"
  
  if eval "$command"; then
    echo "✅ $check_name: PASSED"
  else
    echo "❌ $check_name: FAILED"
    ((FAILED_CHECKS++))
    FAILED_NAMES+=("$check_name")
  fi
  echo ""
}

# Run checks based on flags
if [[ "$RUN_FORMAT" == "true" ]]; then
  run_check "Format Fix" "npm run format:fix"
fi

if [[ "$RUN_LINT" == "true" ]]; then
  run_check "Lint Fix" "npm run lint:fix"
  run_check "Lint Strict Check" "npm run lint:strict"
fi

if [[ "$RUN_TYPES" == "true" ]]; then
  run_check "Type Check" "npm run type-check"
fi

if [[ "$RUN_TESTS" == "true" ]]; then
  run_check "Test Coverage" "npm run test:coverage"
fi

if [[ "$RUN_DUPLICATION" == "true" ]]; then
  run_check "Duplication Check" "npm run duplication:check"
fi

if [[ "$RUN_SONAR" == "true" ]]; then
  run_check "SonarQube Analysis" "npm run sonar:check"
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$FULL_CHECK" == "true" ]]; then
    echo "📊 Full Quality Check Summary (CI-Ready):"
elif [[ "$RUN_ALL" == "true" ]]; then
    echo "📊 Fast Quality Check Summary (Git Hook Ready):"
else
    echo "📊 Individual Check Summary:"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILED_CHECKS -eq 0 ]; then
  echo "🎉 ALL CHECKS PASSED!"
  if [[ "$FULL_CHECK" == "true" ]]; then
    echo "✅ Your commit will succeed"
    echo "✅ Git hooks will pass"  
    echo "✅ CI pipeline will pass"
    echo "✅ SonarQube quality gate will pass"
    echo ""
    echo "🚀 Ready to merge PR with confidence!"
  elif [[ "$RUN_ALL" == "true" ]]; then
    echo "✅ Your commit will succeed"
    echo "✅ Git hooks will pass"
    echo ""
    echo "💡 For full CI validation (including SonarQube), run: ./scripts/maintainAIbility-gate.sh --full"
    echo "🚀 Ready to commit with confidence!"
  else
    echo "✅ Individual checks completed successfully"
    echo ""
    echo "💡 For full validation, run: ./scripts/maintainAIbility-gate.sh"
  fi
  exit 0
else
  echo "💥 $FAILED_CHECKS check(s) failed:"
  for failed_check in "${FAILED_NAMES[@]}"; do
    echo "   • $failed_check"
  done
  echo ""
  if [[ "$RUN_ALL" == "true" ]]; then
    echo "⚠️  Your commit will FAIL until these are fixed"
  else
    echo "⚠️  These individual checks need attention"
  fi
  echo "💡 Fix the issues above and run this script again"
  echo ""
  echo "🔧 Quick fixes:"
  echo "   • Type errors: Check TypeScript compiler output"
  echo "   • Tests: Fix failing test cases"
  echo "   • Duplication: Refactor duplicated code"
  echo "   • Note: Lint and format are already fixed automatically"
  exit 1
fi 