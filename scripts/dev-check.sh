#!/bin/bash

# Development Check Script - Mirrors Git Hooks & CI Exactly
# This script runs the EXACT same checks as git hooks and CI
# If this passes, your commit WILL succeed

echo "🔍 Running git hook conformity checks..."
echo "📋 This mirrors exactly what git hooks and CI will run"
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

# 1. Strict Linting (zero warnings policy)
run_check "Lint Strict" "npm run lint:strict"

# 2. Format Check (prettier)
run_check "Format Check" "npm run format:check"

# 3. TypeScript Type Check
run_check "Type Check" "npm run type-check"

# 4. Test Coverage
run_check "Test Coverage" "npm run test:coverage"

# 5. Code Duplication Check  
run_check "Duplication Check" "npm run duplication:check"

# 6. SonarQube Quality Check
run_check "SonarQube Check" "npm run sonar:check"

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Git Hook Conformity Summary:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILED_CHECKS -eq 0 ]; then
  echo "🎉 ALL CHECKS PASSED!"
  echo "✅ Your commit will succeed"
  echo "✅ Git hooks will pass"  
  echo "✅ CI pipeline will pass"
  echo ""
  echo "🚀 Ready to commit with confidence!"
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
  echo "   • Lint: npm run lint:fix"
  echo "   • Format: npm run format:fix"
  echo "   • Type errors: Check TypeScript compiler output"
  echo "   • Tests: Fix failing test cases"
  echo "   • Duplication: Refactor duplicated code"
  exit 1
fi 