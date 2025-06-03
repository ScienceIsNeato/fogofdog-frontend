/**
 * Centralized logging utility for FogOfDog app
 * Replaces direct console usage for better reliability and control
 */

interface LogContext {
  component?: string;
  action?: string;
  [key: string]: any;
}

class Logger {
  private isDevelopment = __DEV__;

  /**
   * Log an informational message
   */
  info(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const prefix = this.formatPrefix('INFO', context);
      console.log(`${prefix} ${message}`, context || '');
    }
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const prefix = this.formatPrefix('WARN', context);
      console.warn(`${prefix} ${message}`, context || '');
    }
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error | any, context?: LogContext): void {
    if (this.isDevelopment) {
      const prefix = this.formatPrefix('ERROR', context);
      console.error(`${prefix} ${message}`, error || '', context || '');
    }
  }

  /**
   * Log debug information (only in development)
   */
  debug(message: string, context?: LogContext): void {
    if (this.isDevelopment) {
      const prefix = this.formatPrefix('DEBUG', context);
      console.log(`${prefix} ${message}`, context || '');
    }
  }

  private formatPrefix(level: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const component = context?.component || 'App';
    const action = context?.action || '';

    return `[${timestamp}] ${level} [${component}${action ? `::${action}` : ''}]`;
  }
}

export const logger = new Logger();
