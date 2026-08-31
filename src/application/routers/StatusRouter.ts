import { Router } from "express";
import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import type { IAppConfig } from "../../config/AppConfig";
import { PostgresConnector } from "../../data-access/PostgresConnector";
import { AppToken } from "../../ioc/AppToken";

@injectable()
export class StatusRouter {
  public readonly router: Router;

  constructor(
    @inject(AppToken.PostgresConnector)
    private readonly dbClient: PostgresConnector,
    @inject(AppToken.AppConfig) private readonly config: IAppConfig,
  ) {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    this.router.get("/status", this.getLiveness);
    this.router.get("/status/readiness", this.getReadiness);
  }

  private getLiveness = (_request: Request, response: Response): void => {
    response.status(200).json({
      appName: this.config.appName,
      status: "Up",
    });
  };

  private getReadiness = async (
    _request: Request,
    response: Response,
  ): Promise<void> => {
    try {
      const client = await this.dbClient.getConnection();
      await client.query("SELECT 1");
      response.status(200).json({ status: "Ready", database: "Up" });
    } catch {
      response.status(503).json({ status: "NotReady", database: "Down" });
    }
  };
}
