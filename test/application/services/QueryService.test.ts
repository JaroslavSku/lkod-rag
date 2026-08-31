import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QueryService } from "../../../src/application/services/QueryService";
import {
  createConfig,
  createDbClientDouble,
  createOllamaClientDouble,
  createRow,
} from "../../helpers/TestDoubles";

const createService = (
  options: {
    lexicalRows?: unknown[];
    semanticRows?: unknown[];
    chatAnswer?: string;
    retrievalLimit?: number;
  } = {},
) => {
  const { dbClient, calls } = createDbClientDouble([
    { rows: options.lexicalRows ?? [] },
    { rows: options.semanticRows ?? [] },
  ]);
  const ollamaDouble = createOllamaClientDouble(
    options.chatAnswer === undefined ? {} : { chatAnswer: options.chatAnswer },
  );
  const config = createConfig(
    options.retrievalLimit === undefined
      ? {}
      : { retrievalLimit: options.retrievalLimit },
  );

  const service = new QueryService(dbClient, ollamaDouble.ollamaClient, config);
  return { service, calls, ...ollamaDouble };
};

describe("QueryService.addScore", () => {
  it("ranks a document found by both branches above one found by a single branch", () => {
    const { service } = createService();
    const sharedRow = createRow(1);
    const lexicalOnlyRow = createRow(2);

    const fused = service.addScore([lexicalOnlyRow, sharedRow], [sharedRow]);

    assert.equal(fused[0]?.id, 1);
    assert.equal(fused[1]?.id, 2);
  });

  it("derives the score from list position, not from the database id", () => {
    const { service } = createService();
    const highId = createRow(9000);
    const lowId = createRow(1);

    const fused = service.addScore([highId, lowId], []);

    assert.equal(
      fused[0]?.id,
      9000,
      "the row listed first must win regardless of its id",
    );
  });

  it("gives the same fused order no matter which ids the rows carry", () => {
    const { service } = createService();

    const withLowIds = service
      .addScore([createRow(1), createRow(2)], [createRow(2)])
      .map((row) => row.title);
    const withHighIds = service
      .addScore([createRow(501), createRow(502)], [createRow(502)])
      .map((row) => row.title);

    assert.deepEqual(withLowIds, ["Title 2", "Title 1"]);
    assert.deepEqual(withHighIds, ["Title 502", "Title 501"]);
  });

  it("restarts the position counter for the second list instead of continuing it", () => {
    const { service } = createService();
    const lexicalRows = [
      createRow(1),
      createRow(2),
      createRow(3),
      createRow(4),
      createRow(5),
    ];
    const semanticTopRow = createRow(6);

    const fused = service.addScore(lexicalRows, [semanticTopRow]);

    assert.equal(
      fused[1]?.id,
      6,
      "first semantic hit scores as position 0, so it lands right behind the first lexical hit",
    );
  });

  it("deduplicates rows so a document present in both lists appears once", () => {
    const { service } = createService();
    const sharedRow = createRow(1);

    const fused = service.addScore([sharedRow], [sharedRow]);

    assert.equal(fused.length, 1);
  });

  it("returns an empty list when neither branch found anything", () => {
    const { service } = createService();

    assert.deepEqual(service.addScore([], []), []);
  });
});

describe("QueryService.buildContextBloc", () => {
  it("numbers the sources from one so they match the citation rule in the prompt", () => {
    const { service } = createService();

    const contextBlock = service.buildContextBloc([createRow(1), createRow(2)]);

    assert.match(contextBlock, /^\[1\] title: Title 1/);
    assert.match(contextBlock, /\[2\] title: Title 2/);
  });

  it("labels the row title, not the row content", () => {
    const { service } = createService();

    const contextBlock = service.buildContextBloc([
      createRow(1, { title: "Licence", content: "Elastic License 2.0" }),
    ]);

    assert.match(contextBlock, /title: Licence/);
  });

  it("falls back to full content when a semantic row carries no highlighted snippet", () => {
    const { service } = createService();

    const contextBlock = service.buildContextBloc([
      createRow(1, { content: "full content" }),
    ]);

    assert.match(contextBlock, /full content/);
    assert.doesNotMatch(contextBlock, /undefined/);
  });

  it("prefers the highlighted snippet when the lexical branch provided one", () => {
    const { service } = createService();

    const contextBlock = service.buildContextBloc([
      createRow(1, { content: "full content", snippet: "<b>highlighted</b>" }),
    ]);

    assert.match(contextBlock, /<b>highlighted<\/b>/);
    assert.doesNotMatch(contextBlock, /full content/);
  });

  it("separates sources with a delimiter instead of silently joining them by commas", () => {
    const { service } = createService();

    const contextBlock = service.buildContextBloc([createRow(1), createRow(2)]);

    assert.match(contextBlock, /\n\n---\n\n/);
  });
});

describe("QueryService.createPrompt", () => {
  it("sends a system message with the rules and a user message with context and question", () => {
    const { service } = createService();

    const messages = service.createPrompt([createRow(1)], "Co je lkod?");

    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.role, "system");
    assert.equal(messages[1]?.role, "user");
    assert.match(messages[1]?.content ?? "", /### KONTEXT/);
    assert.match(messages[1]?.content ?? "", /### OTÁZKA\nCo je lkod\?/);
  });

  it("tells the model the exact not-found sentence so the answer stays predictable", () => {
    const { service } = createService();

    const messages = service.createPrompt([createRow(1)], "otazka");

    assert.match(
      messages[0]?.content ?? "",
      /Tuto informaci jsem v dokumentu nenašel\./,
    );
  });
});

describe("QueryService.returnQueryResult", () => {
  it("returns the not-found answer without calling the chat model when nothing was retrieved", async () => {
    const { service, chatCalls } = createService();

    const answer = await service.returnQueryResult("neznama otazka");

    assert.equal(answer, "Tuto informaci jsem v dokumentu nenašel.");
    assert.equal(chatCalls.length, 0);
  });

  it("answers from the chat model when at least one branch retrieved context", async () => {
    const { service, chatCalls } = createService({
      lexicalRows: [createRow(1)],
      chatAnswer: "Elastic License 2.0 [1].",
    });

    const answer = await service.returnQueryResult("licence?");

    assert.equal(answer, "Elastic License 2.0 [1].");
    assert.equal(chatCalls.length, 1);
  });

  it("passes the retrieval limit as a query parameter instead of inlining it into SQL", async () => {
    const { service, calls } = createService({ retrievalLimit: 3 });

    await service.returnQueryResult("otazka");

    for (const call of calls) {
      assert.match(call.sql, /LIMIT \$\d/);
      assert.ok(call.parameters.includes(3));
    }
  });

  it("keeps the semantic branch ordered ascending because the operator returns a distance", async () => {
    const { service, calls } = createService();

    await service.returnQueryResult("otazka");

    const semanticCall = calls.find((call) => call.sql.includes("<=>"));
    assert.ok(semanticCall);
    assert.doesNotMatch(semanticCall.sql, /ORDER BY embedding <=> \$1 DESC/);
  });

  it("skips rows without an embedding so they cannot pollute the semantic ranking", async () => {
    const { service, calls } = createService();

    await service.returnQueryResult("otazka");

    const semanticCall = calls.find((call) => call.sql.includes("<=>"));
    assert.match(semanticCall?.sql ?? "", /embedding IS NOT NULL/);
  });

  it("embeds the question so the semantic branch searches by meaning", async () => {
    const { service, embeddedTexts } = createService();

    await service.returnQueryResult("Cim se lisi lkod?");

    assert.deepEqual(embeddedTexts, ["Cim se lisi lkod?"]);
  });
});
