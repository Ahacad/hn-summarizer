/**
 * Logger Utility
 * 
 * This module provides a simple logging interface for the application.
 * It handles formatting, log levels, and potential integration with external
 * logging services in the future.
 */

/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}

/**
 * Log level priority (higher number = higher priority)
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3
};

/**
 * Logger interface
 */
class Logger {
  private level: LogLevel = LogLevel.INFO;
  
  /**
   * Set the minimum log level
   */
  setLevel(level: LogLevel | string): void {
    if (Object.values(LogLevel).includes(level as LogLevel)) {
      this.level = level as LogLevel;
    } else {
      console.warn(`Invalid log level: ${level}, using default (INFO)`);
      this.level = LogLevel.INFO;
    }
  }
  
  /**
   * Check if a log level should be displayed
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }
  
  /**
   * Format a log message
   */
  private format(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    let formatted = `${prefix} ${message}`;
    
    if (data) {
      try {
        // Handle Error objects specially
        if (data.error instanceof Error) {
          data.error = {
            name: data.error.name,
            message: data.error.message,
            stack: data.error.stack
          };
        }
        
        formatted += ` ${JSON.stringify(data)}`;
      } catch (error) {
        formatted += ` [Error stringifying data: ${error.message}]`;
      }
    }
    
    return formatted;
  }
  
  /**
   * Log a debug message
   */
  debug(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.format(LogLevel.DEBUG, message, data));
    }
  }
  
  /**
   * Log an info message
   */
  info(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(this.format(LogLevel.INFO, message, data));
    }
  }
  
  /**
   * Log a warning message
   */
  warn(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.format(LogLevel.WARN, message, data));
    }
  }
  
  /**
   * Log an error message
   */
  error(message: string, data?: any): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.format(LogLevel.ERROR, message, data));
    }
  }
}

// Export a singleton instance
export const logger = new Logger();
