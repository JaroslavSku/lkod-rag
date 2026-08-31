import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { OllamaClient } from "../../src/data-access/llama/OllamaClient";
import { createConfig } from "../helpers/TestDoubles";

const originalFetch = globalThis.fetch;

interface IRecordedRequest {
  url: string;
  body: Record<string, unknown>;
}

const stubFetch = (response: {
  ok: boolean;
  status?: number;
  payload?: unknown;
  text?: string;
}) => {
  const requests: IRecordedRequest[] = [];

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({
      url: String(url),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });

    return {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.payload,
      text: async () => response.text ?? "",
    };
  }) as unknown as typeof globalThis.fetch;

  return requests;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("OllamaClient.createEmbeddings", () => {
  it("sends every text in one request so a batch costs a single round trip", async () => {
    const requests = stubFetch({
      ok: true,
      payload: { embeddings: [[0.1], [0.2]] },
    });

    const embeddings = await new OllamaClient(createConfig()).createEmbeddings([
      "first",
      "second",
    ]);

    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0]?.body.input, ["first", "second"]);
    assert.equal(embeddings.length, 2);
  });

  it("calls the embedding endpoint with the embedding model, not the chat model", async () => {
    const requests = stubFetch({ ok: true, payload: { embeddings: [[0.1]] } });

    await new OllamaClient(createConfig()).createEmbeddings(["text"]);

    assert.match(requests[0]?.url ?? "", /\/api\/embed$/);
    assert.equal(requests[0]?.body.model, "test-embedding-model");
  });

  it("names the embedding model in the error so a missing pull is obvious", async () => {
    stubFetch({ ok: false, status: 404, text: "model not found" });

    await assert.rejects(
      () => new OllamaClient(createConfig()).createEmbeddings(["text"]),
      /test-embedding-model/,
    );
  });
});

describe("OllamaClient.getOneEmbedding", () => {
  it("unwraps the single embedding out of the batch response", async () => {
    stubFetch({ ok: true, payload: { embeddings: [[0.1, 0.2]] } });

    const embedding = await new OllamaClient(createConfig()).getOneEmbedding(
      "text",
    );

    assert.deepEqual(embedding, [0.1, 0.2]);
  });

  it("throws instead of returning undefined when the model answered with an empty batch", async () => {
    stubFetch({ ok: true, payload: { embeddings: [] } });

    await assert.rejects(
      () => new OllamaClient(createConfig()).getOneEmbedding("text"),
      /no embedding/,
    );
  });
});

describe("OllamaClient.generateChatResponse", () => {
  it("asks for a non streamed answer at temperature zero so replies stay reproducible", async () => {
    const requests = stubFetch({
      ok: true,
      payload: { message: { role: "assistant", content: "answer" } },
    });

    await new OllamaClient(createConfig()).generateChatResponse([
      { role: "user", content: "question" },
    ]);

    assert.equal(requests[0]?.body.stream, false);
    assert.deepEqual(requests[0]?.body.options, { temperature: 0 });
  });

  it("returns only the message content, not the whole response envelope", async () => {
    stubFetch({
      ok: true,
      payload: { message: { role: "assistant", content: "the answer" } },
    });

    const answer = await new OllamaClient(createConfig()).generateChatResponse([
      { role: "user", content: "question" },
    ]);

    assert.equal(answer, "the answer");
  });

  it("names the chat model in the error so a missing pull is obvious", async () => {
    stubFetch({ ok: false, status: 500, text: "boom" });

    await assert.rejects(
      () =>
        new OllamaClient(createConfig()).generateChatResponse([
          { role: "user", content: "question" },
        ]),
      /test-chat-model/,
    );
  });
});
