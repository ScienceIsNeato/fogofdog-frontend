/**
 * Centralized logging utility for FogOfDog app
 * Replaces direct console usage for better reliability and control
 */

interface LogContext {
  component?: string;
  action?: string;
  [key: string]: unknown;
}

class Logger {
  /**
   * Log an informational message
   */
  info(message: string, context?: LogContext): void {
    if (__DEV__) {
      const prefix = this.formatPrefix('INFO', context);
      // eslint-disable-next-line no-console
      console.log(`${prefix} ${message}`, context ?? '');
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    if (__DEV__) {
      const prefix = this.formatPrefix('WARN', context);
      // eslint-disable-next-line no-console
      console.warn(`${prefix} ${message}`, context ?? '');
    }
  }

  /**
   * Log an error message
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    if (__DEV__) {
      const prefix = this.formatPrefix('ERROR', context);
      // eslint-disable-next-line no-console
      console.error(`${prefix} ${message}`, error ?? '', context ?? '');
    }
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (__DEV__) {
      const prefix = this.formatPrefix('DEBUG', context);
      // eslint-disable-next-line no-console
      console.log(`${prefix} ${message}`, context ?? '');
    }
  }

  /**
   * Log debug information with throttling (only in development)
   * @param key Unique key for the log site (e.g., 'FogOverlay:render')
   * @param message Log message
   * @param context Log context
   * @param intervalMs Minimum interval between logs (default 1000ms)
   */
  private _throttleTimestamps: Record<string, number> = {};
  throttledDebug(key: string, message: string, context?: LogContext, intervalMs = 1000): void {
    if (__DEV__) {
      const now = Date.now();
      if (!this._throttleTimestamps[key] || now - this._throttleTimestamps[key] >= intervalMs) {
        this._throttleTimestamps[key] = now;
        this.debug(message, context);
      }
    }
  }

  private formatPrefix(level: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const component = context?.component ?? 'App';
    const action = context?.action ?? '';

    // Fix nested template literal by extracting inner template to variable
    const actionSuffix = action ? `::${action}` : '';
    return `[${timestamp}] ${level} [${component}${actionSuffix}]`;
  }
}

export const logger = new Logger();
