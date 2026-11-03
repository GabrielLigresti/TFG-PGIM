import {
  CONVERSION,
  ETIQUETA_UNIDAD,
  type ErrorReceta,
  type TipoComponente,
  type UnidadBase,
  type UnidadMedida,
} from '@pgim/shared';

// Modelo de dominio de recetas (paquete 3 del diagrama de clases), sin Prisma.
// Composite: una línea apunta a un insumo o a un producto intermedio, y cada
// intermedio tiene su propia receta.

export interface Componente {
  id: string;
  nombre: string;
  tipo: TipoComponente;
  unidadBase: UnidadBase;
  activo: boolean;
  // Costo por unidad base: la última compra (insumo) o la última tanda
  // (intermedio con stock).
  costoCompraVigente: number | null;
  // Solo intermedios: se produce por tandas y tiene existencia propia.
  llevaStock: boolean;
  // Solo intermedios.
  receta: Receta | null;
}

export interface LineaReceta {
  componente: Componente;
  cantidad: number;
  unidad: UnidadMedida;
  porcentajeMerma: number;
}

export interface Receta {
  lineas: LineaReceta[];
  // Porciones (plato) o cantidad en unidad base (intermedio) que rinde la receta.
  rendimiento: number;
  instrucciones: string | null;
}

// Cantidad que se descuenta del stock, en unidad base: neta ÷ (1 − merma).
export function cantidadBruta(linea: LineaReceta): number {
  const neta = linea.cantidad * CONVERSION[linea.unidad].factor;
  return neta / (1 - linea.porcentajeMerma / 100);
}

// Un componente tiene stock propio si es un insumo o un intermedio que se
// produce por tandas.
export function tieneStock(componente: Componente): boolean {
  return componente.tipo === 'INSUMO' || componente.llevaStock;
}

// Insumo: su costo de compra. Intermedio: costo de su receta ÷ rendimiento.
export function costoTeorico(componente: Componente): number {
  if (componente.tipo === 'INSUMO') return componente.costoCompraVigente ?? 0;
  const { receta } = componente;
  return receta ? costoTotal(receta) / receta.rendimiento : 0;
}

// Con stock: el último costo registrado (compra o tanda), o el teórico si
// todavía no hay ninguno. Sin stock: siempre el teórico de su receta.
export function costoUnitario(componente: Componente): number {
  if (tieneStock(componente)) return componente.costoCompraVigente ?? costoTeorico(componente);
  return costoTeorico(componente);
}

export function costoLinea(linea: LineaReceta): number {
  return cantidadBruta(linea) * costoUnitario(linea.componente);
}

export function costoTotal(receta: Receta): number {
  return receta.lineas.reduce((total, linea) => total + costoLinea(linea), 0);
}

// Insumos que consume `cantidad` de la receta (porciones de un plato o
// unidades base de un intermedio), en cantidad bruta y unidad base. Se
// detiene en todo componente con stock (insumo o intermedio con stock); los
// intermedios sin stock se explotan hasta llegar a uno que lo tenga.
export function insumosNecesarios(receta: Receta, cantidad: number): Map<string, number> {
  const total = new Map<string, number>();
  const factor = cantidad / receta.rendimiento;
  for (const linea of receta.lineas) {
    const bruta = cantidadBruta(linea) * factor;
    const { componente } = linea;
    if (tieneStock(componente)) {
      total.set(componente.id, (total.get(componente.id) ?? 0) + bruta);
    } else if (componente.receta) {
      for (const [id, valor] of insumosNecesarios(componente.receta, bruta)) {
        total.set(id, (total.get(id) ?? 0) + valor);
      }
    }
  }
  return total;
}

// Camino de dependencias desde `desde` hasta el componente `id`, o null si
// `desde` no lo contiene (ni directa ni indirectamente).
export function caminoHasta(desde: Componente, id: string): Componente[] | null {
  if (desde.id === id) return [desde];
  for (const linea of desde.receta?.lineas ?? []) {
    const resto = caminoHasta(linea.componente, id);
    if (resto) return [desde, ...resto];
  }
  return null;
}

export function contiene(desde: Componente, id: string): boolean {
  return caminoHasta(desde, id) !== null;
}

export class RecetaInvalidaError extends Error {
  constructor(readonly errores: ErrorReceta[]) {
    super('La receta tiene errores');
    this.name = 'RecetaInvalidaError';
  }
}

// Builder del CU-07: junta las líneas, valida cada una y construye la receta
// solo si todo es válido. Los errores se acumulan para marcarlos en la pantalla.
export class RecetaBuilder {
  private readonly lineas: LineaReceta[] = [];
  private readonly errores: ErrorReceta[] = [];
  private indice = 0;
  private rendimiento: number | null = null;
  private instrucciones: string | null = null;

  private constructor(private readonly intermedio: Componente | null) {}

  static paraItem(): RecetaBuilder {
    return new RecetaBuilder(null);
  }

  static paraIntermedio(intermedio: Componente): RecetaBuilder {
    return new RecetaBuilder(intermedio);
  }

  agregarLinea(
    componente: Componente,
    cantidad: number,
    unidad: UnidadMedida,
    porcentajeMerma: number,
  ): this {
    const linea = this.indice++;
    const error = this.validarLinea(componente, cantidad, unidad, porcentajeMerma);
    if (error) this.errores.push({ linea, mensaje: error });
    else this.lineas.push({ componente, cantidad, unidad, porcentajeMerma });
    return this;
  }

  conRendimiento(valor: number): this {
    this.rendimiento = valor;
    return this;
  }

  conInstrucciones(texto: string | null | undefined): this {
    this.instrucciones = texto?.trim() || null;
    return this;
  }

  build(): Receta {
    // E3: sin líneas o con un rendimiento no válido.
    if (this.indice === 0) {
      this.errores.push({ linea: null, mensaje: 'La receta necesita al menos una línea' });
    }
    if (this.rendimiento === null || !(this.rendimiento > 0)) {
      this.errores.push({ linea: null, mensaje: 'El rendimiento tiene que ser mayor a 0' });
    }
    if (this.errores.length > 0) throw new RecetaInvalidaError(this.errores);
    return {
      lineas: this.lineas,
      rendimiento: this.rendimiento!,
      instrucciones: this.instrucciones,
    };
  }

  private validarLinea(
    componente: Componente,
    cantidad: number,
    unidad: UnidadMedida,
    porcentajeMerma: number,
  ): string | null {
    if (!componente.activo) return `${componente.nombre} está dado de baja`;
    if (this.lineas.some((l) => l.componente.id === componente.id)) {
      return `${componente.nombre} ya está en la receta`;
    }
    if (!(cantidad > 0)) return 'La cantidad tiene que ser mayor a 0';
    if (!(porcentajeMerma >= 0 && porcentajeMerma < 100)) {
      return 'La merma tiene que estar entre 0 y menos de 100 %';
    }
    // E1: unidad de otra dimensión.
    if (CONVERSION[unidad].base !== componente.unidadBase) {
      return `${componente.nombre} se mide en ${ETIQUETA_UNIDAD[componente.unidadBase]}: no se puede cargar en ${ETIQUETA_UNIDAD[unidad]}`;
    }
    // E2: ciclo entre intermedios.
    if (this.intermedio) {
      if (componente.id === this.intermedio.id) {
        return `${componente.nombre} no puede ser parte de su propia receta`;
      }
      const camino = caminoHasta(componente, this.intermedio.id);
      if (camino) {
        const cadena = [this.intermedio, ...camino].map((c) => c.nombre).join(' → ');
        return `Generaría un ciclo: ${cadena}`;
      }
    }
    return null;
  }
}
