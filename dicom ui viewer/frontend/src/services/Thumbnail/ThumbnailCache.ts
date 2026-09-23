export interface CacheConfig {
  version: number;
  width: number;
  height: number;
  format: string;
  quality?: number;
}

interface MemoryCacheEntry {
  url: string;
  refCount: number;
}

export class ThumbnailCache {
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private dbName = 'MedViewThumbnailCache';
  private storeName = 'thumbnails';
  private db: IDBDatabase | null = null;
  private dbReady: Promise<void>;

  constructor() {
    this.dbReady = this.initDB().catch(e => {
      console.warn('[ThumbnailCache] Failed to initialize IndexedDB, falling back to memory only', e);
      this.db = null;
    });
  }

  private initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = (event: any) => {
        console.error('[ThumbnailCache] IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  public generateKey(studyUID: string, seriesUID: string, preset: string, config: CacheConfig): string {
    return `${studyUID}_${seriesUID}_${preset}_${config.width}x${config.height}_${config.format}_${config.quality || 1}_v${config.version}`;
  }

  public getFromMemory(key: string): string | null {
    const entry = this.memoryCache.get(key);
    if (entry) {
      entry.refCount++;
      return entry.url;
    }
    return null;
  }

  public async getFromIndexedDB(key: string): Promise<string | null> {
    await this.dbReady;
    return new Promise((resolve) => {
      if (!this.db) return resolve(null);
      const transaction = this.db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        if (request.result && request.result instanceof Blob) {
          try {
            const blob = request.result;
            const url = URL.createObjectURL(blob);
            this.memoryCache.set(key, { url, refCount: 1 });
            resolve(url);
          } catch (e) {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null);
    });
  }

  public async store(key: string, blob: Blob): Promise<string> {
    await this.dbReady;
    
    if (!(blob instanceof Blob)) {
      return '';
    }

    // Store in IndexedDB
    if (this.db) {
      try {
        const transaction = this.db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        store.put(blob, key);
      } catch (e) {
        console.warn('Failed to store thumbnail in IndexedDB', e);
      }
    }

    // Store in Memory
    try {
      const url = URL.createObjectURL(blob);
      this.memoryCache.set(key, { url, refCount: 1 });
      return url;
    } catch (e) {
      return '';
    }
  }

  public release(key: string) {
    const entry = this.memoryCache.get(key);
    if (entry) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        const urlToRevoke = entry.url;
        setTimeout(() => {
          try {
            URL.revokeObjectURL(urlToRevoke);
          } catch {}
        }, 15000);
        this.memoryCache.delete(key);
      }
    }
  }
}
