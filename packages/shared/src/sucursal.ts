import { z } from 'zod';
import { horaSchema, minutosFin, minutosInicio, nombreSchema, type Referencia } from './comun';

export const FRANJAS = ['ALMUERZO', 'CENA'] as const;
export type Franja = (typeof FRANJAS)[number];

export const horarioServicioSchema = z
  .object({
    franja: z.enum(FRANJAS),
    horaInicio: horaSchema,
    horaFin: horaSchema,
  })
  .refine((h) => minutosInicio(h.horaInicio) < minutosFin(h.horaFin), {
    message: 'El horario de servicio tiene que terminar después de empezar',
    path: ['horaFin'],
  });

export type HorarioServicio = z.infer<typeof horarioServicioSchema>;

const camposSucursal = {
  nombre: nombreSchema,
  direccion: z.string().trim().min(1, 'Ingresá la dirección').max(200),
  horarioApertura: horaSchema,
  horarioCierre: horaSchema,
  toleranciaNoShowMin: z.number().int().min(0).max(240),
  horariosServicio: z.array(horarioServicioSchema).max(FRANJAS.length),
};

type CamposHorario = Pick<
  z.infer<z.ZodObject<typeof camposSucursal>>,
  'horarioApertura' | 'horarioCierre' | 'horariosServicio'
>;

// Reglas cruzadas de horarios; las comparten el ABM y el registro (CU-11).
function conReglasDeHorario<S extends z.ZodType<CamposHorario>>(esquema: S) {
  return esquema
    .refine((s) => minutosInicio(s.horarioApertura) < minutosFin(s.horarioCierre), {
      message: 'El cierre tiene que ser posterior a la apertura',
      path: ['horarioCierre'],
    })
    .refine(
      (s) => new Set(s.horariosServicio.map((h) => h.franja)).size === s.horariosServicio.length,
      {
        message: 'Cada franja se carga una sola vez',
        path: ['horariosServicio'],
      },
    )
    .refine(
      (s) =>
        s.horariosServicio.every(
          (h) =>
            minutosInicio(h.horaInicio) >= minutosInicio(s.horarioApertura) &&
            minutosFin(h.horaFin) <= minutosFin(s.horarioCierre),
        ),
      {
        message: 'Los horarios de servicio tienen que estar dentro del horario de la sucursal',
        path: ['horariosServicio'],
      },
    );
}

// CU-13.
export const sucursalInputSchema = conReglasDeHorario(
  z.object({
    ...camposSucursal,
    menuActivoId: z.uuid().nullish(),
    activa: z.boolean().optional(),
  }),
);

// CU-11: la sucursal inicial no tiene menú activo todavía.
export const sucursalRegistroSchema = conReglasDeHorario(z.object(camposSucursal));

export type SucursalInput = z.infer<typeof sucursalInputSchema>;

export interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  horarioApertura: string;
  horarioCierre: string;
  toleranciaNoShowMin: number;
  activa: boolean;
  horariosServicio: HorarioServicio[];
  menuActivo: Referencia | null;
}
