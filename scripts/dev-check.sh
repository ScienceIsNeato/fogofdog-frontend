#!/bin/bash

# Development Check Script - Mirrors Git Hooks & CI Exactly
# This script runs the EXACT same checks as git hooks and CI
# If this passes, your commit WILL succeed

# Parse command line arguments
FULL_CHECK=false
if [[ "$1" == "--full" ]]; then
    FULL_CHECK=true
fi

if [[ "$FULL_CHECK" == "true" ]]; then
    echo "🔍 Running FULL comprehensive quality checks..."
    echo "📋 This mirrors exactly what CI will run (including SonarQube)"
    echo "🎯 Including SonarQube analysis (Medium/Low severity issues)"
    echo "⏱️  This will take longer but catches all issues before PR merge"
else
    echo "🔍 Running fast local quality checks..."
    echo "📋 This mirrors exactly what git hooks will run"
    echo "💨 For comprehensive analysis including SonarQube, use: ./scripts/dev-check.sh --full"
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

# 1. Fix Linting Issues (automatically fix what can be fixed)
run_check "Lint Fix" "npm run lint:fix"

# 2. Strict Lint Check (catch warnings that can't be auto-fixed)
run_check "Lint Strict Check" "npm run lint:strict"

# 3. Fix Format Issues (automatically fix formatting)
run_check "Format Fix" "npm run format:fix"

# 4. TypeScript Type Check
run_check "Type Check" "npm run type-check"

# 5. Test Coverage
run_check "Test Coverage" "npm run test:coverage"

# 6. Code Duplication Check  
run_check "Duplication Check" "npm run duplication:check"

# 7. SonarQube Quality Check (Comprehensive Analysis) - Only in full mode
if [[ "$FULL_CHECK" == "true" ]]; then
    run_check "SonarQube Analysis" "npm run sonar:check"
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$FULL_CHECK" == "true" ]]; then
    echo "📊 Full Quality Check Summary (CI-Ready):"
else
    echo "📊 Fast Quality Check Summary (Git Hook Ready):"
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
  else
    echo "✅ Your commit will succeed"
    echo "✅ Git hooks will pass"
    echo ""
    echo "💡 For full CI validation (including SonarQube), run: ./scripts/dev-check.sh --full"
    echo "🚀 Ready to commit with confidence!"
  fi
  exit 0
else
  echo "💥 $FAILED_CHECKS check(s) failed:"
  for failed_check in "${FAILED_NAMES[@]}"; do
    echo "   • $failed_check"
  done
  echo ""
  echo "⚠️  Your commit will FAIL until these are fixed"
  echo "💡 Fix the issues above and run this script again"
  echo ""
  echo "🔧 Quick fixes:"
  echo "   • Type errors: Check TypeScript compiler output"
  echo "   • Tests: Fix failing test cases"
  echo "   • Duplication: Refactor duplicated code"
  echo "   • Note: Lint and format are already fixed automatically"
  exit 1
fi 