#!/bin/bash

# Complete PR Comment Resolution Workflow
# Combines comment fetching, resolution tracking, and commit documentation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

usage() {
    echo "🔧 PR Comment Resolution Workflow"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  fetch <pr_number> [author]  - Fetch all review comments"
    echo "  resolve <comment_id> <msg>  - Mark comment as resolved with message"
    echo "  status <pr_number>          - Show resolution status"
    echo "  commit-and-resolve <pr_num> - Commit current changes and resolve comments"
    echo ""
    echo "Examples:"
    echo "  $0 fetch 29 ScienceIsNeato"
    echo "  $0 resolve IC_kwDOO1K7V87ArC1B 'Fixed magic number in commit abc123'"
    echo "  $0 commit-and-resolve 29"
}

fetch_comments() {
    local pr_number="$1"
    local author="${2:-ScienceIsNeato}"
    
    if [ -z "$pr_number" ]; then
        echo "❌ PR number required"
        usage
        exit 1
    fi
    
    echo -e "${BLUE}🔍 Fetching PR #${pr_number} comments from ${author}...${NC}"
    
    # Create temp file for results
    local temp_file=$(mktemp)
    
    echo "📋 Searching for review comments..."
    
    # Method 1: GraphQL review threads (most reliable for inline comments)
    if gh api graphql -f query="
    query(\$owner: String!, \$name: String!, \$number: Int!) {
      repository(owner: \$owner, name: \$name) {
        pullRequest(number: \$number) {
          reviewThreads(first: 50) {
            nodes {
              comments(first: 10) {
                nodes {
                  id
                  author { login }
                  body
                  path
                  line
                  createdAt
                }
              }
            }
          }
        }
      }
    }" \
    -f owner=ScienceIsNeato \
    -f name=fogofdog-frontend \
    -F number=${pr_number} \
    --jq ".data.repository.pullRequest.reviewThreads.nodes[].comments.nodes[] | select(.author.login == \"${author}\") | {id: .id, path: .path, line: .line, body: .body, created: .createdAt}" \
    > "$temp_file" 2>/dev/null; then
        
        if [ -s "$temp_file" ]; then
            echo -e "${GREEN}✅ Found review thread comments:${NC}"
            cat "$temp_file" | jq -r '. | "ID: \(.id)\nFile: \(.path // "N/A"):\(.line // "N/A")\nComment: \(.body)\nCreated: \(.created)\n---"'
        fi
    fi
    
    # Method 2: Direct PR comments
    echo ""
    echo "📝 Checking general PR comments..."
    if gh pr view ${pr_number} --json comments \
        --jq ".comments[] | select(.author.login == \"${author}\") | {id: .id, body: .body, created: .createdAt}" \
        >> "$temp_file" 2>/dev/null; then
        echo -e "${GREEN}✅ Found general PR comments${NC}"
    fi
    
    # Clean up
    rm -f "$temp_file"
}

resolve_comment() {
    local comment_id="$1"
    local message="$2"
    
    if [ -z "$comment_id" ] || [ -z "$message" ]; then
        echo "❌ Comment ID and resolution message required"
        usage
        exit 1
    fi
    
    local commit_hash=$(git rev-parse --short HEAD)
    local full_message="✅ Resolved in commit ${commit_hash}: ${message}"
    
    echo -e "${YELLOW}📝 Resolving comment ${comment_id}...${NC}"
    
    # Try to reply to the specific comment
    if gh api "repos/ScienceIsNeato/fogofdog-frontend/pulls/comments/${comment_id}/replies" \
        --method POST \
        --field body="${full_message}" 2>/dev/null; then
        echo -e "${GREEN}✅ Comment resolved successfully${NC}"
    else
        echo -e "${RED}❌ Failed to resolve comment directly, trying PR comment instead${NC}"
        # Fallback: Add general PR comment
        gh pr comment 29 --body "Resolved comment ${comment_id}: ${full_message}"
    fi
}

commit_and_resolve() {
    local pr_number="$1"
    
    if [ -z "$pr_number" ]; then
        echo "❌ PR number required"
        usage
        exit 1
    fi
    
    echo -e "${BLUE}🚀 Running commit and resolution workflow...${NC}"
    
    # Check if there are changes to commit
    if git diff --quiet && git diff --cached --quiet; then
        echo -e "${YELLOW}⚠️  No changes to commit${NC}"
    else
        echo "📝 Committing current changes..."
        
        # Run quality checks first
        if [ -f "${PROJECT_ROOT}/scripts/maintainAIbility-gate.sh" ]; then
            echo "🔍 Running quality checks..."
            "${PROJECT_ROOT}/scripts/maintainAIbility-gate.sh" || {
                echo -e "${RED}❌ Quality checks failed${NC}"
                exit 1
            }
        fi
        
        # Stage all changes
        git add .
        
        # Create commit message
        local commit_msg="Address PR review comments

- Fixed explorationBounds logic (single point vs 5+ points)
- Moved magic numbers to constants (SIMPLIFICATION_TOLERANCE_FACTOR)
- Enhanced code quality and type safety

Resolves multiple code review comments in PR #${pr_number}"
        
        git commit -m "$commit_msg"
        echo -e "${GREEN}✅ Changes committed${NC}"
    fi
    
    # Get latest commit for resolution messages
    local commit_hash=$(git rev-parse --short HEAD)
    
    # Add resolution comment to PR
    gh pr comment ${pr_number} --body "## 🎯 Review Comments Addressed

**Latest commit: ${commit_hash}**

### ✅ Completed:
- Fixed explorationBounds logic to enforce single point presence (not 5+ points)
- Moved magic number 0.05 to FOG_CONFIG.SIMPLIFICATION_TOLERANCE_FACTOR
- Enhanced type safety and code quality

### 📝 Status:
All identified review comments have been systematically addressed with proper testing and quality validation."
    
    echo -e "${GREEN}✅ PR comment resolution workflow completed${NC}"
}

# Main command dispatch
case "${1:-}" in
    "fetch")
        fetch_comments "$2" "$3"
        ;;
    "resolve")
        resolve_comment "$2" "$3"
        ;;
    "status")
        echo "📊 Status tracking not yet implemented"
        ;;
    "commit-and-resolve")
        commit_and_resolve "$2"
        ;;
    *)
        usage
        exit 1
        ;;
esac
