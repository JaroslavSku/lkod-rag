import pino from "pino";
import type { Logger } from "pino";
import type { IAppConfig } from "../config/AppConfig";

export type ILogger = Logger;

export const createLogger = (config: IAppConfig): ILogger =>
  pino({
    name: config.appName,
    level: config.logLevel,
    ...(config.nodeEnv === "development"
      ? {
          transport: {
            target: "pino-pretty",
            options: { translateTime: "HH:MM:ss" },
          },
        }
      : {}),
  });
