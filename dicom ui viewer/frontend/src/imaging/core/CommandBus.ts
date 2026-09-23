/**
 * Central Command Bus for UI & Scripting Action Dispatching
 */

import { ICommandBus, IEngineContext } from '../types/contracts';

type CommandHandlerFn = (context: IEngineContext, payload?: any) => any;

export class CommandBus implements ICommandBus {
  private handlers: Map<string, CommandHandlerFn> = new Map();
  private contextProvider: () => IEngineContext;

  constructor(contextProvider: () => IEngineContext) {
    this.contextProvider = contextProvider;
  }

  public registerCommand(name: string, handler: CommandHandlerFn): void {
    if (this.handlers.has(name)) {
      console.warn(`[CommandBus] Overwriting existing command handler for '${name}'`);
    }
    this.handlers.set(name, handler);
  }

  public async executeCommand<T = any>(name: string, payload?: any): Promise<T> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`[CommandBus] Command '${name}' is not registered`);
    }
    const ctx = this.contextProvider();
    ctx.logger.debug('Engine', `Executing command: ${name}`, payload);
    return Promise.resolve(handler(ctx, payload));
  }

  public hasCommand(name: string): boolean {
    return this.handlers.has(name);
  }
}
