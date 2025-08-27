import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validationMiddleware<T>(
  schema: ZodSchema<T>, 
  target: 'body' | 'query' | 'params' = 'body'
) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = target === 'body' ? req.body : 
                  target === 'query' ? req.query : req.params;
      
      const validatedData = schema.parse(data);
      
      if (target === 'body') {
        req.body = validatedData;
      } else if (target === 'query') {
        req.query = validatedData as any;
      } else {
        req.params = validatedData as any;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: error.issues.map(issue => ({
            field: issue.path.join('.'),
            message: issue.message,
            value: issue.code
          }))
        });
      }

      next(error);
    }
  };
}
