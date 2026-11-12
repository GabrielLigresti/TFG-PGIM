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
  // Ingreso con Google del comensal. Si falta, el botón no se muestra y la ruta
  // responde 503.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  // Escaneo de platos: qué proveedor genera el modelo 3D y cada cuánto la tarea
  // de fondo consulta los escaneos en curso. El simulado es para la demo.
  PROVEEDOR_3D: z.string().min(1).default('simulado'),
  SIMULADO_DEMORA_MS: z.coerce.number().int().min(0).default(20000),
  SIMULADO_FALLA: z.stringbool().default(false),
  ESCANEO_INTERVALO_MS: z.coerce.number().int().positive().default(10000),
  // Pasado este tiempo un escaneo sin resultado se da por fallido.
  ESCANEO_TIMEOUT_MIN: z.coerce.number().int().positive().default(30),
});

export const env = envSchema.parse(process.env);
