import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadAppConfig } from "../../src/config/AppConfig";

const completeEnvironment = (
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv => ({
  DATABASE_URL: "postgres://user:pass@localhost:5432/lkod",
  OLLAMA_BASE_URL: "http://localhost:11434",
  CHAT_MODEL: "qwen2.5:7b",
  EMBEDDING_MODEL: "bge-m3",
  CHATBOT_CONTEXT_FILE: "config/lkod-context.md",
  ...overrides,
});

describe("loadAppConfig", () => {
  it("fails at startup when a required variable is missing instead of failing on first request", () => {
    const environment = completeEnvironment({ DATABASE_URL: undefined });

    assert.throws(() => loadAppConfig(environment), /DATABASE_URL/);
  });

  it("lists every missing variable at once so the fix takes one pass", () => {
    const environment = completeEnvironment({
      DATABASE_URL: undefined,
      CHAT_MODEL: undefined,
    });

    assert.throws(() => loadAppConfig(environment), /DATABASE_URL, CHAT_MODEL/);
  });

  it("treats a blank variable as missing", () => {
    const environment = completeEnvironment({ EMBEDDING_MODEL: "   " });

    assert.throws(() => loadAppConfig(environment), /EMBEDDING_MODEL/);
  });

  it("applies defaults for the optional tuning variables", () => {
    const config = loadAppConfig(completeEnvironment());

    assert.equal(config.port, 3012);
    assert.equal(config.retrievalLimit, 5);
    assert.equal(config.rrfK, 60);
    assert.equal(config.postgresPoolMaxConnections, 10);
  });

  it("reads numeric variables as numbers, not as strings", () => {
    const config = loadAppConfig(
      completeEnvironment({ PORT: "8080", RETRIEVAL_LIMIT: "3" }),
    );

    assert.equal(config.port, 8080);
    assert.equal(config.retrievalLimit, 3);
  });

  it("rejects a non numeric value for a numeric variable", () => {
    assert.throws(
      () => loadAppConfig(completeEnvironment({ PORT: "not-a-port" })),
      /PORT must be a number/,
    );
  });
});
