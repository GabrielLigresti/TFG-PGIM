import { crearBusEventos, type EventoDominio } from '../domain/eventos';
import type { PasarelaPago } from '../pagos/pasarela';
import type { FilaBeneficio } from '../repositories/fidelizacion.repository';
import type { PagoRepository, ResolucionPago } from '../repositories/pago.repository';
import type { BeneficiosComensalRepository } from './beneficios-comensal.service';
import { createPagoService } from './pago.service';

const AHORA = new Date('2026-11-10T12:00:00Z');
const INPUT = { beneficioId: null };
const CREADO_EN = new Date('2026-11-10T11:58:00Z');

const resolucion = (d: Partial<ResolucionPago> = {}): ResolucionPago => ({
  estado: 'APROBADO',
  pagoId: 'p1',
  cuentaMesaId: 'cm',
  sucursalId: 's',
  restauranteId: 'r',
  comensalId: 'c',
  monto: 18000,
  puntosSumados: 180,
  puntosCanjeados: 0,
  ...d,
});

const recompensa = (d: Partial<FilaBeneficio>): FilaBeneficio => ({
  id: 'b',
  nombre: 'Recompensa',
  clase: 'RECOMPENSA',
  criterioTipo: 'MONTO',
  criterioValor: 20000,
  tipoDescuento: 'PORCENTAJE',
  valor: 10,
  vigenciaDesde: new Date('2026-11-01T00:00:00Z'),
  vigenciaHasta: new Date('2026-11-30T00:00:00Z'),
  stockInicial: null,
  stockDisponible: null,
  activo: true,
  grupo: null,
  menu: null,
  pagosEnCurso: 0,
  ...d,
});

function armar(pasarela: Partial<PasarelaPago> = {}) {
  const repo: jest.Mocked<PagoRepository> = {
    crearPendiente: jest.fn().mockResolvedValue({
      resultado: 'CREADO',
      pagoId: 'p1',
      monto: 18000,
      sucursalId: 's',
      mesaNumero: 4,
      restaurante: 'La Parrilla',
      creadoEn: CREADO_EN,
    }),
    resolver: jest.fn().mockResolvedValue(resolucion()),
    pendientesVencidos: jest.fn().mockResolvedValue([]),
    estadoDelComensal: jest.fn().mockResolvedValue(null),
    buscar: jest.fn().mockResolvedValue(null),
    pendienteDelComensal: jest.fn().mockResolvedValue(null),
  };
  const pasarelaFalsa: jest.Mocked<PasarelaPago> = {
    habilitada: true,
    iniciarCobro: jest.fn().mockResolvedValue({ tipo: 'REDIRECCION', urlPago: 'https://mp/pagar' }),
    consultarPago: jest.fn().mockResolvedValue({ estado: 'SIN_APROBAR' }),
    ...pasarela,
  } as jest.Mocked<PasarelaPago>;
  const beneficios: jest.Mocked<BeneficiosComensalRepository> = {
    contextoMesa: jest.fn(),
    beneficiosActivos: jest.fn().mockResolvedValue([]),
    elegibilidad: jest.fn().mockResolvedValue({ puntos: 0, porBeneficio: new Map() }),
    cuentasDelComensal: jest.fn(),
  };
  const bus = crearBusEventos();
  const eventos: EventoDominio[] = [];
  bus.suscribir((e) => eventos.push(e));
  const servicio = createPagoService(repo, pasarelaFalsa, bus, beneficios, () => AHORA);
  return { repo, pasarela: pasarelaFalsa, beneficios, eventos, servicio };
}

describe('pagoService.pagar', () => {
  it('crea el pago y devuelve la URL de Mercado Pago', async () => {
    const { servicio, pasarela } = armar();
    expect(await servicio.pagar('c', 'cm', INPUT)).toEqual({
      pagoId: 'p1',
      urlPago: 'https://mp/pagar',
    });
    // La preferencia vence a los 15 minutos de creado el pago, no de llamar a Mercado Pago.
    expect(pasarela.iniciarCobro).toHaveBeenCalledWith({
      id: 'p1',
      monto: 18000,
      descripcion: 'Mesa 4 — La Parrilla',
      venceEn: new Date('2026-11-10T12:13:00Z'),
    });
    expect(servicio.urlDePago('p1')).toBe('https://mp/pagar');
  });

  it('un pago de $0 se aprueba sin pasar por la pasarela', async () => {
    const { servicio, repo, pasarela } = armar();
    repo.crearPendiente.mockResolvedValue({
      resultado: 'CREADO',
      pagoId: 'p1',
      monto: 0,
      sucursalId: 's',
      mesaNumero: 4,
      restaurante: 'La Parrilla',
      creadoEn: CREADO_EN,
    });
    expect(await servicio.pagar('c', 'cm', INPUT)).toEqual({ pagoId: 'p1', urlPago: null });
    expect(pasarela.iniciarCobro).not.toHaveBeenCalled();
    expect(repo.resolver).toHaveBeenCalledWith('p1', {
      estado: 'APROBADO',
      referenciaExterna: 'SIN-COBRO-p1',
    });
  });

  it('con la pasarela simulada se aprueba al instante', async () => {
    const { servicio, repo } = armar({
      iniciarCobro: jest.fn().mockResolvedValue({
        tipo: 'APROBADO_AL_INSTANTE',
        referenciaExterna: 'SIM-p1',
        metodo: 'TARJETA',
      }),
    });
    expect(await servicio.pagar('c', 'cm', INPUT)).toEqual({ pagoId: 'p1', urlPago: null });
    expect(repo.resolver).toHaveBeenCalledWith('p1', {
      estado: 'APROBADO',
      referenciaExterna: 'SIM-p1',
      metodo: 'TARJETA',
    });
  });

  it('si no se puede iniciar el cobro, rechaza el pago y responde 502', async () => {
    const { servicio, repo } = armar({
      iniciarCobro: jest.fn().mockRejectedValue(new Error('Mercado Pago respondió 500')),
    });
    await expect(servicio.pagar('c', 'cm', INPUT)).rejects.toMatchObject({
      status: 502,
      message: 'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.',
    });
    expect(repo.resolver).toHaveBeenCalledWith('p1', { estado: 'RECHAZADO' });
  });

  it.each([
    [{ resultado: 'EN_CURSO', pagoId: 'p0' }, 409, 'Ya tenés un pago en curso'],
    [{ resultado: 'BENEFICIO_AGOTADO' }, 409, 'El beneficio se agotó'],
    [
      { resultado: 'BENEFICIO_NO_DISPONIBLE' },
      409,
      'Ese beneficio ya no está disponible para esta mesa',
    ],
    [{ resultado: 'SIN_SALDO' }, 409, 'La mesa no tiene saldo para pagar'],
    [{ resultado: 'CERRADA' }, 409, 'La mesa ya está cerrada'],
  ])('%o responde %i', async (resultado, status, mensaje) => {
    const { servicio, repo } = armar();
    repo.crearPendiente.mockResolvedValue(resultado as never);
    await expect(servicio.pagar('c', 'cm', INPUT)).rejects.toMatchObject({
      status,
      message: expect.stringContaining(mensaje),
    });
  });

  it('el pago en curso viaja en los detalles del 409', async () => {
    const { servicio, repo } = armar();
    repo.crearPendiente.mockResolvedValue({ resultado: 'EN_CURSO', pagoId: 'p0' });
    await expect(servicio.pagar('c', 'cm', INPUT)).rejects.toMatchObject({
      detalles: { pagoId: 'p0' },
    });
  });

  it('con la pasarela deshabilitada responde 503', async () => {
    const { servicio, repo } = armar({ habilitada: false });
    await expect(servicio.pagar('c', 'cm', INPUT)).rejects.toMatchObject({ status: 503 });
    expect(repo.crearPendiente).not.toHaveBeenCalled();
  });
});

describe('pagoService.resolver', () => {
  it('al aprobar publica PAGO_APROBADO con los puntos y lo que desbloqueó', async () => {
    const { servicio, beneficios, eventos } = armar();
    beneficios.beneficiosActivos.mockResolvedValue([
      recompensa({ id: 'monto', nombre: 'Gastá $20.000' }),
      recompensa({ id: 'lejos', nombre: 'Gastá $50.000', criterioValor: 50000 }),
      recompensa({ id: 'ya', nombre: 'Gastá $5.000', criterioValor: 5000 }),
    ]);
    beneficios.elegibilidad.mockResolvedValue({
      puntos: 180,
      porBeneficio: new Map(
        ['monto', 'lejos', 'ya'].map((id) => [
          id,
          {
            datos: { visitas: 0, montoGastado: 25000, puntos: 180, tienePagosAprobados: true },
            canjeadoEnEdicion: false,
          },
        ]),
      ),
    });

    await servicio.resolver('p1', { estado: 'APROBADO', referenciaExterna: 'MP-1' });
    // Antes del pago llevaba $7.000: cruzó los $20.000; los $5.000 ya estaban.
    expect(eventos).toEqual([
      {
        tipo: 'PAGO_APROBADO',
        pagoId: 'p1',
        cuentaMesaId: 'cm',
        sucursalId: 's',
        comensalId: 'c',
        puntosSumados: 180,
        desbloqueados: ['Gastá $20.000'],
      },
    ]);
  });

  it('al rechazar publica PAGO_RECHAZADO', async () => {
    const { servicio, repo, eventos } = armar();
    repo.resolver.mockResolvedValue(resolucion({ estado: 'RECHAZADO', puntosSumados: 0 }));
    await servicio.resolver('p1', { estado: 'RECHAZADO' });
    expect(eventos).toEqual([
      {
        tipo: 'PAGO_RECHAZADO',
        pagoId: 'p1',
        cuentaMesaId: 'cm',
        sucursalId: 's',
        comensalId: 'c',
      },
    ]);
  });

  it('un cobro aprobado sobre un pago ya rechazado queda en el log para conciliar', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { servicio, repo, eventos } = armar();
    repo.resolver.mockResolvedValue(null);
    repo.buscar.mockResolvedValue({ estado: 'RECHAZADO', referenciaExterna: null });
    await servicio.resolver('p1', { estado: 'APROBADO', referenciaExterna: 'MP-9' });
    expect(eventos).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('conciliar'));
    expect(error.mock.calls[0]![0]).toContain('MP-9');
    error.mockRestore();
  });

  it('un segundo cobro aprobado del mismo pago también queda para conciliar', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { servicio, repo } = armar();
    repo.resolver.mockResolvedValue(null);
    repo.buscar.mockResolvedValue({ estado: 'APROBADO', referenciaExterna: 'MP-1' });
    await servicio.resolver('p1', { estado: 'APROBADO', referenciaExterna: 'MP-2' });
    expect(error).toHaveBeenCalledWith(expect.stringContaining('conciliar'));
    error.mockRestore();
  });

  it('una notificación repetida no publica nada', async () => {
    const { servicio, repo, eventos } = armar();
    repo.resolver.mockResolvedValue(null);
    await servicio.resolver('p1', { estado: 'APROBADO', referenciaExterna: 'MP-1' });
    expect(eventos).toEqual([]);
  });

  it('libera la URL del pago resuelto', async () => {
    const { servicio } = armar();
    await servicio.pagar('c', 'cm', INPUT);
    await servicio.resolver('p1', { estado: 'APROBADO', referenciaExterna: 'MP-1' });
    expect(servicio.urlDePago('p1')).toBeNull();
  });
});

describe('pagoService.estado', () => {
  it('un pago de otro comensal responde 404', async () => {
    const { servicio, repo } = armar();
    await expect(servicio.estado('c', 'p1')).rejects.toMatchObject({ status: 404 });
    expect(repo.estadoDelComensal).toHaveBeenCalledWith('c', 'p1');
  });
});

describe('pagoService.continuar', () => {
  const pendiente = {
    pagoId: 'p1',
    monto: 18000,
    mesaNumero: 4,
    restaurante: 'La Parrilla',
    creadoEn: CREADO_EN,
  };

  it('devuelve el link que ya tenía', async () => {
    const { servicio, repo, pasarela } = armar();
    await servicio.pagar('c', 'cm', INPUT);
    repo.pendienteDelComensal.mockResolvedValue(pendiente);
    expect(await servicio.continuar('c', 'p1')).toEqual({
      pagoId: 'p1',
      urlPago: 'https://mp/pagar',
    });
    expect(pasarela.iniciarCobro).toHaveBeenCalledTimes(1);
  });

  it('si el link se perdió (la API se reinició) arma otro con el mismo vencimiento', async () => {
    const { servicio, repo, pasarela } = armar();
    repo.pendienteDelComensal.mockResolvedValue(pendiente);
    expect(await servicio.continuar('c', 'p1')).toEqual({
      pagoId: 'p1',
      urlPago: 'https://mp/pagar',
    });
    expect(pasarela.iniciarCobro).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', venceEn: new Date('2026-11-10T12:13:00Z') }),
    );
  });

  it('un pago ya vencido no se puede continuar', async () => {
    const { servicio, repo } = armar();
    repo.pendienteDelComensal.mockResolvedValue({
      ...pendiente,
      creadoEn: new Date('2026-11-10T11:44:00Z'),
    });
    await expect(servicio.continuar('c', 'p1')).rejects.toMatchObject({
      status: 409,
      message: 'El pago venció. En unos minutos vas a poder pagar de nuevo.',
    });
  });

  it('pasado el margen, un pago que sigue pendiente está en revisión en Mercado Pago', async () => {
    const { servicio, repo } = armar();
    repo.pendienteDelComensal.mockResolvedValue({
      ...pendiente,
      creadoEn: new Date('2026-11-10T11:40:00Z'),
    });
    await expect(servicio.continuar('c', 'p1')).rejects.toMatchObject({
      status: 409,
      message: 'Mercado Pago todavía está revisando el pago. Consultá con el personal.',
    });
  });

  it('un pago que no está pendiente o es de otro comensal responde 404', async () => {
    const { servicio } = armar();
    await expect(servicio.continuar('c', 'p1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('pagoService.vencerPendientes', () => {
  it('consulta cada pago vencido y lo resuelve según Mercado Pago', async () => {
    const consultas: Record<string, unknown> = {
      aprobado: { estado: 'APROBADO', referenciaExterna: 'MP-9', metodo: 'BILLETERA_VIRTUAL' },
      enProceso: { estado: 'EN_PROCESO' },
      sinAprobar: { estado: 'SIN_APROBAR' },
    };
    const { servicio, repo, pasarela } = armar({
      consultarPago: jest.fn(async (id: string) => consultas[id]) as never,
    });
    repo.pendientesVencidos.mockResolvedValue(['aprobado', 'enProceso', 'sinAprobar']);

    expect(await servicio.vencerPendientes(AHORA)).toBe(2);
    // 15 minutos de vencimiento más 3 de margen: Mercado Pago puede tardar en
    // mostrar un cobro hecho en el último segundo.
    expect(repo.pendientesVencidos).toHaveBeenCalledWith(new Date('2026-11-10T11:42:00Z'));
    expect(pasarela.consultarPago).toHaveBeenCalledTimes(3);
    expect(repo.resolver.mock.calls).toEqual([
      ['aprobado', { estado: 'APROBADO', referenciaExterna: 'MP-9', metodo: 'BILLETERA_VIRTUAL' }],
      ['sinAprobar', { estado: 'RECHAZADO' }],
    ]);
  });

  it('un error con un pago no corta los demás', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { servicio, repo } = armar({
      consultarPago: jest
        .fn()
        .mockRejectedValueOnce(new Error('Mercado Pago respondió 500'))
        .mockResolvedValue({ estado: 'SIN_APROBAR' }),
    });
    repo.pendientesVencidos.mockResolvedValue(['falla', 'otro']);

    expect(await servicio.vencerPendientes(AHORA)).toBe(1);
    expect(repo.resolver).toHaveBeenCalledWith('otro', { estado: 'RECHAZADO' });
    error.mockRestore();
  });
});
