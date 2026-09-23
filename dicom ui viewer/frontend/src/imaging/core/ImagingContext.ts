import { ViewportRegistry } from './ViewportRegistry';
import { VolumeRegistry } from './VolumeRegistry';
import { EngineRegistry } from './EngineRegistry';
import { CapabilityRegistry } from './CapabilityRegistry';

export class ImagingContextImpl {
  public viewports = ViewportRegistry;
  public volumes = VolumeRegistry;
  public engines = EngineRegistry;
  public capabilities = CapabilityRegistry;

  private static instance: ImagingContextImpl;

  private constructor() {}

  static getInstance(): ImagingContextImpl {
    if (!ImagingContextImpl.instance) {
      ImagingContextImpl.instance = new ImagingContextImpl();
    }
    return ImagingContextImpl.instance;
  }
}

export const ImagingContext = ImagingContextImpl.getInstance();
