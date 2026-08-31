import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NextFunction, Request, Response } from "express";
import { QueryController } from "../../../src/application/controllers/QueryController";
import type { QueryService } from "../../../src/application/services/QueryService";

const createResponseDouble = () => {
  const recorded: { status?: number; body?: unknown } = {};

  const response = {
    status: (statusCode: number) => {
      recorded.status = statusCode;
      return response;
    },
    json: (body: unknown) => {
      recorded.body = body;
      return response;
    },
  } as unknown as Response;

  return { response, recorded };
};

const createController = (
  options: { answer?: string; failWith?: Error } = {},
) => {
  const receivedQuestions: string[] = [];

  const queryService = {
    returnQueryResult: async (question: string) => {
      receivedQuestions.push(question);
      if (options.failWith) {
        throw options.failWith;
      }
      return options.answer ?? "answer";
    },
  } as unknown as QueryService;

  return {
    controller: new QueryController(queryService),
    receivedQuestions,
  };
};

const invoke = async (
  controller: QueryController,
  body: unknown,
): Promise<{
  recorded: { status?: number; body?: unknown };
  forwardedError: unknown;
}> => {
  const { response, recorded } = createResponseDouble();
  let forwardedError: unknown;

  const next: NextFunction = (error?: unknown) => {
    forwardedError = error;
  };

  await controller.returnQuery({ body } as Request, response, next);
  return { recorded, forwardedError };
};

describe("QueryController.returnQuery", () => {
  it("answers with the model result on a valid question", async () => {
    const { controller } = createController({ answer: "Elastic License 2.0" });

    const { recorded, forwardedError } = await invoke(controller, {
      question: "licence?",
    });

    assert.equal(forwardedError, undefined);
    assert.equal(recorded.status, 200);
    assert.deepEqual(recorded.body, { message: "Elastic License 2.0" });
  });

  it("rejects a missing question with a client error instead of asking the model", async () => {
    const { controller, receivedQuestions } = createController();

    const { forwardedError } = await invoke(controller, {});

    assert.equal((forwardedError as { status?: number }).status, 400);
    assert.equal(receivedQuestions.length, 0);
  });

  it("rejects a whitespace only question", async () => {
    const { controller, receivedQuestions } = createController();

    const { forwardedError } = await invoke(controller, { question: "   " });

    assert.equal((forwardedError as { status?: number }).status, 400);
    assert.equal(receivedQuestions.length, 0);
  });

  it("rejects a question that is not a string so the value cannot reach the SQL layer", async () => {
    const { controller, receivedQuestions } = createController();

    const { forwardedError } = await invoke(controller, {
      question: { sql: 1 },
    });

    assert.equal((forwardedError as { status?: number }).status, 400);
    assert.equal(receivedQuestions.length, 0);
  });

  it("trims the question before handing it to the service", async () => {
    const { controller, receivedQuestions } = createController();

    await invoke(controller, { question: "  licence?  " });

    assert.deepEqual(receivedQuestions, ["licence?"]);
  });

  it("forwards a service failure to the error handler rather than crashing the process", async () => {
    const { controller } = createController({
      failWith: new Error("ollama is down"),
    });

    const { forwardedError, recorded } = await invoke(controller, {
      question: "licence?",
    });

    assert.equal((forwardedError as Error).message, "ollama is down");
    assert.equal(recorded.status, undefined);
  });
});
