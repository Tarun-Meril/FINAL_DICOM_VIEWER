import { Logger, LogCategory } from '../shared/Logger';

export interface IEngine {
  id: string;
  initialize(): Promise<void>;
  destroy(): void;
}

class EngineRegistryImpl {
  private engines: Map<string, IEngine> = new Map();

  register(engine: IEngine): void {
    this.engines.set(engine.id, engine);
    Logger.debug(LogCategory.GENERAL, `[EngineRegistry] Registered engine: ${engine.id}`);
  }

  get(id: string): IEngine | undefined {
    return this.engines.get(id);
  }

  remove(id: string): void {
    this.engines.delete(id);
    Logger.debug(LogCategory.GENERAL, `[EngineRegistry] Removed engine: ${id}`);
  }
}

export const EngineRegistry = new EngineRegistryImpl();
