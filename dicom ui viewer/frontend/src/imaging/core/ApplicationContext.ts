export class ApplicationContext {
  private static instance: ApplicationContext;
  private config: Record<string, any> = {};

  private constructor() {}

  static getInstance(): ApplicationContext {
    if (!ApplicationContext.instance) {
      ApplicationContext.instance = new ApplicationContext();
    }
    return ApplicationContext.instance;
  }

  setConfig(key: string, value: any) {
    this.config[key] = value;
  }

  getConfig(key: string): any {
    return this.config[key];
  }
}

export const AppContext = ApplicationContext.getInstance();
