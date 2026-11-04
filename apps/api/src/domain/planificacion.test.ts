import { estadoDePlanificacion } from './planificacion';

describe('estadoDePlanificacion', () => {
  it('BORRADOR se puede regenerar y confirmar', () => {
    const estado = estadoDePlanificacion('BORRADOR');
    expect(() => estado.regenerar()).not.toThrow();
    expect(estado.confirmar()).toBe('CONFIRMADA');
  });

  it('CONFIRMADA rechaza regenerar y confirmar con 409', () => {
    const estado = estadoDePlanificacion('CONFIRMADA');
    expect(() => estado.regenerar()).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => estado.confirmar()).toThrow(expect.objectContaining({ status: 409 }));
  });
});
