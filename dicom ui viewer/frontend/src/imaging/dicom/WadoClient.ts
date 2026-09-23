/**
 * WadoClient DICOMweb Networking Layer
 * Supports WADO-RS, QIDO-RS, and WADO-URI HTTP endpoints with retry logic and error mapping
 */

import { IEngineContext, IWadoClient, IWadoClientOptions } from '../types/contracts';

export class WadoClient implements IWadoClient {
  private engineContext: IEngineContext;
  private options: IWadoClientOptions;

  constructor(context: IEngineContext, options?: IWadoClientOptions) {
    this.engineContext = context;
    this.options = {
      baseUrl: options?.baseUrl || '',
      headers: options?.headers || { Accept: 'application/json' },
      timeoutMs: options?.timeoutMs || 15000,
      maxRetries: options?.maxRetries || 2,
    };
  }

  public setBaseUrl(url: string): void {
    this.options.baseUrl = url;
  }

  private async fetchWithRetry(url: string, retries: number = 0): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.options.headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (retries < (this.options.maxRetries || 2)) {
        this.engineContext.logger.warn('Loader', `Retrying HTTP request to ${url} (Attempt ${retries + 1})...`);
        return this.fetchWithRetry(url, retries + 1);
      }
      this.engineContext.logger.error('Loader', `WadoClient fetch failed for ${url}`, err);
      throw err;
    }
  }

  public async fetchStudyMetadata(studyUid: string): Promise<any[]> {
    const start = performance.now();
    const baseUrl = this.options.baseUrl || '';
    const url = `${baseUrl}/api/studies/${studyUid}/series`;

    this.engineContext.logger.debug('Loader', `Fetching series list for study: ${studyUid}`);
    const response = await this.fetchWithRetry(url);
    const data = await response.json();
    
    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordMetadataParseTime(duration);
    this.engineContext.logger.info('Loader', `Study metadata fetched for ${studyUid} in ${Math.round(duration)}ms`);
    return data;
  }

  public async fetchSeriesMetadata(studyUid: string, seriesUid: string): Promise<any[]> {
    const start = performance.now();
    const baseUrl = this.options.baseUrl || '';
    const url = `${baseUrl}/api/series/${seriesUid}/instances`;

    this.engineContext.logger.debug('Loader', `Fetching instances for series: ${seriesUid}`);
    const response = await this.fetchWithRetry(url);
    const data = await response.json();

    const duration = performance.now() - start;
    this.engineContext.performanceMonitor.recordMetadataParseTime(duration);
    this.engineContext.logger.info('Loader', `Series metadata fetched for ${seriesUid} (${data.length || 0} instances) in ${Math.round(duration)}ms`);
    return data;
  }

  public async fetchInstanceMetadata(studyUid: string, seriesUid: string, sopUid: string): Promise<any> {
    const baseUrl = this.options.baseUrl || '';
    const url = `${baseUrl}/api/instances/${sopUid}`;
    const response = await this.fetchWithRetry(url);
    return response.json();
  }
}
