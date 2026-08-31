import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Request, Response } from "express";
import request from "supertest";
import { App } from "../../src/application/App";
import { RagRouter } from "../../src/application/routers/RagRouter";
import { StatusRouter } from "../../src/application/routers/StatusRouter";
import type { CreateContextController } from "../../src/application/controllers/CreateContextController";
import type { QueryController } from "../../src/application/controllers/QueryController";
import type { PostgresConnector } from "../../src/data-access/PostgresConnector";
import type { ILogger } from "../../src/utils/Logger";
import { createConfig, createDbClientDouble } from "../helpers/TestDoubles";

const createLoggerDouble = () =>
  ({
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  }) as unknown as ILogger;

const createConnectorDouble = () => {
  const { dbClient } = createDbClientDouble([{ rows: [{ one: 1 }] }]);
  let disconnectCalls = 0;

  const connector = {
    getConnection: dbClient.getConnection.bind(dbClient),
    connect: async () => undefined,
    disconnect: async () => {
      disconnectCalls += 1;
    },
  } as unknown as PostgresConnector;

  return { connector, getDisconnectCalls: () => disconnectCalls };
};

const createApp = (
  options: { queryHandler?: QueryController["returnQuery"] } = {},
) => {
  const { connector, getDisconnectCalls } = createConnectorDouble();
  const config = createConfig();

  const queryController = {
    returnQuery:
      options.queryHandler ??
      (async (_request, response) => {
        response.status(200).json({ message: "ok" });
      }),
  } as unknown as QueryController;

  const createContextController = {
    createContext: async (_request: Request, response: Response) => {
      response.status(200).json({ message: "ok" });
    },
  } as unknown as CreateContextController;

  const app = new App(
    config,
    createLoggerDouble(),
    connector,
    new StatusRouter(connector, config),
    new RagRouter(queryController, createContextController),
  );

  return { app, getDisconnectCalls };
};

describe("App security headers", () => {
  it("sets the hardening headers on every response", async () => {
    const { app } = createApp();

    const response = await request(app.getExpress()).get("/status");

    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["x-frame-options"], "DENY");
    assert.equal(
      response.headers["content-security-policy"],
      "frame-ancestors 'none'",
    );
    assert.equal(
      response.headers["referrer-policy"],
      "no-referrer-when-downgrade",
    );
    assert.ok(response.headers["strict-transport-security"]);
    assert.ok(response.headers["permissions-policy"]);
  });

  it("does not advertise the server technology", async () => {
    const { app } = createApp();

    const response = await request(app.getExpress()).get("/status");

    assert.equal(response.headers["x-powered-by"], undefined);
  });
});

describe("App error handling", () => {
  it("answers unknown routes with a machine readable code", async () => {
    const { app } = createApp();

    const response = await request(app.getExpress()).get("/does-not-exist");

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: "route_not_found" });
  });

  it("hides internal failure details behind a generic server error", async () => {
    const { app } = createApp({
      queryHandler: async (_request, _response, next) => {
        next(new Error("connection string postgres://user:secret@host"));
      },
    });

    const response = await request(app.getExpress())
      .post("/query")
      .send({ question: "anything" });

    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { error: "server_error" });
    assert.doesNotMatch(JSON.stringify(response.body), /secret/);
  });

  it("passes through the message of a client error so the caller can fix the request", async () => {
    const clientError = Object.assign(new Error("question is required"), {
      status: 400,
    });
    const { app } = createApp({
      queryHandler: async (_request, _response, next) => {
        next(clientError);
      },
    });

    const response = await request(app.getExpress())
      .post("/query")
      .send({ question: "anything" });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, { error: "question is required" });
  });
});

describe("App.gracefulShutdown", () => {
  it("releases the database pool so the process can exit cleanly", async () => {
    const { app, getDisconnectCalls } = createApp();

    await app.gracefulShutdown();

    assert.equal(getDisconnectCalls(), 1);
  });

  it("can be called when the server never started listening", async () => {
    const { app, getDisconnectCalls } = createApp();

    await app.gracefulShutdown();
    await app.gracefulShutdown();

    assert.equal(getDisconnectCalls(), 2);
  });
});

describe("App routes", () => {
  it("exposes the ingest endpoint as POST because it changes stored data", async () => {
    const { app } = createApp();

    const postResponse = await request(app.getExpress()).post("/initialize");
    const getResponse = await request(app.getExpress()).get("/initialize");

    assert.equal(postResponse.status, 200);
    assert.equal(getResponse.status, 404);
  });
});
