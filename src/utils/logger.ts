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
  private readonly isDevelopment = __DEV__;

  /**
   * Log an informational message
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const prefix = this.formatPrefix('INFO', context);
      // eslint-disable-next-line no-console
      console.log(`${prefix} ${message}`, context ?? '');
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const prefix = this.formatPrefix('WARN', context);
      // eslint-disable-next-line no-console
      console.warn(`${prefix} ${message}`, context ?? '');
    }
  }

  /**
   * Log an error message
   */
  error(message: string, error?: unknown, context?: LogContext): void {
    if (this.isDevelopment) {
      const prefix = this.formatPrefix('ERROR', context);
      // eslint-disable-next-line no-console
      console.error(`${prefix} ${message}`, error ?? '', context ?? '');
    }
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const prefix = this.formatPrefix('DEBUG', context);
      // eslint-disable-next-line no-console
      console.log(`${prefix} ${message}`, context ?? '');
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
