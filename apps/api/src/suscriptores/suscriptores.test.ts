import type { AlertaPanel } from '@pgim/shared';
import { crearBusEventos, type EventoDominio } from '../domain/eventos';
import type { AlertaRepository } from '../repositories/alerta.repository';
import { registrarGeneradorAlertas } from './generador-alertas';
import { registrarRegistroVisitas } from './registro-visitas';

const alerta: AlertaPanel = {
  id: 'A',
  tipo: 'STOCK_INSUFICIENTE',
  severidad: 'CRITICA',
  descripcion: 'No alcanzó Queso para Pizza',
  creadaEn: '2026-10-30T23:00:00.000Z',
  insumo: { id: 'queso', nombre: 'Queso' },
  plato: { id: 'pizza', nombre: 'Pizza' },
};

const sinStock: EventoDominio = {
  tipo: 'STOCK_INSUFICIENTE',
  sucursalId: 'S',
  componenteId: 'queso',
  itemMenuId: 'pizza',
};

// Los suscriptores son asíncronos: se espera a que terminen sus promesas.
const esperar = () => new Promise((r) => setImmediate(r));

function armarAlertas(crear: AlertaRepository['crearSiNoHay']) {
  const bus = crearBusEventos();
  const eventos: EventoDominio[] = [];
  bus.suscribir((e) => eventos.push(e));
  const repo = { crearSiNoHay: jest.fn(crear), listarSinResolver: jest.fn(), resolver: jest.fn() };
  registrarGeneradorAlertas(bus, repo);
  return { bus, eventos, repo };
}

describe('GeneradorAlertas', () => {
  it('guarda la alerta de stock y la publica para el personal', async () => {
    const { bus, eventos, repo } = armarAlertas(async () => alerta);

    bus.publicar(sinStock);
    await esperar();

    expect(repo.crearSiNoHay).toHaveBeenCalledWith({
      sucursalId: 'S',
      tipo: 'STOCK_INSUFICIENTE',
      componenteId: 'queso',
      itemMenuId: 'pizza',
    });
    expect(eventos).toContainEqual({ tipo: 'ALERTA_CREADA', sucursalId: 'S', alerta });
  });

  it('si ya había una igual, no publica', async () => {
    const { bus, eventos } = armarAlertas(async () => null);
    bus.publicar({ tipo: 'PLATO_SIN_RECETA', sucursalId: 'S', itemMenuId: 'agua' });
    await esperar();
    expect(eventos.some((e) => e.tipo === 'ALERTA_CREADA')).toBe(false);
  });

  it('un error al guardar no llega a quien publicó', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { bus } = armarAlertas(async () => {
      throw new Error('base caída');
    });
    expect(() => bus.publicar(sinStock)).not.toThrow();
    await esperar();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('RegistroVisitas', () => {
  it('registra la visita del titular al cerrarse la mesa', async () => {
    const bus = crearBusEventos();
    const repo = { registrarVisita: jest.fn().mockResolvedValue(true) };
    registrarRegistroVisitas(bus, repo);

    bus.publicar({
      tipo: 'CUENTA_MESA_CERRADA',
      cuentaMesaId: 'CM',
      restauranteId: 'R',
      comensalId: 'C',
    });
    bus.publicar(sinStock);
    await esperar();

    expect(repo.registrarVisita).toHaveBeenCalledTimes(1);
    expect(repo.registrarVisita).toHaveBeenCalledWith('CM', 'R', 'C');
  });
});
