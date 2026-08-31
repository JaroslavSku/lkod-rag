import { Request, Response, NextFunction } from "express";
import { CreateContextService } from "../services/CreateContextService";

export class CreateContextController {
  constructor(private queryService: CreateContextService) {}
  public createContext = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    await this.queryService.saveToDb();
    await this.queryService.backfillEmbeddings();
    res.status(200).json({ message: "ok" });
  };
}
