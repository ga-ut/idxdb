interface IndexedDBTableSchema<Key extends string | number, Value> {
  readonly key: Key;
  value: Value;
  keyPath: string; // Make keyPath required
  autoIncrement?: IDBObjectStoreParameters["autoIncrement"];
  indexes?: SchemaIndex[];
}

interface SchemaIndex {
  name: string;
  keyPath: string | string[];
  options?: IDBIndexParameters;
}

class IdxDB<T extends Record<string, IndexedDBTableSchema<any, any>>> {
  constructor(private tableSchemas: T) {}

  static createSchema<
    TableName extends string,
    Key extends string | number,
    Value
  >(
    tableName: TableName,
    schema: IndexedDBTableSchema<Key, Value>
  ): Record<TableName, IndexedDBTableSchema<Key, Value>> {
    return { [tableName]: schema } as Record<
      TableName,
      IndexedDBTableSchema<Key, Value>
    >;
  }

  open(name: string, version?: number) {
    return new Promise<Handler<T>>((resolve, reject) => {
      const request = indexedDB.open(name, version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () =>
        resolve(new Handler(request.result, this.tableSchemas));

      request.onupgradeneeded = (event) => {
        const db = request.result;

        // Delete existing object stores if they exist
        Array.from(db.objectStoreNames).forEach((storeName) => {
          db.deleteObjectStore(storeName);
        });

        // Create new object stores
        Object.entries(this.tableSchemas).forEach(([tableName, schema]) => {
          const objectStore = db.createObjectStore(tableName, {
            keyPath: schema.keyPath,
            autoIncrement: schema.autoIncrement,
          });

          schema.indexes?.forEach(({ name, keyPath, options }) => {
            objectStore.createIndex(name, keyPath, options);
          });
        });
      };
    });
  }
}

class Handler<T extends Record<string, IndexedDBTableSchema<any, any>>> {
  constructor(private db: IDBDatabase, private tableSchemas: T) {}

  async get<K extends keyof T>(params: { tableName: K; key: string }) {
    return new Promise<T[K]["value"] | undefined>((resolve, reject) => {
      const transaction = this.db.transaction(
        params.tableName as string,
        "readonly"
      );
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.get(params.key);

      request.onsuccess = () => resolve(request.result as T[K]["value"]);
      request.onerror = () => reject(request.error);
    });
  }

  async set<K extends keyof T>(params: { tableName: K; data: T[K]["value"] }) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(
        params.tableName as string,
        "readwrite"
      );
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.put(params.data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete<K extends keyof T>(params: { tableName: K; key: string }) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(
        params.tableName as string,
        "readwrite"
      );
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.delete(params.key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear<K extends keyof T>(params: { tableName: K }) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(
        params.tableName as string,
        "readwrite"
      );
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<K extends keyof T>(params: { tableName: K }) {
    return new Promise<T[K]["value"][]>((resolve, reject) => {
      const transaction = this.db.transaction(
        params.tableName as string,
        "readonly"
      );
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async count<K extends keyof T>(params: { tableName: K }) {
    return new Promise<number>((resolve, reject) => {
      const transaction = this.db.transaction(
        params.tableName as string,
        "readonly"
      );
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getRange<K extends keyof T>(params: {
    tableName: K;
    range: IDBKeyRange;
  }) {
    return new Promise<T[K]["value"][]>((resolve, reject) => {
      const transaction = this.db.transaction(
        params.tableName as string,
        "readonly"
      );
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.getAll(params.range);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async transaction<K extends keyof T>(
    tableName: K,
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => Promise<void>
  ) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(tableName as string, mode);
      const objectStore = transaction.objectStore(tableName as string);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      callback(objectStore).catch(reject);
    });
  }

  query<K extends keyof T>(tableName: K) {
    const transaction = this.db.transaction(tableName as string, "readonly");
    const objectStore = transaction.objectStore(tableName as string);
    return new QueryBuilder<T, K>(this.db, tableName, objectStore);
  }

  close() {
    this.db.close();
  }
}

class QueryBuilder<
  T extends Record<string, IndexedDBTableSchema<any, any>>,
  K extends keyof T
> {
  private filters: Array<(store: IDBObjectStore) => Promise<T[K]["value"][]>> =
    [];
  private limitValue?: number;
  private offsetValue?: number;
  private sortConfig?: { key: string; direction: "next" | "prev" };

  constructor(
    private db: IDBDatabase,
    private tableName: K,
    private objectStore: IDBObjectStore
  ) {}

  range(range: IDBKeyRange) {
    this.filters.push((store) => {
      return new Promise((resolve, reject) => {
        const request = store.getAll(range);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
    return this;
  }

  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  offset(count: number) {
    this.offsetValue = count;
    return this;
  }

  // Value의 키들을 추출하여 타입으로 사용
  orderBy<Field extends keyof T[K]["value"]>(
    key: Field,
    direction: "next" | "prev" = "next"
  ) {
    this.sortConfig = {
      key: key as string,
      direction,
    };
    return this;
  }

  // 타입 안전한 where절
  where<Field extends keyof T[K]["value"]>(
    indexName: Field,
    value: T[K]["value"][Field]
  ) {
    this.filters.push((store) => {
      const index = store.index(indexName as string);
      return new Promise((resolve, reject) => {
        const request = index.getAll(value);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
    return this;
  }

  async execute(): Promise<T[K]["value"][]> {
    const transaction = this.db.transaction(
      this.tableName as string,
      "readonly"
    );
    const store = transaction.objectStore(this.tableName as string);

    let results: T[K]["value"][] = [];

    // If no filters, get all records
    if (this.filters.length === 0) {
      const request = store.getAll();
      results = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } else {
      // Execute all filters
      for (const filter of this.filters) {
        const filterResults = await filter(store);
        results = results.length
          ? results.filter((item) => filterResults.includes(item))
          : filterResults;
      }
    }

    // Apply sorting
    if (this.sortConfig) {
      results.sort((a: any, b: any) => {
        const aVal = a[this.sortConfig!.key];
        const bVal = b[this.sortConfig!.key];
        const comparison =
          typeof aVal === "number" && typeof bVal === "number"
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));
        return this.sortConfig!.direction === "next" ? comparison : -comparison;
      });
    }

    // Apply pagination
    if (this.offsetValue || this.limitValue) {
      const start = this.offsetValue || 0;
      const end = this.limitValue ? start + this.limitValue : undefined;
      results = results.slice(start, end);
    }

    return results;
  }
}

export { IdxDB, type IndexedDBTableSchema, type SchemaIndex };
