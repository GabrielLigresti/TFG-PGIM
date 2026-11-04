import { capacidadDeFranja, horasDeFranja } from './capacidad';

describe('horasDeFranja', () => {
  it('calcula franjas dentro del día', () => {
    expect(horasDeFranja({ franja: 'ALMUERZO', horaInicio: '12:00', horaFin: '15:00' })).toBe(3);
  });
  it('trata 00:00 como fin del día', () => {
    expect(horasDeFranja({ franja: 'CENA', horaInicio: '20:00', horaFin: '00:00' })).toBe(4);
  });
  it('cruza la medianoche', () => {
    expect(horasDeFranja({ franja: 'CENA', horaInicio: '20:00', horaFin: '01:30' })).toBe(5.5);
  });
});

describe('capacidadDeFranja', () => {
  it('multiplica por bloques de 1 h enteros', () => {
    expect(capacidadDeFranja([4, 2, 6], 5.5)).toBe(60);
  });
  it('sin mesas es 0', () => {
    expect(capacidadDeFranja([], 4)).toBe(0);
  });
});
