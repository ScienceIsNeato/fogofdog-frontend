#!/bin/bash

# SonarQube CLI Tool - Access SonarCloud analysis data from command line
# Usage: ./scripts/sonar-cli.sh [command] [options]

set -e

# Configuration
SONAR_PROJECT_KEY="ScienceIsNeato_fogofdog-frontend"
SONAR_BASE_URL="https://sonarcloud.io/api"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper function to check if SONAR_TOKEN is set
check_token() {
    if [[ -z "$SONAR_TOKEN" ]]; then
        echo -e "${RED}❌ Error: SONAR_TOKEN environment variable is not set${NC}"
        echo "Set it with: export SONAR_TOKEN=your_token_here"
        exit 1
    fi
}

# Helper function to make API calls
sonar_api() {
    local endpoint="$1"
    local params="$2"
    
    check_token
    
    if [[ -n "$params" ]]; then
        curl -s -u "$SONAR_TOKEN:" "$SONAR_BASE_URL/$endpoint?$params"
    else
        curl -s -u "$SONAR_TOKEN:" "$SONAR_BASE_URL/$endpoint"
    fi
}

# Show usage information
show_help() {
    echo -e "${CYAN}SonarQube CLI Tool${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC} ./scripts/sonar-cli.sh [command] [options]"
    echo ""
    echo -e "${YELLOW}Commands:${NC}"
    echo "  issues [severity]     - Show issues (BLOCKER, CRITICAL, MAJOR, MINOR, INFO)"
    echo "  hotspots             - Show security hotspots"
    echo "  measures             - Show project measures (coverage, bugs, etc.)"
    echo "  quality-gate         - Show quality gate status"
    echo "  duplications         - Show code duplications"
    echo "  summary              - Show project summary"
    echo "  new-code             - Show new code analysis"
    echo "  rules [rule-key]     - Show rule details"
    echo "  help                 - Show this help"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  ./scripts/sonar-cli.sh issues CRITICAL"
    echo "  ./scripts/sonar-cli.sh measures"
    echo "  ./scripts/sonar-cli.sh quality-gate"
    echo "  ./scripts/sonar-cli.sh new-code"
}

# Show issues with optional severity filter
show_issues() {
    local severity="$1"
    local params="componentKeys=$SONAR_PROJECT_KEY&ps=100"
    
    if [[ -n "$severity" ]]; then
        params="$params&severities=$severity"
        echo -e "${CYAN}🔍 Issues with severity: $severity${NC}"
    else
        echo -e "${CYAN}🔍 All Issues${NC}"
    fi
    
    echo ""
    
    sonar_api "issues/search" "$params" | jq -r '
        .issues[] | 
        "\(.severity | ascii_downcase) | \(.type) | \(.component | split(":")[1]) | Line \(.line // "N/A") | \(.message)"
    ' | while IFS='|' read -r sev type comp line msg; do
        case "$sev" in
            *blocker*) echo -e "${RED}🚫 BLOCKER${NC}   | $type | $comp | $line | $msg" ;;
            *critical*) echo -e "${RED}🔴 CRITICAL${NC}  | $type | $comp | $line | $msg" ;;
            *major*) echo -e "${YELLOW}🟡 MAJOR${NC}     | $type | $comp | $line | $msg" ;;
            *minor*) echo -e "${BLUE}🔵 MINOR${NC}     | $type | $comp | $line | $msg" ;;
            *info*) echo -e "${GREEN}ℹ️  INFO${NC}      | $type | $comp | $line | $msg" ;;
        esac
    done
}

# Show security hotspots
show_hotspots() {
    echo -e "${CYAN}🔥 Security Hotspots${NC}"
    echo ""
    
    sonar_api "hotspots/search" "projectKey=$SONAR_PROJECT_KEY" | jq -r '
        if .hotspots | length == 0 then
            "✅ No security hotspots found"
        else
            .hotspots[] | 
            "\(.vulnerabilityProbability) | \(.component | split(":")[1]) | Line \(.line) | \(.message)"
        end
    ' | while IFS='|' read -r prob comp line msg; do
        case "$prob" in
            HIGH) echo -e "${RED}🔴 HIGH${NC}       | $comp | $line | $msg" ;;
            MEDIUM) echo -e "${YELLOW}🟡 MEDIUM${NC}     | $comp | $line | $msg" ;;
            LOW) echo -e "${GREEN}🟢 LOW${NC}        | $comp | $line | $msg" ;;
            *) echo "$prob | $comp | $line | $msg" ;;
        esac
    done
}

# Show project measures
show_measures() {
    echo -e "${CYAN}📊 Project Measures${NC}"
    echo ""
    
    local metrics="coverage,new_coverage,bugs,new_bugs,vulnerabilities,new_vulnerabilities,code_smells,new_code_smells,sqale_index,new_technical_debt,duplicated_lines_density,new_duplicated_lines_density,ncloc,new_lines"
    
    sonar_api "measures/component" "component=$SONAR_PROJECT_KEY&metricKeys=$metrics" | jq -r '
        .component.measures[] | 
        select(.value != null) |
        "\(.metric) | \(.value) | \(.periods[0].value // "N/A")"
    ' | while IFS='|' read -r metric value new_value; do
        case "$metric" in
            coverage) echo -e "${GREEN}📈 Coverage:${NC} $value% (New: $new_value%)" ;;
            bugs) echo -e "${RED}🐛 Bugs:${NC} $value (New: $new_value)" ;;
            vulnerabilities) echo -e "${RED}🔓 Vulnerabilities:${NC} $value (New: $new_value)" ;;
            code_smells) echo -e "${YELLOW}👃 Code Smells:${NC} $value (New: $new_value)" ;;
            sqale_index) echo -e "${PURPLE}⏱️  Technical Debt:${NC} ${value}min (New: ${new_value}min)" ;;
            duplicated_lines_density) echo -e "${BLUE}📋 Duplication:${NC} $value% (New: $new_value%)" ;;
            ncloc) echo -e "${CYAN}📏 Lines of Code:${NC} $value (New: $new_value)" ;;
        esac
    done
}

# Show quality gate status
show_quality_gate() {
    echo -e "${CYAN}🚪 Quality Gate Status${NC}"
    echo ""
    
    sonar_api "qualitygates/project_status" "projectKey=$SONAR_PROJECT_KEY" | jq -r '
        "Status: \(.projectStatus.status)",
        "Conditions:",
        (.projectStatus.conditions[] | "  \(.status) | \(.metricKey) | \(.actualValue) | \(.errorThreshold) | \(.comparator)")
    ' | while IFS='|' read -r status metric actual threshold comparator; do
        if [[ "$status" == "Status:"* ]]; then
            case "$status" in
                *OK*) echo -e "${GREEN}✅ $status${NC}" ;;
                *ERROR*) echo -e "${RED}❌ $status${NC}" ;;
                *) echo "$status" ;;
            esac
        elif [[ "$status" == "Conditions:" ]]; then
            echo -e "${YELLOW}📋 Conditions:${NC}"
        else
            case "$status" in
                *OK*) echo -e "  ${GREEN}✅ OK${NC}    | $metric | $actual | $threshold | $comparator" ;;
                *ERROR*) echo -e "  ${RED}❌ ERROR${NC} | $metric | $actual | $threshold | $comparator" ;;
                *) echo "  $status | $metric | $actual | $threshold | $comparator" ;;
            esac
        fi
    done
}

# Show duplications
show_duplications() {
    echo -e "${CYAN}📋 Code Duplications${NC}"
    echo ""
    
    sonar_api "duplications/show" "key=$SONAR_PROJECT_KEY" | jq -r '
        if .duplications | length == 0 then
            "✅ No duplications found"
        else
            .duplications[] |
            "File: \(.file) | Lines: \(.from)-\(.size) | Duplicated in \(.blocks | length) places"
        end
    '
}

# Show project summary
show_summary() {
    echo -e "${CYAN}📊 Project Summary${NC}"
    echo ""
    
    # Get basic project info
    sonar_api "components/show" "component=$SONAR_PROJECT_KEY" | jq -r '
        "Project: \(.component.name)",
        "Key: \(.component.key)",
        "Language: \(.component.language // "Multiple")",
        "Last Analysis: \(.component.analysisDate)"
    '
    
    echo ""
    
    # Get quality gate status
    show_quality_gate
    
    echo ""
    
    # Get key measures
    show_measures
}

# Show new code analysis
show_new_code() {
    echo -e "${CYAN}🆕 New Code Analysis${NC}"
    echo ""
    
    # Get new code measures
    local metrics="new_coverage,new_bugs,new_vulnerabilities,new_code_smells,new_technical_debt,new_duplicated_lines_density,new_lines"
    
    sonar_api "measures/component" "component=$SONAR_PROJECT_KEY&metricKeys=$metrics" | jq -r '
        .component.measures[] | 
        select(.periods[0].value != null) |
        "\(.metric) | \(.periods[0].value)"
    ' | while IFS='|' read -r metric value; do
        case "$metric" in
            new_coverage) echo -e "${GREEN}📈 New Coverage:${NC} $value%" ;;
            new_bugs) echo -e "${RED}🐛 New Bugs:${NC} $value" ;;
            new_vulnerabilities) echo -e "${RED}🔓 New Vulnerabilities:${NC} $value" ;;
            new_code_smells) echo -e "${YELLOW}👃 New Code Smells:${NC} $value" ;;
            new_technical_debt) echo -e "${PURPLE}⏱️  New Technical Debt:${NC} ${value}min" ;;
            new_duplicated_lines_density) echo -e "${BLUE}📋 New Duplication:${NC} $value%" ;;
            new_lines) echo -e "${CYAN}📏 New Lines:${NC} $value" ;;
        esac
    done
    
    echo ""
    echo -e "${YELLOW}🔍 New Code Issues:${NC}"
    
    # Get new code issues
    sonar_api "issues/search" "componentKeys=$SONAR_PROJECT_KEY&inNewCodePeriod=true&ps=20" | jq -r '
        if .issues | length == 0 then
            "✅ No issues in new code"
        else
            .issues[] | 
            "\(.severity) | \(.type) | \(.component | split(":")[1]) | Line \(.line // "N/A") | \(.message)"
        end
    ' | while IFS='|' read -r sev type comp line msg; do
        case "$sev" in
            BLOCKER) echo -e "  ${RED}🚫 BLOCKER${NC}   | $type | $comp | $line | $msg" ;;
            CRITICAL) echo -e "  ${RED}🔴 CRITICAL${NC}  | $type | $comp | $line | $msg" ;;
            MAJOR) echo -e "  ${YELLOW}🟡 MAJOR${NC}     | $type | $comp | $line | $msg" ;;
            MINOR) echo -e "  ${BLUE}🔵 MINOR${NC}     | $type | $comp | $line | $msg" ;;
            INFO) echo -e "  ${GREEN}ℹ️  INFO${NC}      | $type | $comp | $line | $msg" ;;
        esac
    done
}

# Show rule details
show_rule() {
    local rule_key="$1"
    
    if [[ -z "$rule_key" ]]; then
        echo -e "${RED}❌ Error: Rule key is required${NC}"
        echo "Usage: ./scripts/sonar-cli.sh rules typescript:S3776"
        exit 1
    fi
    
    echo -e "${CYAN}📋 Rule Details: $rule_key${NC}"
    echo ""
    
    sonar_api "rules/show" "key=$rule_key" | jq -r '
        .rule |
        "Name: \(.name)",
        "Severity: \(.severity)",
        "Type: \(.type)",
        "Language: \(.lang)",
        "Description: \(.htmlDesc | gsub("<[^>]*>"; "") | .[0:200])..."
    '
}

# Main script logic
case "${1:-help}" in
    "issues")
        show_issues "$2"
        ;;
    "hotspots")
        show_hotspots
        ;;
    "measures")
        show_measures
        ;;
    "quality-gate")
        show_quality_gate
        ;;
    "duplications")
        show_duplications
        ;;
    "summary")
        show_summary
        ;;
    "new-code")
        show_new_code
        ;;
    "rules")
        show_rule "$2"
        ;;
    "help"|*)
        show_help
        ;;
esac
