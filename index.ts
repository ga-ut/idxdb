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

type TableSchemas = Record<string, IndexedDBTableSchema<string | number, unknown>>;

type IndexableField<Value> = {
  [Key in keyof Value]: Value[Key] extends IDBValidKey | IDBKeyRange | undefined ? Key : never;
}[keyof Value];

type IndexFieldValue<Value, Field extends keyof Value> = Value[Field] extends
  | IDBValidKey
  | IDBKeyRange
  | undefined
  ? Value[Field]
  : never;

type KeyRangeOptions<Key extends IDBValidKey> = {
  lower?: Key;
  upper?: Key;
  lowerOpen?: boolean;
  upperOpen?: boolean;
  single?: Key;
};

const createKeyRange = <Key extends IDBValidKey>(options: KeyRangeOptions<Key>) => {
  if ("single" in options && options.single !== undefined) {
    return IDBKeyRange.only(options.single);
  }

  const { lower, upper, lowerOpen = false, upperOpen = false } = options;

  if (lower !== undefined && upper !== undefined) {
    return IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
  }

  if (lower !== undefined) {
    return IDBKeyRange.lowerBound(lower, lowerOpen);
  }

  if (upper !== undefined) {
    return IDBKeyRange.upperBound(upper, upperOpen);
  }

  throw new Error("createKeyRange requires at least one bound or a single value.");
};

type RangeDescriptor<Key extends IDBValidKey> =
  | {
      between: [Key, Key];
      lowerOpen?: boolean;
      upperOpen?: boolean;
    }
  | {
      gte?: Key;
      gt?: Key;
      lte?: Key;
      lt?: Key;
    };

type WhereOperand<Value, Field extends keyof Value> =
  | IndexFieldValue<Value, Field>
  | (IndexFieldValue<Value, Field> extends IDBValidKey
      ? RangeDescriptor<IndexFieldValue<Value, Field>>
      : never);

const isRangeDescriptor = (value: unknown): value is RangeDescriptor<IDBValidKey> => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const descriptor = value as Partial<Record<"between" | "gte" | "gt" | "lte" | "lt", unknown>>;
  return (
    Array.isArray(descriptor.between) ||
    descriptor.gte !== undefined ||
    descriptor.gt !== undefined ||
    descriptor.lte !== undefined ||
    descriptor.lt !== undefined
  );
};

const toKeyRange = <Key extends IDBValidKey>(descriptor: RangeDescriptor<Key>) => {
  if ("between" in descriptor) {
    const [lower, upper] = descriptor.between;
    return createKeyRange({
      lower,
      upper,
      lowerOpen: descriptor.lowerOpen ?? false,
      upperOpen: descriptor.upperOpen ?? false,
    });
  }

  const hasGt = descriptor.gt !== undefined;
  const hasGte = descriptor.gte !== undefined;
  const hasLt = descriptor.lt !== undefined;
  const hasLte = descriptor.lte !== undefined;

  if (hasGt && hasGte) {
    throw new Error("Specify only one of `gt` or `gte` for a range.");
  }

  if (hasLt && hasLte) {
    throw new Error("Specify only one of `lt` or `lte` for a range.");
  }

  const lower = (descriptor.gt ?? descriptor.gte) as Key | undefined;
  const upper = (descriptor.lt ?? descriptor.lte) as Key | undefined;

  if (lower === undefined && upper === undefined) {
    throw new Error("A range descriptor requires at least one boundary.");
  }

  return createKeyRange({
    lower,
    upper,
    lowerOpen: hasGt,
    upperOpen: hasLt,
  });
};

class IdxDB<T extends TableSchemas> {
  constructor(private tableSchemas: T) {}

  static createSchema<TableName extends string, Key extends string | number, Value>(
    tableName: TableName,
    schema: IndexedDBTableSchema<Key, Value>,
  ): Record<TableName, IndexedDBTableSchema<Key, Value>> {
    return { [tableName]: schema } as Record<TableName, IndexedDBTableSchema<Key, Value>>;
  }

  open(name: string, version?: number) {
    return new Promise<Handler<T>>((resolve, reject) => {
      const request = indexedDB.open(name, version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(new Handler(request.result, this.tableSchemas));

      request.onupgradeneeded = () => {
        const db = request.result;

        // Delete existing object stores if they exist
        for (const storeName of Array.from(db.objectStoreNames)) {
          db.deleteObjectStore(storeName);
        }

        // Create new object stores
        for (const [tableName, schema] of Object.entries(this.tableSchemas)) {
          const objectStore = db.createObjectStore(tableName, {
            keyPath: schema.keyPath,
            autoIncrement: schema.autoIncrement,
          });

          if (schema.indexes) {
            for (const { name, keyPath, options } of schema.indexes) {
              objectStore.createIndex(name, keyPath, options);
            }
          }
        }
      };
    });
  }
}

class Handler<T extends TableSchemas> {
  constructor(
    private db: IDBDatabase,
    private tableSchemas: T,
  ) {}

  async get<K extends keyof T>(params: { tableName: K; key: string }) {
    return new Promise<T[K]["value"] | undefined>((resolve, reject) => {
      const transaction = this.db.transaction(params.tableName as string, "readonly");
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.get(params.key);

      request.onsuccess = () => resolve(request.result as T[K]["value"]);
      request.onerror = () => reject(request.error);
    });
  }

  async add<K extends keyof T>(params: { tableName: K; data: T[K]["value"] }) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(params.tableName as string, "readwrite");
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.put(params.data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async insert<K extends keyof T>(params: { tableName: K; data: T[K]["value"] }) {
    return this.add(params);
  }

  async delete<K extends keyof T>(params: { tableName: K; key: string }) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(params.tableName as string, "readwrite");
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.delete(params.key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clear<K extends keyof T>(params: { tableName: K }) {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(params.tableName as string, "readwrite");
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAll<K extends keyof T>(params: { tableName: K }) {
    return new Promise<T[K]["value"][]>((resolve, reject) => {
      const transaction = this.db.transaction(params.tableName as string, "readonly");
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async count<K extends keyof T>(params: { tableName: K }) {
    return new Promise<number>((resolve, reject) => {
      const transaction = this.db.transaction(params.tableName as string, "readonly");
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.count();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getRange<K extends keyof T>(params: { tableName: K; range: IDBKeyRange }) {
    return new Promise<T[K]["value"][]>((resolve, reject) => {
      const transaction = this.db.transaction(params.tableName as string, "readonly");
      const objectStore = transaction.objectStore(params.tableName as string);
      const request = objectStore.getAll(params.range);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async transaction<K extends keyof T>(
    tableName: K,
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => Promise<void>,
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
    const schema = this.tableSchemas[tableName as string];
    return new QueryBuilder<T, K>(this.db, tableName, schema.keyPath);
  }

  close() {
    this.db.close();
  }
}

class QueryBuilder<T extends TableSchemas, K extends keyof T> {
  private filters: Array<(store: IDBObjectStore) => Promise<T[K]["value"][]>> = [];
  private limitValue?: number;
  private offsetValue?: number;
  private sortConfig?: {
    key: keyof T[K]["value"];
    direction: "next" | "prev";
  };

  constructor(
    private db: IDBDatabase,
    private tableName: K,
    private keyPath: string,
  ) {}

  limit(count: number) {
    this.limitValue = count;
    return this;
  }

  offset(count: number) {
    this.offsetValue = count;
    return this;
  }

  // Value의 키들을 추출하여 타입으로 사용
  orderBy<Field extends keyof T[K]["value"]>(key: Field, direction: "next" | "prev" = "next") {
    this.sortConfig = {
      key,
      direction,
    };
    return this;
  }

  // 타입 안전한 where절
  where<Field extends IndexableField<T[K]["value"]>>(
    indexName: Field,
    value: WhereOperand<T[K]["value"], Field>,
  ) {
    this.filters.push((store) => {
      const index = store.index(String(indexName));
      return new Promise((resolve, reject) => {
        const operand = isRangeDescriptor(value)
          ? toKeyRange(value as RangeDescriptor<IDBValidKey>)
          : value;
        const request = index.getAll(operand as IDBValidKey | IDBKeyRange);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
    return this;
  }

  async execute(): Promise<T[K]["value"][]> {
    const transaction = this.db.transaction(this.tableName as string, "readonly");
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
        if (results.length === 0) {
          results = filterResults;
          continue;
        }

        const keyPath = this.keyPath as keyof T[K]["value"];
        const filterKeys = new Set(
          filterResults.map((item) => item[keyPath] as unknown as IDBValidKey),
        );
        results = results.filter((item) => filterKeys.has(item[keyPath] as unknown as IDBValidKey));
      }
    }

    // Apply sorting
    if (this.sortConfig) {
      const { key, direction } = this.sortConfig;
      results.sort((a, b) => {
        const aVal = a[key];
        const bVal = b[key];
        const comparison =
          typeof aVal === "number" && typeof bVal === "number"
            ? aVal - bVal
            : String(aVal).localeCompare(String(bVal));
        return direction === "next" ? comparison : -comparison;
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
