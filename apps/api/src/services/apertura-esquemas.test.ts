import {
  configuracionAperturaSchema,
  registroRestauranteSchema,
  sucursalInputSchema,
  METODOS_PRONOSTICO,
  ETIQUETA_METODO_PRONOSTICO,
  CONFIGURACION_APERTURA_POR_DEFECTO,
} from '@pgim/shared';

const sucursal = {
  nombre: 'Centro',
  direccion: 'Calle 123',
  horarioApertura: '11:00',
  horarioCierre: '23:30',
  toleranciaNoShowMin: 15,
  horariosServicio: [{ franja: 'CENA', horaInicio: '20:00', horaFin: '23:00' }],
};
const registro = {
  restaurante: { nombre: 'Resto', cuit: '30-12345678-9' },
  sucursal,
  administrador: { nombreCompleto: 'Ana Pérez', email: ' ANA@Demo.test ', password: 'clave1234' },
};

describe('esquemas de apertura', () => {
  it('la configuración por defecto es válida', () => {
    expect(configuracionAperturaSchema.safeParse(CONFIGURACION_APERTURA_POR_DEFECTO).success).toBe(
      true,
    );
  });

  it('rechaza semanas fuera de 5-52 y coeficientes no positivos o enormes', () => {
    const base = { ...CONFIGURACION_APERTURA_POR_DEFECTO };
    expect(
      configuracionAperturaSchema.safeParse({ ...base, semanasHistoricoMinimo: 4 }).success,
    ).toBe(false);
    expect(
      configuracionAperturaSchema.safeParse({ ...base, semanasHistoricoMinimo: 53 }).success,
    ).toBe(false);
    expect(
      configuracionAperturaSchema.safeParse({ ...base, semanasHistoricoMinimo: 6.5 }).success,
    ).toBe(false);
    expect(configuracionAperturaSchema.safeParse({ ...base, cubiertosPorMozo: 0 }).success).toBe(
      false,
    );
    expect(
      configuracionAperturaSchema.safeParse({ ...base, platosPorCocineroHora: 1000 }).success,
    ).toBe(false);
    expect(configuracionAperturaSchema.safeParse({ ...base, cubiertosPorMozo: 2.5 }).success).toBe(
      true,
    );
  });

  it('cada método tiene su etiqueta', () => {
    for (const m of METODOS_PRONOSTICO) expect(ETIQUETA_METODO_PRONOSTICO[m]).toBeTruthy();
  });

  it('normaliza el CUIT y el email del registro', () => {
    const r = registroRestauranteSchema.parse(registro);
    expect(r.restaurante.cuit).toBe('30123456789');
    expect(r.administrador.email).toBe('ana@demo.test');
  });

  it('rechaza un CUIT con menos de 11 dígitos', () => {
    const r = registroRestauranteSchema.safeParse({
      ...registro,
      restaurante: { nombre: 'Resto', cuit: '30-1234-9' },
    });
    expect(r.success).toBe(false);
  });

  it('rechaza una contraseña corta', () => {
    const r = registroRestauranteSchema.safeParse({
      ...registro,
      administrador: { ...registro.administrador, password: 'corta' },
    });
    expect(r.success).toBe(false);
  });

  it('aplica las reglas de horario de la sucursal', () => {
    const r = registroRestauranteSchema.safeParse({
      ...registro,
      sucursal: { ...sucursal, horarioCierre: '10:00' },
    });
    expect(r.success).toBe(false);
  });

  it('el ABM de sucursal sigue aceptando menuActivoId', () => {
    expect(sucursalInputSchema.safeParse({ ...sucursal, menuActivoId: null }).success).toBe(true);
  });
});
