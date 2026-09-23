import { Logger, LogCategory } from '../shared/Logger';

export interface ICapability {
  id: string;
  name: string;
  enable(): Promise<void>;
  disable(): Promise<void>;
  initialize(): Promise<void>;
  destroy(): void;
}

class CapabilityRegistryImpl {
  private capabilities: Map<string, ICapability> = new Map();

  register(capability: ICapability): void {
    this.capabilities.set(capability.id, capability);
    Logger.info(LogCategory.GENERAL, `[CapabilityRegistry] Registered capability: ${capability.name} (${capability.id})`);
  }

  get(id: string): ICapability | undefined {
    return this.capabilities.get(id);
  }
}

export const CapabilityRegistry = new CapabilityRegistryImpl();
