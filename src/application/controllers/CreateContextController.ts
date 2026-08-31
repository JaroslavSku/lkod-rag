import type { NextFunction, Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { AppToken } from "../../ioc/AppToken";
import { CreateContextService } from "../services/CreateContextService";

@injectable()
export class CreateContextController {
  constructor(
    @inject(AppToken.CreateContextService)
    private readonly createContextService: CreateContextService,
  ) {}

  public createContext = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.createContextService.saveToDb();
      await this.createContextService.backfillEmbeddings();
      res.status(200).json({ message: "ok" });
    } catch (error) {
      next(error);
    }
  };
}
