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
  // Mercado Pago (Checkout Pro). Si falta alguna de las tres se usa el pago de
  // prueba. PUBLIC_URL es la URL del túnel: cambia en cada arranque.
  MP_ACCESS_TOKEN: z.string().min(1).optional(),
  MP_WEBHOOK_SECRET: z.string().min(1).optional(),
  PUBLIC_URL: z.url().optional(),
});

export const env = envSchema.parse(process.env);
