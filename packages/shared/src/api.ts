import { z } from 'zod';

export const API_PREFIX = '/api';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
