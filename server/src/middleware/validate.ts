/**
 * Task F8: runs the zod schemas of the endpoint table (K1) on the body, query and path parameters. A failure becomes
 * VALIDATION_ERROR listing the failing fields (the error handler turns a ZodError into it). The parsed values, with
 * transforms applied (a phone number with its spaces removed), are put on `req.valid`; handlers read them from there.
 */
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import './types';

export interface ValidateSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export function validate(schemas: ValidateSchemas): RequestHandler {
  return (req, _res, next) => {
    req.valid = {
      body: schemas.body ? schemas.body.parse(req.body ?? {}) : undefined,
      query: schemas.query ? schemas.query.parse(req.query) : undefined,
      params: schemas.params ? schemas.params.parse(req.params) : undefined,
    };
    next();
  };
}
