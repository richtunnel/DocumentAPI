import {z} from "zod";

export const QueueMessageSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['webhook', 'email', 'sms']),
  payload: z.record(z.any()),
  priority: z.number().int().min(1).max(10).default(5),
  retry_count: z.number().int().default(0),
  max_retries: z.number().int().default(3),
  created_at: z.string().datetime(),
  scheduled_for: z.string().datetime().optional(),
});

export type QueueMessage = z.infer<typeof QueueMessageSchema>;

// Rate Limit Response
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: Date;
  limit: number;
  windowType: 'minute' | 'hour' | 'day' | 'burst';
}

