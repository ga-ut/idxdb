module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["./test/setup.ts"],
  testMatch: ["**/test/**/*.test.ts"],
};
