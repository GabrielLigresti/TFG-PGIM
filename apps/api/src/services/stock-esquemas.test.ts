import {
  movimientoInputSchema,
  tandaInputSchema,
  MOTIVOS_MERMA,
  TIPOS_MOVIMIENTO,
  ETIQUETA_MOTIVO_MERMA,
  ETIQUETA_TIPO_MOVIMIENTO,
} from '@pgim/shared';

const id = '6f1c1b5e-1c1e-4d0e-9a53-0d6a3d5f2a10';

describe('esquemas de stock', () => {
  it('rechaza una merma sin motivo', () => {
    const r = movimientoInputSchema.safeParse({
      tipo: 'MERMA',
      componenteId: id,
      cantidad: 2,
      unidad: 'KILOGRAMO',
    });
    expect(r.success).toBe(false);
  });

  it('acepta una merma con motivo', () => {
    const r = movimientoInputSchema.safeParse({
      tipo: 'MERMA',
      componenteId: id,
      cantidad: 2,
      unidad: 'KILOGRAMO',
      motivoMerma: 'VENCIMIENTO',
    });
    expect(r.success).toBe(true);
  });

  it('acepta un ajuste contando cero', () => {
    const r = movimientoInputSchema.safeParse({
      tipo: 'AJUSTE',
      componenteId: id,
      cantidadContada: 0,
      unidad: 'GRAMO',
      motivo: 'Conteo mensual',
    });
    expect(r.success).toBe(true);
  });

  it('rechaza un ingreso con costo negativo', () => {
    const r = movimientoInputSchema.safeParse({
      tipo: 'INGRESO',
      componenteId: id,
      cantidad: 1,
      unidad: 'KILOGRAMO',
      costoUnitario: -1,
    });
    expect(r.success).toBe(false);
  });

  it('rechaza una tanda sin consumos', () => {
    const r = tandaInputSchema.safeParse({
      intermedioId: id,
      cantidadPlaneada: 10,
      unidad: 'LITRO',
      cantidadObtenida: 9,
      consumos: [],
    });
    expect(r.success).toBe(false);
  });

  it('tiene una etiqueta para cada motivo y tipo', () => {
    for (const m of MOTIVOS_MERMA) expect(ETIQUETA_MOTIVO_MERMA[m]).toBeTruthy();
    for (const t of TIPOS_MOVIMIENTO) expect(ETIQUETA_TIPO_MOVIMIENTO[t]).toBeTruthy();
  });
});
