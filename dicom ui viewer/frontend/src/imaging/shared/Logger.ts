export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3,
}

export enum LogCategory {
  GENERAL = 'GENERAL',
  PERFORMANCE = 'PERFORMANCE',
  GPU = 'GPU',
  RENDER = 'RENDER',
  TOOL = 'TOOL',
  NETWORK = 'NETWORK',
}

class LoggerService {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private log(level: LogLevel, category: LogCategory, message: string, data?: any) {
    if (level < this.level) return;

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${category}] [${LogLevel[level]}]`;

    switch (level) {
      case LogLevel.DEBUG:
      case LogLevel.INFO:
        console.log(`${prefix} ${message}`, data ? data : '');
        break;
      case LogLevel.WARNING:
        console.warn(`${prefix} ${message}`, data ? data : '');
        break;
      case LogLevel.ERROR:
        console.error(`${prefix} ${message}`, data ? data : '');
        break;
    }
  }

  debug(category: LogCategory, message: string, data?: any) {
    this.log(LogLevel.DEBUG, category, message, data);
  }

  info(category: LogCategory, message: string, data?: any) {
    this.log(LogLevel.INFO, category, message, data);
  }

  warn(category: LogCategory, message: string, data?: any) {
    this.log(LogLevel.WARNING, category, message, data);
  }

  error(category: LogCategory, message: string, data?: any) {
    this.log(LogLevel.ERROR, category, message, data);
  }
}

export const Logger = new LoggerService();
