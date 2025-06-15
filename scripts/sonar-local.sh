#!/bin/bash

# Local SonarQube Analysis Script
# This runs the SAME analysis that SonarQube automatic analysis runs in CI

echo "🔍 Running LOCAL SonarQube analysis (matches CI exactly)"
echo ""

# Check if SONAR_TOKEN is set
if [ -z "$SONAR_TOKEN" ]; then
    echo "❌ SONAR_TOKEN environment variable is not set!"
    echo ""
    echo "To fix this:"
    echo "1. Go to https://sonarcloud.io/account/security"
    echo "2. Generate a new token for your project"
    echo "3. Export it in your shell:"
    echo "   export SONAR_TOKEN=your_token_here"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✅ SONAR_TOKEN is set"
echo "🚀 Starting analysis..."
echo ""

# Run the actual SonarQube scanner (same as automatic analysis)
npx sonar-scanner \
  -Dsonar.qualitygate.wait=true \
  -Dsonar.qualitygate.timeout=300

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ SonarQube analysis completed successfully!"
    echo "🎯 Check the results at: https://sonarcloud.io/project/overview?id=ScienceIsNeato_fogofdog-frontend"
else
    echo ""
    echo "❌ SonarQube analysis failed!"
    echo "This means your code has quality gate violations (same as CI)"
    exit 1
fi 