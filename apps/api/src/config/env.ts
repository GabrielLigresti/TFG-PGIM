import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  // Firma los tokens de sesión; en desarrollo alcanza con cualquier cadena larga.
  JWT_SECRET: z.string().min(32),
  // Carpeta de los archivos subidos (modelos RA), relativa a donde corre la API.
  UPLOADS_DIR: z.string().default('uploads'),
  // Habilita el pago de prueba aunque la API corra en producción (demo).
  PAGO_SIMULADO: z.stringbool().default(false),
});

export const env = envSchema.parse(process.env);
