import type { NextFunction, Request, Response } from "express";
import type { z, ZodTypeAny } from "zod";

type RequestSchemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

export function validate(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (schemas.body) req.body = schemas.body.parse(req.body) as z.infer<typeof schemas.body>;
    if (schemas.params) req.params = schemas.params.parse(req.params) as z.infer<typeof schemas.params>;
    if (schemas.query) req.query = schemas.query.parse(req.query) as z.infer<typeof schemas.query>;
    next();
  };
}
