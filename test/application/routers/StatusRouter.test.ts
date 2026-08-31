import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import request from "supertest";
import { StatusRouter } from "../../../src/application/routers/StatusRouter";
import type { PostgresConnector } from "../../../src/data-access/PostgresConnector";
import {
  createConfig,
  createDbClientDouble,
  createFailingDbClientDouble,
} from "../../helpers/TestDoubles";

const createApp = (dbClient: PostgresConnector) => {
  const app = express();
  app.use(new StatusRouter(dbClient, createConfig()).router);
  return app;
};

describe("GET /status", () => {
  it("reports the application as up without touching the database", async () => {
    const { dbClient, calls } = createDbClientDouble();

    const response = await request(createApp(dbClient)).get("/status");

    assert.equal(response.status, 200);
    assert.equal(calls.length, 0);
  });

  it("returns the application name so the probe target is identifiable", async () => {
    const { dbClient } = createDbClientDouble();

    const response = await request(createApp(dbClient)).get("/status");

    assert.deepEqual(response.body, {
      appName: "lkod-rag-test",
      status: "Up",
    });
  });
});

describe("GET /status/readiness", () => {
  it("returns 200 when the database answers the probe query", async () => {
    const { dbClient, calls } = createDbClientDouble([{ rows: [{ one: 1 }] }]);

    const response = await request(createApp(dbClient)).get(
      "/status/readiness",
    );

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "Ready", database: "Up" });
    assert.equal(calls.length, 1);
  });

  it("returns 503 when the database is unreachable so the orchestrator stops routing traffic", async () => {
    const dbClient = createFailingDbClientDouble("connection refused");

    const response = await request(createApp(dbClient)).get(
      "/status/readiness",
    );

    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { status: "NotReady", database: "Down" });
  });

  it("does not leak the database error message to the caller", async () => {
    const dbClient = createFailingDbClientDouble(
      "password authentication failed",
    );

    const response = await request(createApp(dbClient)).get(
      "/status/readiness",
    );

    assert.doesNotMatch(JSON.stringify(response.body), /password/);
  });
});
