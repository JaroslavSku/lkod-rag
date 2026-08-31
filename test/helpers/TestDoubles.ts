import type { IAppConfig } from "../../src/config/AppConfig";
import type { OllamaClient } from "../../src/data-access/llama/OllamaClient";
import type { PostgresConnector } from "../../src/data-access/PostgresConnector";
import type { IDatabaseRow } from "../../src/application/services/QueryService";

export const createConfig = (
  overrides: Partial<IAppConfig> = {},
): IAppConfig => ({
  appName: "lkod-rag-test",
  nodeEnv: "test",
  logLevel: "silent",
  port: 3999,
  shutdownTimeoutMs: 1_000,
  databaseUrl: "postgres://user:pass@localhost:5432/test",
  postgresPoolMaxConnections: 5,
  postgresIdleTimeoutMs: 10_000,
  postgresConnectionTimeoutMs: 1_000,
  ollamaBaseUrl: "http://localhost:11434",
  chatModel: "test-chat-model",
  embeddingModel: "test-embedding-model",
  embeddingDimensions: 4,
  contextFile: "config/lkod-context.md",
  retrievalLimit: 5,
  rrfK: 60,
  ...overrides,
});

export const createRow = (
  id: number,
  overrides: Partial<IDatabaseRow> = {},
): IDatabaseRow => ({
  id,
  title: `Title ${id}`,
  filename: "context.md",
  content: `Content of row ${id}`,
  ...overrides,
});

export const createDbClientDouble = (
  queryResults: Array<{ rows: unknown[] }> = [],
) => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  let callIndex = 0;

  const query = async (sql: string, parameters: unknown[] = []) => {
    calls.push({ sql, parameters });
    const result = queryResults[callIndex] ?? { rows: [] };
    callIndex += 1;
    return result;
  };

  const dbClient = {
    getConnection: async () => ({ query }),
  } as unknown as PostgresConnector;

  return { dbClient, calls };
};

export const createFailingDbClientDouble = (message: string) =>
  ({
    getConnection: async () => ({
      query: async () => {
        throw new Error(message);
      },
    }),
  }) as unknown as PostgresConnector;

export const createOllamaClientDouble = (
  options: { embedding?: number[]; chatAnswer?: string } = {},
) => {
  const embeddedTexts: string[] = [];
  const chatCalls: unknown[][] = [];

  const ollamaClient = {
    getOneEmbedding: async (text: string) => {
      embeddedTexts.push(text);
      return options.embedding ?? [0.1, 0.2, 0.3, 0.4];
    },
    generateChatResponse: async (messages: unknown[]) => {
      chatCalls.push(messages);
      return options.chatAnswer ?? "answer from model";
    },
  } as unknown as OllamaClient;

  return { ollamaClient, embeddedTexts, chatCalls };
};
