#!/bin/bash

# Development Check Script - Comprehensive Quality Checks
# Catches IDE warnings + enforces code quality standards

echo "🔍 Running comprehensive development checks..."

# 1. Check for EXPO_TOKEN context access warnings in workflow files
echo ""
echo "🔍 Checking EXPO_TOKEN context access warnings..."
EXPO_WARNINGS=0

# Check eas-build.yml
if [ -f "eas-build.yml" ]; then
  while IFS= read -r line_num; do
    line_content=$(sed -n "${line_num}p" eas-build.yml)
    echo "⚠️  eas-build.yml:$line_num:16 - Context access might be invalid: EXPO_TOKEN"
    ((EXPO_WARNINGS++))
  done < <(grep -n "EXPO_TOKEN" eas-build.yml | cut -d: -f1)
fi

# Check .github/workflows files
if [ -d ".github/workflows" ]; then
  for workflow_file in .github/workflows/*.yml .github/workflows/*.yaml; do
    if [ -f "$workflow_file" ]; then
      while IFS= read -r line_num; do
        echo "⚠️  $workflow_file:$line_num:16 - Context access might be invalid: EXPO_TOKEN"
        ((EXPO_WARNINGS++))
      done < <(grep -n "EXPO_TOKEN" "$workflow_file" 2>/dev/null | cut -d: -f1)
    fi
  done
fi

# 2. Check for Promise rejection SonarQube warning
echo ""
echo "🔍 Checking Promise rejection warnings (SonarQube)..."
PROMISE_WARNINGS=0

if [ -f "src/screens/Map/__tests__/MapScreen.test.tsx" ]; then
  # Look for Promise.reject with non-Error objects
  while IFS=: read -r line_num line_content; do
    if [[ $line_content == *"Promise.reject("* && $line_content != *"new Error"* ]]; then
      echo "⚠️  src/screens/Map/__tests__/MapScreen.test.tsx:$line_num:13 - Expected the Promise rejection reason to be an Error. sonarqube(typescript:S6671)"
      ((PROMISE_WARNINGS++))
    fi
  done < <(grep -n "Promise\.reject" src/screens/Map/__tests__/MapScreen.test.tsx 2>/dev/null)
fi

# 3. Code Duplication Check (SonarQube Quality Gate)
echo ""
echo "🔍 Checking code duplication (SonarQube threshold: <3.0%)..."
DUPLICATION_FAILED=false

# Run jscpd and capture output
if command -v npx >/dev/null 2>&1; then
  JSCPD_OUTPUT=$(npx jscpd src --min-lines 3 --threshold 3 --reporters console --silent 2>&1)
  JSCPD_EXIT_CODE=$?
  
  if [ $JSCPD_EXIT_CODE -eq 0 ]; then
    # Extract duplication percentage from output
    DUPLICATION_PERCENT=$(echo "$JSCPD_OUTPUT" | grep -o '[0-9]*\.[0-9]*%' | tail -1 | sed 's/%//')
    echo "✅ Code duplication: ${DUPLICATION_PERCENT}% (within 3.0% threshold)"
  else
    # Parse the error output for duplication percentage
    DUPLICATION_PERCENT=$(echo "$JSCPD_OUTPUT" | grep -o '[0-9]*\.[0-9]*%' | head -1 | sed 's/%//')
    if [ -n "$DUPLICATION_PERCENT" ]; then
      echo "❌ Code duplication: ${DUPLICATION_PERCENT}% (exceeds 3.0% threshold)"
      echo "   Run 'npx jscpd src --reporters html --output ./reports' for detailed analysis"
    else
      echo "❌ Duplication check failed"
    fi
    DUPLICATION_FAILED=true
  fi
else
  echo "⚠️  jscpd not available - skipping duplication check"
fi

# 4. TypeScript Strict Check
echo ""
echo "🔍 Running TypeScript strict check..."
TS_FAILED=false
if ! npx tsc --noEmit --strict; then
  TS_FAILED=true
  echo "❌ TypeScript strict check failed"
else
  echo "✅ TypeScript strict check passed"
fi

# 5. ESLint Check (zero warnings policy)
echo ""
echo "🔍 Running ESLint (zero warnings policy)..."
LINT_FAILED=false
if ! npx eslint . --ext .ts,.tsx --max-warnings 0; then
  LINT_FAILED=true
  echo "❌ ESLint check failed"
else
  echo "✅ ESLint check passed"
fi

# 6. Test Suite
echo ""
echo "🔍 Running test suite..."
TEST_FAILED=false
if ! npm test -- --watchAll=false --passWithNoTests --silent; then
  TEST_FAILED=true
  echo "❌ Test suite failed"
else
  echo "✅ Test suite passed"
fi

# 7. Summary
echo ""
echo "📊 Development Check Summary:"
TOTAL_IDE_WARNINGS=$((EXPO_WARNINGS + PROMISE_WARNINGS))

if [ $TOTAL_IDE_WARNINGS -eq 0 ]; then
  echo "✅ IDE warnings: 0 (clean)"
else
  echo "⚠️  IDE warnings: $TOTAL_IDE_WARNINGS"
  echo "   • EXPO_TOKEN context warnings: $EXPO_WARNINGS"
  echo "   • Promise rejection warnings: $PROMISE_WARNINGS"
fi

# Quality gate status
FAILED_CHECKS=0
[ "$DUPLICATION_FAILED" = true ] && ((FAILED_CHECKS++))
[ "$TS_FAILED" = true ] && ((FAILED_CHECKS++))
[ "$LINT_FAILED" = true ] && ((FAILED_CHECKS++))
[ "$TEST_FAILED" = true ] && ((FAILED_CHECKS++))

if [ $FAILED_CHECKS -eq 0 ]; then
  echo "✅ All quality gates passed"
  exit 0
else
  echo "❌ $FAILED_CHECKS quality gate(s) failed"
  echo ""
  echo "💡 Quick fixes:"
  echo "   • Duplication: Refactor duplicated code blocks"
  echo "   • TypeScript: Fix type errors"
  echo "   • ESLint: Run 'npm run lint:fix' for auto-fixes"
  echo "   • Tests: Fix failing test cases"
  exit 1
fi 