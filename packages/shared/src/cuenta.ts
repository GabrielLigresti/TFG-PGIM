import { z } from 'zod';
import { passwordSchema } from './auth';
import { nombreSchema } from './comun';

// CU-20: cada usuario gestiona su propia cuenta. Un teléfono vacío se guarda
// como null, no como cadena vacía.
// Estrictos: un body con campos del otro tipo de usuario o de más no pasa.
export const cuentaComensalSchema = z
  .object({
    nombre: nombreSchema,
    telefono: z
      .string()
      .trim()
      .max(30)
      .transform((v) => v || null)
      .nullable(),
  })
  .strict();

export const cuentaEmpleadoSchema = z.object({ nombreCompleto: nombreSchema }).strict();

export const cambiarContrasenaSchema = z
  .object({ actual: z.string().min(1, 'Ingresá tu contraseña actual'), nueva: passwordSchema })
  .refine((d) => d.actual !== d.nueva, {
    message: 'La contraseña nueva tiene que ser distinta de la actual',
    path: ['nueva'],
  });

export type CuentaComensalInput = z.infer<typeof cuentaComensalSchema>;
export type CuentaEmpleadoInput = z.infer<typeof cuentaEmpleadoSchema>;
export type CambiarContrasenaInput = z.infer<typeof cambiarContrasenaSchema>;

export type CuentaUsuario =
  | {
      tipo: 'COMENSAL';
      email: string;
      nombre: string;
      telefono: string | null;
      tieneContrasena: boolean;
    }
  | {
      tipo: 'EMPLEADO';
      email: string;
      nombreCompleto: string;
      fotoUrl: string | null;
      rol: string;
      sucursales: string[];
    };
