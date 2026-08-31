import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreateContextService } from "../../../src/application/services/CreateContextService";
import {
  createConfig,
  createDbClientDouble,
  createOllamaClientDouble,
} from "../../helpers/TestDoubles";

const createService = (queryResults: Array<{ rows: unknown[] }> = []) => {
  const { dbClient, calls } = createDbClientDouble(queryResults);
  const ollamaDouble = createOllamaClientDouble();
  const service = new CreateContextService(
    dbClient,
    ollamaDouble.ollamaClient,
    createConfig(),
  );

  return { service, calls, ...ollamaDouble };
};

describe("CreateContextService.saveToDb", () => {
  it("removes the previous rows of the same file so a repeated ingest does not duplicate them", async () => {
    const { service, calls } = createService();

    await service.saveToDb();

    assert.match(calls[0]?.sql ?? "", /^DELETE FROM lkod_search_vectors/);
  });

  it("scopes the delete to the ingested file instead of clearing the whole table", async () => {
    const { service, calls } = createService();

    await service.saveToDb();

    assert.match(calls[0]?.sql ?? "", /WHERE filename = \$1/);
    assert.equal(calls[0]?.parameters.length, 1);
  });

  it("resolves the context file to an absolute path that works on any platform", async () => {
    const { service, calls } = createService();

    await service.saveToDb();

    const fileName = String(calls[0]?.parameters[0]);
    assert.doesNotMatch(
      fileName,
      /\\\\/,
      "no doubled separator from string concatenation",
    );
    assert.match(fileName, /lkod-context\.md$/);
  });

  it("stores an embedding together with every inserted section", async () => {
    const { service, calls } = createService();

    await service.saveToDb();
    const insertCalls = calls.filter((call) =>
      call.sql.includes("INSERT INTO"),
    );

    assert.ok(insertCalls.length > 0);
    for (const insertCall of insertCalls) {
      assert.match(insertCall.sql, /embedding/);
      assert.equal(insertCall.parameters.length, 4);
    }
  });

  it("keeps line breaks inside a section instead of joining lines with commas", async () => {
    const { service, calls } = createService();

    await service.saveToDb();
    const insertCalls = calls.filter((call) =>
      call.sql.includes("INSERT INTO"),
    );
    const contents = insertCalls.map((call) => String(call.parameters[2]));

    assert.ok(contents.some((content) => content.includes("\n")));
    for (const content of contents) {
      assert.doesNotMatch(content, /[^\n],[A-Za-z]/);
    }
  });

  it("embeds the section body, not its title", async () => {
    const { service, embeddedTexts } = createService();

    await service.saveToDb();

    for (const embeddedText of embeddedTexts) {
      assert.ok(embeddedText.length > 0);
      assert.doesNotMatch(embeddedText, /^#/);
    }
  });
});

describe("CreateContextService.backfillEmbeddings", () => {
  it("updates only the rows that are missing an embedding", async () => {
    const { service, calls } = createService([
      { rows: [{ id: 7, content: "body" }] },
    ]);

    await service.backfillEmbeddings();

    assert.match(calls[0]?.sql ?? "", /WHERE embedding IS NULL/);
    assert.match(calls[1]?.sql ?? "", /^UPDATE lkod_search_vectors/);
  });

  it("touches the database once when there is nothing to backfill", async () => {
    const { service, calls } = createService([{ rows: [] }]);

    await service.backfillEmbeddings();

    assert.equal(calls.length, 1);
  });
});
