#!/usr/bin/env python3

"""
maintainAIbility-gate-parallel.py - Parallel Quality Gate Executor

A Python wrapper for the maintainAIbility-gate.sh script that executes
quality checks in parallel to reduce total execution time.

Usage:
    python scripts/maintainAIbility-gate-parallel.py           # All checks in parallel
    python scripts/maintainAIbility-gate-parallel.py --full    # All checks + SonarQube
    python scripts/maintainAIbility-gate-parallel.py --help    # Show help

This wrapper dispatches individual check commands to the existing bash script
in parallel threads, then collects and formats the results.
"""

import argparse
import concurrent.futures
import subprocess
import sys
import time
import re
from typing import List, Tuple, Optional
from dataclasses import dataclass
from enum import Enum


class CheckStatus(Enum):
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class CheckResult:
    name: str
    status: CheckStatus
    duration: float
    output: str
    error: Optional[str] = None


class QualityGateExecutor:
    """Manages parallel execution of quality gate checks."""
    
    def __init__(self):
        self.script_path = "./scripts/maintainAIbility-gate.sh"
        
        # Define all quality checks - all can run in parallel
        self.all_checks = [
            ("format", "🎨 Format Check & Auto-Fix"),
            ("lint", "🔍 Lint Check & Auto-Fix"),
            ("types", "🔧 Type Check"),
            ("tests", "🧪 Test Suite & Coverage"),
            ("duplication", "🔄 Duplication Check"),
            ("security", "🔒 Security Audit & Auto-Fix"),
            ("sonar", "📊 SonarQube Analysis")
        ]
    
    def run_single_check(self, check_flag: str, check_name: str) -> CheckResult:
        """Run a single quality check and return the result."""
        start_time = time.time()
        
        try:
            # Run the individual check
            result = subprocess.run(
                [self.script_path, f"--{check_flag}"],
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout per check
                check=False  # Don't raise exception on non-zero exit code
            )
            
            duration = time.time() - start_time
            
            if result.returncode == 0:
                return CheckResult(
                    name=check_name,
                    status=CheckStatus.PASSED,
                    duration=duration,
                    output=result.stdout
                )
            else:
                return CheckResult(
                    name=check_name,
                    status=CheckStatus.FAILED,
                    duration=duration,
                    output=result.stdout,
                    error=result.stderr
                )
                
        except subprocess.TimeoutExpired:
            duration = time.time() - start_time
            return CheckResult(
                name=check_name,
                status=CheckStatus.FAILED,
                duration=duration,
                output="",
                error=f"Check timed out after {duration:.1f} seconds"
            )
        except (subprocess.SubprocessError, OSError) as e:
            duration = time.time() - start_time
            return CheckResult(
                name=check_name,
                status=CheckStatus.FAILED,
                duration=duration,
                output="",
                error=f"Process error: {str(e)}"
            )
    
    def run_checks_parallel(self, checks: List[Tuple[str, str]], max_workers: int = 6, fail_fast: bool = False) -> List[CheckResult]:
        """Run multiple checks in parallel using ThreadPoolExecutor."""
        results = []
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Submit all checks
            future_to_check = {
                executor.submit(self.run_single_check, check_flag, check_name): (check_flag, check_name)
                for check_flag, check_name in checks
            }
            
            # Collect results as they complete
            for future in concurrent.futures.as_completed(future_to_check):
                _, check_name = future_to_check[future]
                try:
                    result = future.result()
                    results.append(result)
                    
                    # Print real-time status updates
                    status_icon = "✅" if result.status == CheckStatus.PASSED else "❌"
                    print(f"{status_icon} {result.name} completed in {result.duration:.1f}s")
                    
                    # Fail-fast: exit immediately on first failure
                    if fail_fast and result.status == CheckStatus.FAILED:
                        # Enhanced error reporting for test failures
                        if "Test Suite" in result.name:
                            failure_reason = self._extract_test_failure_reason(result.output)
                            print(f"\n🚨 FAIL-FAST: {result.name} failed, terminating immediately...")
                            print(f"   Reason: {failure_reason}")
                        else:
                            print(f"\n🚨 FAIL-FAST: {result.name} failed, terminating immediately...")
                        # Force shutdown executor to kill running processes
                        executor.shutdown(wait=False, cancel_futures=True)
                        # Exit immediately without waiting
                        sys.exit(1)
                    
                except (concurrent.futures.TimeoutError, RuntimeError) as exc:
                    # Handle any exceptions from the future
                    results.append(CheckResult(
                        name=check_name,
                        status=CheckStatus.FAILED,
                        duration=0.0,
                        output="",
                        error=f"Thread execution failed: {exc}"
                    ))
                    print(f"❌ {check_name} failed with exception: {exc}")
        
        return results
    
    def _format_header(self, total_duration: float) -> List[str]:
        """Format the report header."""
        return [
            "📊 Parallel Quality Gate Report",
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "",
            f"⏱️  Total execution time: {total_duration:.1f}s (parallel)",
            ""
        ]
    
    def _format_passed_checks(self, passed_checks: List[CheckResult]) -> List[str]:
        """Format passed checks section."""
        if not passed_checks:
            return []
        
        lines = [f"✅ PASSED CHECKS ({len(passed_checks)}):"]
        for result in passed_checks:
            lines.append(f"   • {result.name}: Completed in {result.duration:.1f}s")
        lines.append("")
        return lines
    
    def _format_failed_checks(self, failed_checks: List[CheckResult]) -> List[str]:
        """Format failed checks section with detailed error output."""
        if not failed_checks:
            return []
        
        lines = [f"❌ FAILED CHECKS ({len(failed_checks)}):"]
        for result in failed_checks:
            lines.append(f"   • {result.name}")
            if result.error:
                lines.append(f"     Error: {result.error}")
            if result.output:
                # Show more detailed output for failed checks (up to 20 lines)
                output_lines = result.output.strip().split('\n')
                # Filter out empty lines and npm noise
                meaningful_lines = [line for line in output_lines if line.strip() and not line.startswith('npm')]
                display_lines = meaningful_lines[:20]  # Show up to 20 meaningful lines
                
                if display_lines:
                    lines.append("     Output:")
                    for line in display_lines:
                        lines.append(f"       {line}")
                
                if len(meaningful_lines) > 20:
                    lines.append(f"       ... and {len(meaningful_lines) - 20} more lines")
                    lines.append(f"       Run the individual check for full details")
            lines.append("")
        return lines
    
    def _format_summary(self, failed_checks: List[CheckResult]) -> List[str]:
        """Format the final summary section."""
        lines = ["━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"]
        
        if not failed_checks:
            lines.extend([
                "🎉 ALL CHECKS PASSED!",
                "✅ Ready to commit with confidence!",
                "",
                "🚀 Parallel execution completed successfully!"
            ])
        else:
            lines.extend([
                "❌ QUALITY GATE FAILED",
                f"🔧 {len(failed_checks)} check(s) need attention",
                "",
                "💡 Run individual checks for detailed output:"
            ])
            for result in failed_checks:
                check_flag = next((flag for flag, name in self.all_checks if name == result.name), "unknown")
                lines.append(f"   • {result.name}: ./scripts/maintainAIbility-gate.sh --{check_flag}")
        
        return lines
    
    def _extract_test_failure_reason(self, output: str) -> str:
        """Extract specific failure reason from test output."""
        if not output:
            return "Unknown test failure"
        
        # Check for actual test failures first (highest priority)

        failed_match = re.search(r'(\d+)\s+failed', output)
        if failed_match:
            failed_count = failed_match.group(1)
            return f"Test failures: {failed_count} test(s) failed"
        
        # Check for coverage threshold failure (when tests pass but coverage is low)
        if "coverage" in output.lower() and ("threshold" in output.lower() or "below" in output.lower()):
            # Extract coverage percentage - try multiple patterns
            coverage_match = re.search(r'(\d+\.?\d*)%.*(?:not met|below).*(\d+\.?\d*)%', output)
            if not coverage_match:
                coverage_match = re.search(r'Coverage at (\d+\.?\d*)%.*below (\d+\.?\d*)%', output)
            
            if coverage_match:
                actual, threshold = coverage_match.groups()
                return f"Coverage threshold not met: {actual}% < {threshold}%"
            else:
                return "Coverage threshold not met"
        
        # Check for other test execution issues
        if "failed" in output.lower() and ("test" in output.lower() or "spec" in output.lower()):
            return "Test execution failures detected"
        
        # Check for compilation/syntax errors
        if "error" in output.lower() and ("syntax" in output.lower() or "compile" in output.lower()):
            return "Compilation or syntax errors"
        
        return "Test suite execution failed"
    
    def format_results(self, results: List[CheckResult], total_duration: float) -> str:
        """Format the results into a comprehensive report."""
        passed_checks = [r for r in results if r.status == CheckStatus.PASSED]
        failed_checks = [r for r in results if r.status == CheckStatus.FAILED]
        
        report = []
        report.extend(self._format_header(total_duration))
        report.extend(self._format_passed_checks(passed_checks))
        report.extend(self._format_failed_checks(failed_checks))
        report.extend(self._format_summary(failed_checks))
        
        return '\n'.join(report)
    
    def execute(self, checks: List[str] = None, fail_fast: bool = False) -> int:
        """Execute all quality checks in parallel and return exit code."""
        print("🔍 Running maintainAIbility quality checks (PARALLEL MODE with auto-fix)...")
        print("")
        
        # Determine which checks to run
        if checks is None:
            # Default: run all checks
            checks_to_run = self.all_checks.copy()
        else:
            # Run only specified checks
            available_checks = {flag: (flag, name) for flag, name in self.all_checks}
            checks_to_run = []
            for check in checks:
                if check in available_checks:
                    checks_to_run.append(available_checks[check])
                else:
                    print(f"❌ Unknown check: {check}")
                    print(f"Available checks: {', '.join(available_checks.keys())}")
                    return 1
        
        start_time = time.time()
        
        # Run all checks in parallel
        print("🚀 Running all quality checks in parallel...")
        all_results = self.run_checks_parallel(checks_to_run, fail_fast=fail_fast)
        
        total_duration = time.time() - start_time
        
        # Format and display results
        print("\n" + self.format_results(all_results, total_duration))
        
        # Return appropriate exit code
        failed_count = len([r for r in all_results if r.status == CheckStatus.FAILED])
        return 1 if failed_count > 0 else 0


def main():
    """Main entry point for the parallel quality gate executor."""
    parser = argparse.ArgumentParser(
        description="Parallel Quality Gate Executor - Run maintainAIbility checks in parallel",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python scripts/ship_it.py                              # All checks in parallel (including SonarQube)
  python scripts/ship_it.py --fail-fast                  # All checks, exit on first failure
  python scripts/ship_it.py --checks format lint tests  # Run only specific checks
  python scripts/ship_it.py --checks tests --fail-fast  # Quick test-only check
  
Available checks: format, lint, types, tests, duplication, security, sonar
  
This tool significantly reduces execution time by running independent quality
checks in parallel threads while maintaining the same quality standards.
        """
    )
    
    parser.add_argument(
        "--checks",
        nargs="+",
        help="Run specific checks only (e.g. --checks format lint tests). Available: format, lint, types, tests, duplication, security, sonar"
    )
    
    parser.add_argument(
        "--fail-fast",
        action="store_true",
        help="Exit immediately on first check failure (for rapid development cycles)"
    )
    
    args = parser.parse_args()
    
    # Create and run the executor
    executor = QualityGateExecutor()
    exit_code = executor.execute(checks=args.checks, fail_fast=args.fail_fast)
    
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
