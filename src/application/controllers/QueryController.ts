import { Request, Response, NextFunction } from "express";
import { QueryService } from "../services/QueryService";

export class QueryController {
  constructor(private queryService: QueryService) {}
  public returnQuery = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const prompt = req.body.question;
    const result = await this.queryService.returnQueryResult(prompt);
    res.status(200).json({
      message: result,
    });
  };
}
