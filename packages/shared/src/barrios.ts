import { z } from 'zod';

// Los 48 barrios oficiales de CABA, ordenados por nombre visible. El valor es
// el del enum Barrio del schema; en pantalla siempre va el nombre.
export const BARRIOS = [
  { valor: 'AGRONOMIA', nombre: 'Agronomía' },
  { valor: 'ALMAGRO', nombre: 'Almagro' },
  { valor: 'BALVANERA', nombre: 'Balvanera' },
  { valor: 'BARRACAS', nombre: 'Barracas' },
  { valor: 'BELGRANO', nombre: 'Belgrano' },
  { valor: 'BOEDO', nombre: 'Boedo' },
  { valor: 'CABALLITO', nombre: 'Caballito' },
  { valor: 'CHACARITA', nombre: 'Chacarita' },
  { valor: 'COGHLAN', nombre: 'Coghlan' },
  { valor: 'COLEGIALES', nombre: 'Colegiales' },
  { valor: 'CONSTITUCION', nombre: 'Constitución' },
  { valor: 'FLORES', nombre: 'Flores' },
  { valor: 'FLORESTA', nombre: 'Floresta' },
  { valor: 'LA_BOCA', nombre: 'La Boca' },
  { valor: 'LA_PATERNAL', nombre: 'La Paternal' },
  { valor: 'LINIERS', nombre: 'Liniers' },
  { valor: 'MATADEROS', nombre: 'Mataderos' },
  { valor: 'MONTE_CASTRO', nombre: 'Monte Castro' },
  { valor: 'MONTSERRAT', nombre: 'Montserrat' },
  { valor: 'NUEVA_POMPEYA', nombre: 'Nueva Pompeya' },
  { valor: 'NUNEZ', nombre: 'Núñez' },
  { valor: 'PALERMO', nombre: 'Palermo' },
  { valor: 'PARQUE_AVELLANEDA', nombre: 'Parque Avellaneda' },
  { valor: 'PARQUE_CHACABUCO', nombre: 'Parque Chacabuco' },
  { valor: 'PARQUE_CHAS', nombre: 'Parque Chas' },
  { valor: 'PARQUE_PATRICIOS', nombre: 'Parque Patricios' },
  { valor: 'PUERTO_MADERO', nombre: 'Puerto Madero' },
  { valor: 'RECOLETA', nombre: 'Recoleta' },
  { valor: 'RETIRO', nombre: 'Retiro' },
  { valor: 'SAAVEDRA', nombre: 'Saavedra' },
  { valor: 'SAN_CRISTOBAL', nombre: 'San Cristóbal' },
  { valor: 'SAN_NICOLAS', nombre: 'San Nicolás' },
  { valor: 'SAN_TELMO', nombre: 'San Telmo' },
  { valor: 'VELEZ_SARSFIELD', nombre: 'Vélez Sarsfield' },
  { valor: 'VERSALLES', nombre: 'Versalles' },
  { valor: 'VILLA_CRESPO', nombre: 'Villa Crespo' },
  { valor: 'VILLA_DEL_PARQUE', nombre: 'Villa del Parque' },
  { valor: 'VILLA_DEVOTO', nombre: 'Villa Devoto' },
  { valor: 'VILLA_GRAL_MITRE', nombre: 'Villa General Mitre' },
  { valor: 'VILLA_LUGANO', nombre: 'Villa Lugano' },
  { valor: 'VILLA_LURO', nombre: 'Villa Luro' },
  { valor: 'VILLA_ORTUZAR', nombre: 'Villa Ortúzar' },
  { valor: 'VILLA_PUEYRREDON', nombre: 'Villa Pueyrredón' },
  { valor: 'VILLA_REAL', nombre: 'Villa Real' },
  { valor: 'VILLA_RIACHUELO', nombre: 'Villa Riachuelo' },
  { valor: 'VILLA_SANTA_RITA', nombre: 'Villa Santa Rita' },
  { valor: 'VILLA_SOLDATI', nombre: 'Villa Soldati' },
  { valor: 'VILLA_URQUIZA', nombre: 'Villa Urquiza' },
] as const;

export type Barrio = (typeof BARRIOS)[number]['valor'];

const VALORES = BARRIOS.map((b) => b.valor) as [Barrio, ...Barrio[]];

export const barrioSchema = z.enum(VALORES, 'Elegí un barrio');

const NOMBRES = new Map<Barrio, string>(BARRIOS.map((b) => [b.valor, b.nombre]));

export function nombreBarrio(valor: Barrio): string {
  return NOMBRES.get(valor) ?? valor;
}
