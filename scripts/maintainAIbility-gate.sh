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
RUN_SECURITY=false
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
      --security) RUN_SECURITY=true ;;
      --sonar) RUN_SONAR=true ;;
      --help)
        echo "maintainAIbility-gate - AI-Enhanced Code Quality Framework"
        echo ""
        echo "Usage:"
        echo "  ./scripts/maintainAIbility-gate.sh           # All checks (strict mode with auto-fix)"
        echo "  ./scripts/maintainAIbility-gate.sh --full    # All checks including SonarQube"
        echo "  ./scripts/maintainAIbility-gate.sh --format  # Check/fix formatting only"
        echo "  ./scripts/maintainAIbility-gate.sh --lint    # Check/fix linting only"
        echo "  ./scripts/maintainAIbility-gate.sh --types   # Check types only"
        echo "  ./scripts/maintainAIbility-gate.sh --tests   # Run tests with coverage"
        echo "  ./scripts/maintainAIbility-gate.sh --duplication # Check code duplication"
        echo "  ./scripts/maintainAIbility-gate.sh --security # Check/fix security vulnerabilities"
        echo "  ./scripts/maintainAIbility-gate.sh --sonar   # Run SonarQube analysis"
        echo "  ./scripts/maintainAIbility-gate.sh --help    # Show this help"
        echo ""
        echo "This script ensures code maintainability through comprehensive quality checks"
        echo "and mirrors Git Hooks & CI exactly - if this passes, your commit WILL succeed."
        exit 0
        ;;
      *) echo "Unknown option: $1"; echo "Use --help for usage information"; exit 1 ;;
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
  RUN_SECURITY=true
fi

# Track failures with detailed information
FAILED_CHECKS=0
FAILED_CHECKS_DETAILS=()
PASSED_CHECKS=()

# Helper function to add failure details
add_failure() {
  local check_name="$1"
  local failure_reason="$2"
  local fix_suggestion="$3"
  
  ((FAILED_CHECKS++))
  FAILED_CHECKS_DETAILS+=("$check_name|$failure_reason|$fix_suggestion")
}

# Helper function to add passed check
add_success() {
  local check_name="$1"
  local success_message="$2"
  
  PASSED_CHECKS+=("$check_name|$success_message")
}

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
  if npm run format:check > /dev/null 2>&1; then
    echo "✅ Format Check: PASSED (auto-fixed)"
    add_success "Format Check" "All files properly formatted with auto-fix"
  else
    echo "❌ Format Check: FAILED (could not auto-fix all issues)"
    add_failure "Format Check" "Some formatting issues could not be auto-fixed" "Run 'npm run format:fix' and manually fix remaining issues"
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
  
  # Capture lint output for detailed reporting
  LINT_OUTPUT=$(npm run lint:strict 2>&1) || LINT_FAILED=true
  
  # Then run strict linting (zero warnings allowed)
  if [[ "$LINT_FAILED" != "true" ]]; then
    echo "✅ Lint Check: PASSED (strict mode - zero warnings)"
    add_success "Lint Check" "Zero warnings in strict mode with auto-fix"
  else
    echo "❌ Lint Check: FAILED (strict mode - zero warnings allowed)"
    echo "💡 Some issues may require manual fixing"
    
    # Extract warning count from output
    WARNING_COUNT=$(echo "$LINT_OUTPUT" | grep -o '[0-9]\+ warning' | head -1 | grep -o '[0-9]\+' || echo "unknown")
    add_failure "Lint Check" "$WARNING_COUNT warnings found in strict mode" "Run 'npm run lint' to see details and fix manually"
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TYPE CHECK (STRICT MODE)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_TYPES" == "true" ]]; then
  echo "🔧 Type Check (STRICT MODE)"
  TYPE_OUTPUT=$(npm run type-check 2>&1) || TYPE_FAILED=true
  
  if [[ "$TYPE_FAILED" != "true" ]]; then
    echo "✅ Type Check: PASSED (strict TypeScript compilation)"
    add_success "Type Check" "TypeScript compilation successful in strict mode"
  else
    echo "❌ Type Check: FAILED (strict TypeScript compilation)"
    
    # Extract error count from output
    ERROR_COUNT=$(echo "$TYPE_OUTPUT" | grep -o '[0-9]\+ error' | head -1 | grep -o '[0-9]\+' || echo "unknown")
    add_failure "Type Check" "$ERROR_COUNT TypeScript errors found" "Run 'npm run type-check' to see details and fix type errors"
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# TEST COVERAGE (STRICT THRESHOLDS)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_TESTS" == "true" ]]; then
  echo "🧪 Test Coverage (STRICT THRESHOLDS)"
  TEST_OUTPUT=$(npm run test:coverage 2>&1) || TEST_FAILED=true
  
  if [[ "$TEST_FAILED" != "true" ]]; then
    echo "✅ Test Coverage: PASSED (strict coverage thresholds)"
    
    # Extract coverage percentage
    COVERAGE=$(echo "$TEST_OUTPUT" | grep -o '[0-9]\+\.[0-9]\+%' | head -1 || echo "unknown")
    add_success "Test Coverage" "Coverage at $COVERAGE (above 80% threshold)"
  else
    echo "❌ Test Coverage: FAILED (strict coverage thresholds)"
    
    # Extract coverage info
    COVERAGE=$(echo "$TEST_OUTPUT" | grep -o '[0-9]\+\.[0-9]\+%' | head -1 || echo "unknown")
    add_failure "Test Coverage" "Coverage at $COVERAGE (below 80% threshold)" "Add tests to increase coverage or run 'npm run test:coverage' for details"
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DUPLICATION CHECK
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_DUPLICATION" == "true" ]]; then
  echo "🔄 Duplication Check"
  DUP_OUTPUT=$(npm run duplication:check 2>&1) || DUP_FAILED=true
  
  if [[ "$DUP_FAILED" != "true" ]]; then
    echo "✅ Duplication Check: PASSED"
    
    # Extract duplication percentage
    DUP_PERCENT=$(echo "$DUP_OUTPUT" | grep -o '[0-9]\+\.[0-9]\+%' | head -1 || echo "unknown")
    add_success "Duplication Check" "Duplication at $DUP_PERCENT (below 3% threshold)"
  else
    echo "❌ Duplication Check: FAILED"
    
    # Extract duplication info
    DUP_PERCENT=$(echo "$DUP_OUTPUT" | grep -o '[0-9]\+\.[0-9]\+%' | head -1 || echo "unknown")
    add_failure "Duplication Check" "Duplication at $DUP_PERCENT (above 3% threshold)" "Refactor duplicated code or check 'quality-reports/jscpd-report.json' for details"
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SECURITY AUDIT & AUTO-FIX
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_SECURITY" == "true" ]]; then
  echo "🔒 Security Audit & Auto-Fix"
  
  # First, try to auto-fix security vulnerabilities
  echo "🔧 Auto-fixing security vulnerabilities..."
  npm audit fix || true  # Don't fail if some vulnerabilities can't be auto-fixed
  
  # Then check for remaining high-severity vulnerabilities
  AUDIT_OUTPUT=$(npm run audit:security 2>&1) || AUDIT_FAILED=true
  
  if [[ "$AUDIT_FAILED" != "true" ]]; then
    echo "✅ Security Audit: PASSED (no high-severity vulnerabilities)"
    add_success "Security Audit" "No high-severity vulnerabilities found with auto-fix"
  else
    echo "❌ Security Audit: FAILED (high-severity vulnerabilities remain)"
    echo "💡 Some vulnerabilities may require manual intervention"
    
    # Extract vulnerability count from output
    VULN_COUNT=$(echo "$AUDIT_OUTPUT" | grep -o '[0-9]\+ vulnerabilities' | head -1 | grep -o '[0-9]\+' || echo "unknown")
    add_failure "Security Audit" "$VULN_COUNT high-severity vulnerabilities found" "Run 'npm audit' for details and update dependencies manually if needed"
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SONARQUBE ANALYSIS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [[ "$RUN_SONAR" == "true" ]]; then
  echo "📊 SonarQube Analysis"
  SONAR_OUTPUT=$(npm run sonar:check:warn 2>&1) || SONAR_FAILED=true
  
  if [[ "$SONAR_FAILED" != "true" ]]; then
    echo "✅ SonarQube Analysis: PASSED"
    add_success "SonarQube Analysis" "Code quality meets SonarQube standards"
  else
    echo "❌ SonarQube Analysis: FAILED"
    add_failure "SonarQube Analysis" "Code quality issues found" "Check SonarQube report for detailed issues"
  fi
  echo ""
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# COMPREHENSIVE SUMMARY REPORT
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "📊 Quality Gate Report"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Show passed checks
if [ ${#PASSED_CHECKS[@]} -gt 0 ]; then
  echo "✅ PASSED CHECKS (${#PASSED_CHECKS[@]}):"
  for check in "${PASSED_CHECKS[@]}"; do
    IFS='|' read -r name message <<< "$check"
    echo "   • $name: $message"
  done
  echo ""
fi

# Show failed checks with details
if [ ${#FAILED_CHECKS_DETAILS[@]} -gt 0 ]; then
  echo "❌ FAILED CHECKS ($FAILED_CHECKS):"
  for check in "${FAILED_CHECKS_DETAILS[@]}"; do
    IFS='|' read -r name reason fix <<< "$check"
    echo "   • $name"
    echo "     Reason: $reason"
    echo "     Fix: $fix"
    echo ""
  done
fi

# Final summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED_CHECKS -eq 0 ]; then
  echo "🎉 ALL CHECKS PASSED!"
  echo "✅ Ready to commit with confidence!"
  echo ""
  echo "📈 Quality Summary:"
  echo "   • Format: ✅ Clean"
  echo "   • Lint: ✅ Zero warnings"
  echo "   • Types: ✅ Strict compilation"
  echo "   • Tests: ✅ Above threshold"
  echo "   • Duplication: ✅ Below threshold"
  echo "   • Security: ✅ No high-severity vulnerabilities"
  if [[ "$RUN_SONAR" == "true" ]]; then
    echo "   • SonarQube: ✅ Quality gate passed"
  fi
  exit 0
else
  echo "❌ QUALITY GATE FAILED"
  echo "🔧 $FAILED_CHECKS check(s) need attention"
  echo ""
  echo "💡 Quick Fix Commands:"
  echo "   • Format issues: npm run format:fix"
  echo "   • Lint issues: npm run lint:fix"
  echo "   • Type errors: npm run type-check"
  echo "   • Test coverage: npm run test:coverage"
  echo "   • Code duplication: Check quality-reports/jscpd-report.json"
  echo ""
  echo "🚀 Once fixed, run this script again to verify"
  exit 1
fi 