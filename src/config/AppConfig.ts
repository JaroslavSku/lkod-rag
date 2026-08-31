export interface IAppConfig {
  readonly appName: string;
  readonly nodeEnv: string;
  readonly logLevel: string;
  readonly port: number;
  readonly shutdownTimeoutMs: number;
  readonly databaseUrl: string;
  readonly postgresPoolMaxConnections: number;
  readonly postgresIdleTimeoutMs: number;
  readonly postgresConnectionTimeoutMs: number;
  readonly ollamaBaseUrl: string;
  readonly chatModel: string;
  readonly embeddingModel: string;
  readonly embeddingDimensions: number;
  readonly contextFile: string;
  readonly retrievalLimit: number;
  readonly rrfK: number;
}

const REQUIRED_VARIABLES = [
  "DATABASE_URL",
  "OLLAMA_BASE_URL",
  "CHAT_MODEL",
  "EMBEDDING_MODEL",
  "CHATBOT_CONTEXT_FILE",
] as const;

const readNumber = (
  rawValue: string | undefined,
  fallback: number,
  variableName: string,
): number => {
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    throw new Error(
      `Environment variable ${variableName} must be a number, received "${rawValue}".`,
    );
  }

  return parsedValue;
};

export const loadAppConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): IAppConfig => {
  const missingVariables = REQUIRED_VARIABLES.filter(
    (variableName) => !environment[variableName]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVariables.join(", ")}.`,
    );
  }

  return {
    appName: environment.APP_NAME ?? "lkod-rag",
    nodeEnv: environment.NODE_ENV ?? "development",
    logLevel: environment.LOG_LEVEL ?? "info",
    port: readNumber(environment.PORT, 3012, "PORT"),
    shutdownTimeoutMs: readNumber(
      environment.SHUTDOWN_TIMEOUT_MS,
      10_000,
      "SHUTDOWN_TIMEOUT_MS",
    ),
    databaseUrl: environment.DATABASE_URL as string,
    postgresPoolMaxConnections: readNumber(
      environment.POSTGRES_POOL_MAX_CONNECTIONS,
      10,
      "POSTGRES_POOL_MAX_CONNECTIONS",
    ),
    postgresIdleTimeoutMs: readNumber(
      environment.POSTGRES_POOL_IDLE_TIMEOUT_MS,
      50_000,
      "POSTGRES_POOL_IDLE_TIMEOUT_MS",
    ),
    postgresConnectionTimeoutMs: readNumber(
      environment.POSTGRES_CONNECTION_TIMEOUT_MS,
      3_000,
      "POSTGRES_CONNECTION_TIMEOUT_MS",
    ),
    ollamaBaseUrl: environment.OLLAMA_BASE_URL as string,
    chatModel: environment.CHAT_MODEL as string,
    embeddingModel: environment.EMBEDDING_MODEL as string,
    embeddingDimensions: readNumber(
      environment.EMBEDDING_DIMENSIONS,
      1024,
      "EMBEDDING_DIMENSIONS",
    ),
    contextFile: environment.CHATBOT_CONTEXT_FILE as string,
    retrievalLimit: readNumber(
      environment.RETRIEVAL_LIMIT,
      5,
      "RETRIEVAL_LIMIT",
    ),
    rrfK: readNumber(environment.RRF_K, 60, "RRF_K"),
  };
};
