import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { IdxDB } from "../index";

const userSchema = IdxDB.createSchema("users", {
  value: {
    id: "",
    name: "",
    age: 0,
    status: "",
    createdAt: 0,
  },
  key: "id",
  keyPath: "id",
  indexes: [
    { name: "name", keyPath: "name" },
    { name: "status", keyPath: "status" },
    { name: "createdAt", keyPath: "createdAt" },
  ],
});

const timestamp = (iso: string) => Date.parse(iso);

describe("IdxDB", () => {
  let db: IdxDB<typeof userSchema>;
  let handler: Awaited<ReturnType<typeof db.open>>;

  beforeEach(async () => {
    db = new IdxDB(userSchema);
    handler = await db.open("testDB", 1);
  });

  afterEach(() => {
    handler.close();
    indexedDB.deleteDatabase("testDB");
  });

  test("should create and retrieve a record", async () => {
    const testUser = {
      id: "1",
      name: "John",
      age: 30,
      status: "active",
      createdAt: timestamp("2024-01-01T09:00:00Z"),
    };

    await handler.add({
      tableName: "users",
      data: testUser,
    });

    const result = await handler.get({
      tableName: "users",
      key: "1",
    });

    expect(result).toEqual(testUser);
  });

  test("should delete a record", async () => {
    const testUser = {
      id: "1",
      name: "John",
      age: 30,
      status: "active",
      createdAt: timestamp("2024-01-01T09:00:00Z"),
    };

    await handler.add({
      tableName: "users",
      data: testUser,
    });

    await handler.delete({
      tableName: "users",
      key: "1",
    });

    const result = await handler.get({
      tableName: "users",
      key: "1",
    });

    expect(result).toBeUndefined();
  });

  test("should query records using index", async () => {
    const users = [
      {
        id: "1",
        name: "John",
        age: 30,
        status: "active",
        createdAt: timestamp("2024-01-01T09:00:00Z"),
      },
      {
        id: "2",
        name: "Jane",
        age: 25,
        status: "inactive",
        createdAt: timestamp("2024-01-03T09:00:00Z"),
      },
      {
        id: "3",
        name: "John",
        age: 35,
        status: "pending",
        createdAt: timestamp("2024-01-05T09:00:00Z"),
      },
    ];

    for (const user of users) {
      await handler.add({
        tableName: "users",
        data: user,
      });
    }

    const results = await handler.query("users").where("name", "John").execute();

    expect(results).toHaveLength(2);
    expect(results).toEqual(expect.arrayContaining([users[0], users[2]]));
  });

  test("should handle pagination", async () => {
    const base = timestamp("2024-01-01T00:00:00Z");
    const users = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      name: `User${i + 1}`,
      age: 20 + i,
      status: i % 2 === 0 ? "active" : "inactive",
      createdAt: base + i * 86_400_000,
    }));

    for (const user of users) {
      await handler.add({
        tableName: "users",
        data: user,
      });
    }

    const results = await handler.query("users").orderBy("age").limit(5).offset(2).execute();

    expect(results).toHaveLength(5);
    expect(results[0].age).toBe(22);
  });

  test("should query records using multiple conditions", async () => {
    const users = [
      {
        id: "1",
        name: "Lee",
        age: 28,
        status: "active",
        createdAt: timestamp("2024-02-01T00:00:00Z"),
      },
      {
        id: "2",
        name: "Lee",
        age: 34,
        status: "inactive",
        createdAt: timestamp("2024-02-02T00:00:00Z"),
      },
      {
        id: "3",
        name: "Kim",
        age: 31,
        status: "active",
        createdAt: timestamp("2024-02-03T00:00:00Z"),
      },
    ];

    for (const user of users) {
      await handler.add({
        tableName: "users",
        data: user,
      });
    }

    const results = await handler
      .query("users")
      .where("name", "Lee")
      .where("status", "active")
      .execute();

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(users[0]);
  });

  test("should filter records within a createdAt range", async () => {
    const users = [
      {
        id: "1",
        name: "Lee",
        age: 28,
        status: "active",
        createdAt: timestamp("2024-02-01T09:00:00Z"),
      },
      {
        id: "2",
        name: "Lee",
        age: 34,
        status: "inactive",
        createdAt: timestamp("2024-02-03T09:00:00Z"),
      },
      {
        id: "3",
        name: "Kim",
        age: 31,
        status: "active",
        createdAt: timestamp("2024-02-05T09:00:00Z"),
      },
    ];

    for (const user of users) {
      await handler.add({
        tableName: "users",
        data: user,
      });
    }

    const start = timestamp("2024-02-02T00:00:00Z");
    const end = timestamp("2024-02-05T00:00:00Z");

    const results = await handler
      .query("users")
      .where("createdAt", { gte: start, lt: end })
      .execute();

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(users[1]);
  });
});
