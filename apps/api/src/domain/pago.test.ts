import { estadoDePago, formatearComprobante } from './pago';

describe('estado del pago', () => {
  it('un pago pendiente se aprueba o se rechaza', () => {
    expect(estadoDePago('PENDIENTE').aprobar()).toBe('APROBADO');
    expect(estadoDePago('PENDIENTE').rechazar()).toBe('RECHAZADO');
  });

  it('aprobado y rechazado son finales', () => {
    expect(() => estadoDePago('RECHAZADO').aprobar()).toThrow('El pago ya está rechazado');
    expect(() => estadoDePago('APROBADO').rechazar()).toThrow('El pago ya está aprobado');
    expect(() => estadoDePago('APROBADO').aprobar()).toThrow('El pago ya está aprobado');
  });
});

describe('formatearComprobante', () => {
  it('numera con seis dígitos', () => {
    expect(formatearComprobante(42)).toBe('C-000042');
    expect(formatearComprobante(1)).toBe('C-000001');
  });
});
