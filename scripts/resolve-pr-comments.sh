#!/bin/bash

# PR Comment Resolution Helper
# Usage: ./scripts/resolve-pr-comments.sh <pr_number> [author_filter]
# Example: ./scripts/resolve-pr-comments.sh 29 ScienceIsNeato

set -e

PR_NUMBER=${1:-}
AUTHOR_FILTER=${2:-ScienceIsNeato}

if [ -z "$PR_NUMBER" ]; then
    echo "❌ Usage: $0 <pr_number> [author_filter]"
    echo "   Example: $0 29 ScienceIsNeato"
    exit 1
fi

echo "🔍 Fetching PR #${PR_NUMBER} review comments from ${AUTHOR_FILTER}..."

# Try multiple approaches to get review comments
echo ""
echo "📋 Method 1: Direct PR comments"
gh api repos/ScienceIsNeato/fogofdog-frontend/pulls/${PR_NUMBER}/comments \
    --jq ".[] | select(.user.login == \"${AUTHOR_FILTER}\") | {id: .id, path: .path, line: .line, body: .body}" \
    2>/dev/null || echo "No direct PR comments found"

echo ""
echo "📋 Method 2: Review thread comments via GraphQL"
gh api graphql -f query="
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
              createdAt
              path
              line
            }
          }
        }
      }
    }
  }
}" \
-f owner=ScienceIsNeato \
-f name=fogofdog-frontend \
-F number=${PR_NUMBER} \
--jq ".data.repository.pullRequest.reviewThreads.nodes[].comments.nodes[] | select(.author.login == \"${AUTHOR_FILTER}\") | {id: .id, path: .path, line: .line, body: .body}" \
2>/dev/null || echo "GraphQL query failed"

echo ""
echo "📋 Method 3: All review comments (broader search)"
gh pr view ${PR_NUMBER} --json comments \
    --jq ".comments[] | select(.author.login == \"${AUTHOR_FILTER}\") | {id: .id, body: .body}" \
    2>/dev/null || echo "No review comments found"

echo ""
echo "🎯 To resolve a comment, use:"
echo "   gh api repos/ScienceIsNeato/fogofdog-frontend/pulls/comments/COMMENT_ID/replies \\"
echo "     --method POST \\"
echo "     --field body='✅ Resolved in commit: [commit_hash] - [description]'"

echo ""
echo "💡 To mark as resolved after fixing:"
echo "   gh pr comment ${PR_NUMBER} --body '✅ Comment resolved in commit: \$(git rev-parse --short HEAD)'"
