import http from "node:http";
import express from "express";
import type { Express, NextFunction, Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import type { IAppConfig } from "../config/AppConfig";
import { PostgresConnector } from "../data-access/PostgresConnector";
import { AppToken } from "../ioc/AppToken";
import type { ILogger } from "../utils/Logger";
import { RagRouter } from "./routers/RagRouter";
import { StatusRouter } from "./routers/StatusRouter";

@injectable()
export class App {
  private readonly express: Express;
  private readonly server: http.Server;
  private isRunning = false;
  private isConfigured = false;

  constructor(
    @inject(AppToken.AppConfig) private readonly config: IAppConfig,
    @inject(AppToken.Logger) private readonly logger: ILogger,
    @inject(AppToken.PostgresConnector)
    private readonly databaseConnector: PostgresConnector,
    @inject(AppToken.StatusRouter) private readonly statusRouter: StatusRouter,
    @inject(AppToken.Router) private readonly ragRouter: RagRouter,
  ) {
    this.express = express();
    this.server = http.createServer(this.express);
  }

  public getExpress(): Express {
    this.configure();
    return this.express;
  }

  public configure(): void {
    if (this.isConfigured) {
      return;
    }

    this.express.disable("x-powered-by");
    this.middleware();
    this.routes();
    this.isConfigured = true;
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.configure();

    await this.databaseConnector.connect();
    this.logger.info("Database connected.");

    this.server.listen(this.config.port);
    this.server.on("error", this.onError);
    this.server.on("listening", this.onListening);
    this.isRunning = true;
  }

  public async gracefulShutdown(): Promise<void> {
    this.logger.info("Graceful shutdown initiated.");

    if (this.server.listening) {
      this.server.closeIdleConnections();
      await new Promise<void>((resolve) => {
        const forceTimer = setTimeout(() => {
          this.logger.warn(
            `Server did not close within ${this.config.shutdownTimeoutMs} ms, forcing.`,
          );
          this.server.closeAllConnections();
          resolve();
        }, this.config.shutdownTimeoutMs);

        this.server.close(() => {
          clearTimeout(forceTimer);
          this.logger.info("Server stopped.");
          resolve();
        });
      });
    }

    await this.databaseConnector.disconnect();
    this.logger.info("Database disconnected.");
    this.isRunning = false;
  }

  private middleware(): void {
    this.express.use(this.requestLogger);
    this.express.use(express.json({ limit: "1mb" }));
    this.securityHeaders();
  }

  private requestLogger = (
    request: Request,
    response: Response,
    next: NextFunction,
  ): void => {
    const startedAt = process.hrtime.bigint();

    response.on("finish", () => {
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const logPayload = {
        method: request.method,
        url: request.originalUrl,
        status: response.statusCode,
        durationMs: Math.round(durationMs),
      };

      if (response.statusCode >= 500) {
        this.logger.error(logPayload, "Request failed.");
        return;
      }
      if (response.statusCode >= 400) {
        this.logger.warn(logPayload, "Request rejected.");
        return;
      }
      this.logger.info(logPayload, "Request handled.");
    });

    next();
  };

  private securityHeaders(): void {
    this.express.use(
      (_request: Request, response: Response, next: NextFunction) => {
        response.setHeader("Referrer-Policy", "no-referrer-when-downgrade");
        response.setHeader(
          "Strict-Transport-Security",
          "max-age=31536000; includeSubDomains;",
        );
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Permitted-Cross-Domain-Policies", "none");
        response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader(
          "Permissions-Policy",
          "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
        );
        next();
      },
    );
  }

  private routes(): void {
    this.express.use(this.statusRouter.router);
    this.express.use(this.ragRouter.router);
    this.notFoundHandler();
    this.errorHandler();
  }

  private notFoundHandler(): void {
    this.express.use((request: Request, response: Response) => {
      this.logger.warn(
        `Non existing route: ( ${request.method} ) ${request.originalUrl}`,
      );
      response.status(404).json({ error: "route_not_found" });
    });
  }

  private errorHandler(): void {
    this.express.use(
      (
        error: Error & { status?: number },
        _request: Request,
        response: Response,
        _next: NextFunction,
      ) => {
        const status = error.status ?? 500;

        if (status >= 400 && status <= 499) {
          response.status(status).json({ error: error.message });
          return;
        }

        this.logger.error(
          { stack: error.stack },
          error.message ?? "Unknown error",
        );
        response.status(500).json({ error: "server_error" });
      },
    );
  }

  private onError = (error: NodeJS.ErrnoException): void => {
    if (error.code === "EACCES") {
      this.logger.error(
        `Port ${this.config.port} requires elevated privileges.`,
      );
      process.exit(1);
    }
    if (error.code === "EADDRINUSE") {
      this.logger.error(`Port ${this.config.port} is already in use.`);
      process.exit(1);
    }
    throw error;
  };

  private onListening = (): void => {
    this.logger.info(`Listening on port ${this.config.port}.`);
  };
}
