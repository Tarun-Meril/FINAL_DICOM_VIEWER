/**
 * Main Medical Imaging Engine Entrypoint Bootstrapper
 */

import { IEngineConfig, IEngineContext } from './types/contracts';
import { CornerstoneBootstrap } from './infrastructure/cornerstone/CornerstoneBootstrap';

export async function initImagingEngine(context: IEngineContext, config?: IEngineConfig): Promise<void> {
  let bootstrapper = context.cornerstoneBootstrap;
  if (!bootstrapper) {
    bootstrapper = new CornerstoneBootstrap(context);
    context.cornerstoneBootstrap = bootstrapper;
  }
  await bootstrapper.bootstrap(config);
}

export async function shutdownImagingEngine(context: IEngineContext): Promise<void> {
  if (context.cornerstoneBootstrap) {
    await context.cornerstoneBootstrap.destroy();
    context.cornerstoneBootstrap = undefined;
  }
}
