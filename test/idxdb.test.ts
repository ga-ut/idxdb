import { IdxDB } from "../index";

describe("IdxDB", () => {
  const userSchema = IdxDB.createSchema("users", {
    key: "id", // Change back to "id" to match keyPath
    value: {
      id: "",
      name: "",
      age: 0,
    },
    keyPath: "id", // Required field
    indexes: [{ name: "name", keyPath: "name" }],
  });

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
    const testUser = { id: "1", name: "John", age: 30 };

    await handler.set({
      tableName: "users",
      data: testUser,
    });

    const result = await handler.get({
      tableName: "users",
      key: "1", // Use the actual key value instead of "string"
    });

    expect(result).toEqual(testUser);
  });

  test("should delete a record", async () => {
    const testUser = { id: "1", name: "John", age: 30 };

    await handler.set({
      tableName: "users",
      data: testUser,
    });

    await handler.delete({
      tableName: "users",
      key: "1", // Use the actual key value instead of "string"
    });

    const result = await handler.get({
      tableName: "users",
      key: "1", // Use the actual key value instead of "string"
    });

    expect(result).toBeUndefined();
  });

  test("should query records using index", async () => {
    const users = [
      { id: "1", name: "John", age: 30 },
      { id: "2", name: "Jane", age: 25 },
      { id: "3", name: "John", age: 35 },
    ];

    for (const user of users) {
      await handler.set({
        tableName: "users",
        data: user,
      });
    }

    const results = await handler
      .query("users")
      .where("name", "John")
      .execute();

    expect(results).toHaveLength(2);
    expect(results).toEqual(expect.arrayContaining([users[0], users[2]]));
  });

  test("should handle pagination", async () => {
    const users = Array.from({ length: 10 }, (_, i) => ({
      id: String(i + 1),
      name: `User${i + 1}`,
      age: 20 + i,
    }));

    for (const user of users) {
      await handler.set({
        tableName: "users",
        data: user,
      });
    }

    const results = await handler
      .query("users")
      .orderBy("age")
      .limit(5)
      .offset(2)
      .execute();

    expect(results).toHaveLength(5);
    expect(results[0].age).toBe(22);
  });
});
