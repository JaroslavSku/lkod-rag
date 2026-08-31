import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import type { App } from "../../src/application/App";
import type { QueryService } from "../../src/application/services/QueryService";
import type { PostgresConnector } from "../../src/data-access/PostgresConnector";
import { AppToken } from "../../src/ioc/AppToken";

type Container = {
  resolve: <T>(token: symbol) => T;
};

let lkodContainer: Container;

before(async () => {
  process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/lkod";
  process.env.OLLAMA_BASE_URL ??= "http://localhost:11434";
  process.env.CHAT_MODEL ??= "qwen2.5:7b";
  process.env.EMBEDDING_MODEL ??= "bge-m3";
  process.env.CHATBOT_CONTEXT_FILE ??= "config/lkod-context.md";
  process.env.LOG_LEVEL = "silent";
  process.env.NODE_ENV = "test";

  const module = await import("../../src/ioc/Di.js");
  lkodContainer = module.lkodContainer as unknown as Container;
});

describe("lkodContainer", () => {
  it("resolves the whole application graph from a single token", () => {
    const app = lkodContainer.resolve<App>(AppToken.App);

    assert.ok(app);
  });

  it("shares one database pool across every consumer so connections are not multiplied", () => {
    const first = lkodContainer.resolve<PostgresConnector>(
      AppToken.PostgresConnector,
    );
    const second = lkodContainer.resolve<PostgresConnector>(
      AppToken.PostgresConnector,
    );

    assert.equal(first, second);
  });

  it("registers services as singletons", () => {
    const first = lkodContainer.resolve<QueryService>(AppToken.QueryService);
    const second = lkodContainer.resolve<QueryService>(AppToken.QueryService);

    assert.equal(first, second);
  });

  it("hands the same configuration instance to every dependent", () => {
    const first = lkodContainer.resolve(AppToken.AppConfig);
    const second = lkodContainer.resolve(AppToken.AppConfig);

    assert.equal(first, second);
  });

  it("builds the express application without binding a port", () => {
    const app = lkodContainer.resolve<App>(AppToken.App);

    assert.equal(typeof app.getExpress(), "function");
  });
});
