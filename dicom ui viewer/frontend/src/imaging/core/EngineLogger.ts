/**
 * Centralized Categorized Engine Logger
 */

import { IEngineLogger, LogCategory } from '../types/contracts';

export class EngineLogger implements IEngineLogger {
  private debugEnabled: boolean = true;

  constructor(debugEnabled: boolean = true) {
    this.debugEnabled = debugEnabled;
  }

  public setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  private formatMessage(category: LogCategory, message: string): string {
    const timestamp = new Date().toISOString().substring(11, 23);
    return `[${timestamp}] [${category}] ${message}`;
  }

  public debug(category: LogCategory, message: string, data?: any): void {
    if (!this.debugEnabled) return;
    const formatted = this.formatMessage(category, message);
    if (data !== undefined) {
      console.debug(formatted, data);
    } else {
      console.debug(formatted);
    }
  }

  public info(category: LogCategory, message: string, data?: any): void {
    const formatted = this.formatMessage(category, message);
    if (data !== undefined) {
      console.info(formatted, data);
    } else {
      console.info(formatted);
    }
  }

  public warn(category: LogCategory, message: string, data?: any): void {
    const formatted = this.formatMessage(category, message);
    if (data !== undefined) {
      console.warn(formatted, data);
    } else {
      console.warn(formatted);
    }
  }

  public error(category: LogCategory, message: string, error?: Error, data?: any): void {
    const formatted = this.formatMessage(category, message);
    console.error(formatted, error || '', data !== undefined ? data : '');
  }
}
