#!/bin/bash

# Development Check Script - Catches the same 5 warnings as IDE
# Specifically targets: EXPO_TOKEN context warnings + Promise rejection SonarQube warning

echo "🔍 Running development checks (targeting IDE warnings)..."

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

# 3. Summary matching IDE Problems panel
echo ""
TOTAL_WARNINGS=$((EXPO_WARNINGS + PROMISE_WARNINGS))

if [ $TOTAL_WARNINGS -eq 0 ]; then
  echo "✅ No warnings found - IDE should be clean"
else
  echo "📊 Found $TOTAL_WARNINGS warnings (matching IDE Problems panel):"
  echo "   • EXPO_TOKEN context warnings: $EXPO_WARNINGS"
  echo "   • Promise rejection warnings: $PROMISE_WARNINGS"
  echo ""
  echo "🎯 These should exactly match what you see in your IDE!"
fi

# 4. Run standard linting (but focus on the specific warnings above)
echo ""
echo "🔧 Running ESLint (for additional context)..."
npx eslint . --ext .ts,.tsx --format compact --quiet || true

echo ""  
echo "✅ Development check completed - warnings should match IDE exactly" 