import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export function CorrelationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header('x-correlation-id');
  const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();
  (req as Request & { correlationId: string }).correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}
