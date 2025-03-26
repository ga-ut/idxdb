# @ga-ut/idxdb

A type-safe IndexedDB wrapper for TypeScript applications that provides a simple and intuitive API.

## Features

- Full TypeScript support with type inference
- Promise-based API
- Automatic schema management
- Chainable query builder
- Support for indexes and compound queries

## Installation

```bash
npm install @ga-ut/idxdb
```

## Usage

### Basic Example

```typescript
import { IdxDB } from "@ga-ut/idxdb";

// Define your schema
const userSchema = IdxDB.createSchema("users", {
  key: "id",
  value: {
    id: string,
    name: string,
    age: number,
  },
  keyPath: "id",
  indexes: [{ name: "name", keyPath: "name" }],
});

// Create database instance
const db = new IdxDB(userSchema);
const handler = await db.open("myDB", 1);

// Add data
await handler.set({
  tableName: "users",
  data: { id: "1", name: "John", age: 30 },
});

// Get data
const user = await handler.get({
  tableName: "users",
  key: "1",
});

// Query data
const results = await handler.query("users").where("name", "John").execute();
```

### Advanced Queries

```typescript
// Pagination
const results = await handler
  .query("users")
  .orderBy("age")
  .limit(10)
  .offset(20)
  .execute();

// Using indexes
const johnDoes = await handler.query("users").where("name", "John").execute();

// Range queries
const adults = await handler
  .query("users")
  .range(IDBKeyRange.lowerBound(18))
  .execute();
```

## API Reference

### Schema Definition

```typescript
interface IndexedDBTableSchema<Key, Value> {
  readonly key: Key;
  value: Value;
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: Array<{
    name: string;
    keyPath: string | string[];
    options?: IDBIndexParameters;
  }>;
}
```

### Handler Methods

- `set(params)`: Add or update a record
- `get(params)`: Retrieve a record by key
- `delete(params)`: Delete a record by key
- `clear(params)`: Clear all records in a store
- `getAll(params)`: Get all records
- `count(params)`: Get total record count
- `query(tableName)`: Create a query builder

### Query Builder Methods

- `where(indexName, value)`: Filter by index
- `range(IDBKeyRange)`: Filter by key range
- `orderBy(key, direction?)`: Sort results
- `limit(count)`: Limit result count
- `offset(count)`: Skip initial results
- `execute()`: Execute query and return results

## License

MIT
