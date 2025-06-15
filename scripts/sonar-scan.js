#!/usr/bin/env node

const scanner = require('sonarqube-scanner').default;
const https = require('https');

console.log('🔍 Running LOCAL SonarQube analysis (matches CI exactly)\n');

// Check if SONAR_TOKEN is set
if (!process.env.SONAR_TOKEN) {
    console.log('❌ SONAR_TOKEN environment variable is not set!');
    console.log('\nTo fix this:');
    console.log('1. Go to https://sonarcloud.io/account/security');
    console.log('2. Generate a new token for your project');
    console.log('3. Add it to your .envrc file:');
    console.log('   export SONAR_TOKEN=your_token_here');
    console.log('4. Run: direnv allow');
    console.log('\nThen run this script again.');
    process.exit(1);
}

console.log('✅ SONAR_TOKEN is set');
console.log('🚀 Starting analysis...\n');

// Function to fetch and display SonarQube issues
async function fetchAndDisplayIssues() {
    try {
        console.log('\n📋 Fetching detailed issue list...\n');
        
        const options = {
            hostname: 'sonarcloud.io',
            port: 443,
            path: '/api/issues/search?componentKeys=ScienceIsNeato_fogofdog-frontend&resolved=false&types=CODE_SMELL,BUG,VULNERABILITY&ps=100',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.SONAR_TOKEN}`
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const issues = JSON.parse(data);
                        displayIssues(issues.issues || []);
                        resolve();
                    } catch (e) {
                        console.log('❌ Failed to parse issues response');
                        resolve();
                    }
                });
            });

            req.on('error', (e) => {
                console.log('❌ Failed to fetch issues:', e.message);
                resolve();
            });

            req.end();
        });
    } catch (error) {
        console.log('❌ Error fetching issues:', error.message);
    }
}

function displayIssues(issues) {
    if (!issues || issues.length === 0) {
        console.log('No issues found (or failed to fetch)');
        return;
    }

    console.log(`Found ${issues.length} issue(s):\n`);
    
    // Group by severity
    const groupedIssues = {};
    issues.forEach(issue => {
        const severity = issue.severity || 'UNKNOWN';
        if (!groupedIssues[severity]) {
            groupedIssues[severity] = [];
        }
        groupedIssues[severity].push(issue);
    });

    // Display by severity
    const severityOrder = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];
    severityOrder.forEach(severity => {
        if (groupedIssues[severity]) {
            const icon = severity === 'BLOCKER' || severity === 'CRITICAL' ? '🚨' : 
                        severity === 'MAJOR' ? '⚠️' : '💡';
            console.log(`${icon} ${severity} (${groupedIssues[severity].length} issues):`);
            
            groupedIssues[severity].slice(0, 10).forEach(issue => { // Show first 10 per severity
                const file = issue.component ? issue.component.split(':').pop() : 'Unknown file';
                const line = issue.line ? `:${issue.line}` : '';
                const rule = issue.rule || '';
                console.log(`   • ${file}${line} - ${issue.message} (${rule})`);
            });
            
            if (groupedIssues[severity].length > 10) {
                console.log(`   ... and ${groupedIssues[severity].length - 10} more ${severity} issues`);
            }
            console.log('');
        }
    });

    console.log('🎯 View all details at: https://sonarcloud.io/project/issues?id=ScienceIsNeato_fogofdog-frontend&resolved=false');
}

scanner(
    {
        serverUrl: 'https://sonarcloud.io',
        token: process.env.SONAR_TOKEN,
        options: {
            'sonar.projectKey': 'ScienceIsNeato_fogofdog-frontend',
            'sonar.organization': 'scienceisneato',
            'sonar.projectName': 'fogofdog-frontend',
            'sonar.projectVersion': '1.0.0',
            'sonar.sources': 'src,App.tsx,index.ts',
            'sonar.exclusions': '**/node_modules/**,**/*.test.ts,**/*.test.tsx,**/__tests__/**,**/__mocks__/**,coverage/**,artifacts/**,e2e/**,ios/**,android/**,.expo/**,dist/**',
            'sonar.sourceEncoding': 'UTF-8',
            'sonar.javascript.lcov.reportPaths': 'coverage/lcov.info',
            'sonar.coverage.exclusions': '**/*.test.ts,**/*.test.tsx,**/__tests__/**,**/__mocks__/**',
            'sonar.cpd.exclusions': '**/*.test.ts,**/*.test.tsx,**/__tests__/**,**/__mocks__/**',
            'sonar.qualitygate.wait': 'true',
            'sonar.qualitygate.timeout': '300'
        }
    },
    async (result) => {
        console.log('\n🔍 SonarQube analysis callback triggered');
        
        // Handle case where result is undefined or doesn't have expected structure
        if (!result) {
            console.log('⚠️  Analysis completed but no result object provided');
            console.log('✅ Assuming success - check SonarCloud for details');
            console.log('🎯 View results at: https://sonarcloud.io/project/overview?id=ScienceIsNeato_fogofdog-frontend');
            process.exit(0);
        }
        
        if (result.status === 'SUCCESS') {
            console.log('\n✅ SonarQube analysis completed successfully!');
            console.log('🎯 Check the results at: https://sonarcloud.io/project/overview?id=ScienceIsNeato_fogofdog-frontend');
            process.exit(0);
        } else {
            console.log('\n❌ SonarQube analysis failed!');
            console.log('This means your code has quality gate violations (same as CI)');
            
            // Fetch detailed issues
            await fetchAndDisplayIssues();
            process.exit(1);
        }
    }
); 