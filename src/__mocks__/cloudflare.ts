/**
 * Mock Cloudflare D1 Database
 */
export class MockD1Database {
  #data: Map<string, any[]> = new Map();

  constructor() {
    // Initialize with empty tables
    this.#data.set('stories', []);
    this.#data.set('notifications', []);
    this.#data.set('settings', []);
    this.#data.set('stats', []);
  }

  prepare(query: string) {
    return {
      bind: (...params: any[]) => {
        return {
          run: async () => {
            if (query.toLowerCase().includes('insert into')) {
              // Simulate insert
              const tableName = this.#extractTableName(query);
              const tableData = this.#data.get(tableName) || [];
              tableData.push(this.#createMockRow(params));
              return { success: true, meta: { changes: 1 } };
            } else if (query.toLowerCase().includes('update')) {
              // Simulate update
              const tableName = this.#extractTableName(query);
              return { success: true, meta: { changes: 1 } };
            } else if (query.toLowerCase().includes('delete')) {
              // Simulate delete
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: {} };
          },
          first: async <T>() => {
            if (query.toLowerCase().includes('select')) {
              // Simulate select
              const tableName = this.#extractTableName(query);
              const tableData = this.#data.get(tableName) || [];
              
              if (tableData.length === 0) return null;
              
              // Extract ID from params if it exists
              const idParam = params[0];
              if (idParam && tableName === 'stories') {
                const found = tableData.find((row: any) => row.id === idParam);
                return found as T || null;
              }
              
              return tableData[0] as T;
            }
            return null;
          },
          all: async <T>() => {
            if (query.toLowerCase().includes('select')) {
              // Simulate select
              const tableName = this.#extractTableName(query);
              const tableData = this.#data.get(tableName) || [];
              
              // Filter by status if it's in params
              if (params[0] && tableName === 'stories') {
                const statusParam = params[0];
                const filteredData = tableData.filter((row: any) => row.status === statusParam);
                return { results: filteredData.slice(0, params[1] || 10) } as { results: T[] };
              }
              
              return { results: tableData.slice(0, params[0] || 10) } as { results: T[] };
            }
            return { results: [] } as { results: T[] };
          }
        };
      }
    };
  }

  #extractTableName(query: string): string {
    const tableMatch = query.match(/from\s+(\w+)|into\s+(\w+)|update\s+(\w+)/i);
    if (tableMatch) {
      return (tableMatch[1] || tableMatch[2] || tableMatch[3]).toLowerCase();
    }
    return 'unknown';
  }

  #createMockRow(params: any[]): any {
    // This is a very simplistic approach - in a real implementation we'd
    // need more complex logic to map params to column names
    if (params.length >= 2) {
      return { id: params[0], data: params.slice(1) };
    }
    return { id: 1 };
  }

  // Method to seed test data
  seed(tableName: string, data: any[]) {
    this.#data.set(tableName.toLowerCase(), data);
  }
}

/**
 * Mock Cloudflare R2 Bucket
 */
export class MockR2Bucket {
  #objects: Map<string, any> = new Map();

  async put(key: string, value: any, options?: any): Promise<R2Object> {
    const objMetadata = {
      key,
      size: typeof value === 'string' ? value.length : JSON.stringify(value).length,
      etag: `etag-${Date.now()}`,
      version: `v-${Date.now()}`,
      httpMetadata: {},
      customMetadata: options?.customMetadata || {},
      uploaded: new Date().toISOString()
    };
    
    this.#objects.set(key, { value, metadata: objMetadata });
    
    return objMetadata as unknown as R2Object;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const obj = this.#objects.get(key);
    if (!obj) return null;
    
    return {
      ...obj.metadata,
      body: new ReadableStream(),
      bodyUsed: false,
      text: async () => typeof obj.value === 'string' 
        ? obj.value 
        : JSON.stringify(obj.value),
      json: async () => typeof obj.value === 'string' 
        ? JSON.parse(obj.value) 
        : obj.value,
      arrayBuffer: async () => new ArrayBuffer(0),
      blob: async () => new Blob([]),
      bytes: async () => new Uint8Array(0),
      writeHttpMetadata: () => {},
    } as unknown as R2ObjectBody;
  }

  async list(options?: {
    prefix?: string;
    delimiter?: string;
    cursor?: string;
    limit?: number;
  }): Promise<R2Objects> {
    const prefix = options?.prefix || '';
    const matches = Array.from(this.#objects.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, obj]) => obj.metadata)
      .slice(0, options?.limit || 1000);
    
    return {
      objects: matches as unknown as R2Object[],
      truncated: false,
      delimitedPrefixes: []
    } as R2Objects;
  }

  async delete(key: string | string[]): Promise<void> {
    if (Array.isArray(key)) {
      key.forEach(k => this.#objects.delete(k));
    } else {
      this.#objects.delete(key);
    }
  }
}

// Type definitions to satisfy TypeScript
interface R2Object {
  key: string;
  size: number;
  etag: string;
  version: string;
  httpMetadata: Record<string, any>;
  customMetadata: Record<string, any>;
  uploaded: string;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  bodyUsed: boolean;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
  blob(): Promise<Blob>;
  bytes(): Promise<Uint8Array>;
  writeHttpMetadata(headers: Headers): void;
}

interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
  delimitedPrefixes: string[];
}
