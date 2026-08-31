import type { NextFunction, Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { AppToken } from "../../ioc/AppToken";
import { QueryService } from "../services/QueryService";
import { ValidationError } from "../errors/ValidationError";

@injectable()
export class QueryController {
  constructor(
    @inject(AppToken.QueryService) private readonly queryService: QueryService,
  ) {}

  public returnQuery = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const prompt: unknown = req.body?.question;

      if (typeof prompt !== "string" || prompt.trim() === "") {
        throw new ValidationError(
          "Field 'question' must be a non-empty string.",
        );
      }

      const result = await this.queryService.returnQueryResult(prompt.trim());
      res.status(200).json({
        message: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
