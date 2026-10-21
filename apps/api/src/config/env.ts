import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Firma los tokens de sesión; en desarrollo alcanza con cualquier cadena larga.
  JWT_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
