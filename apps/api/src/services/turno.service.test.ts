import { createTurnoService } from './turno.service';

describe('turnoService', () => {
  it('pide los turnos del empleado desde hoy, en horario argentino', async () => {
    const turnosDe = jest.fn().mockResolvedValue([]);
    // 01:00 UTC del 5/11 todavía es 4/11 en Argentina.
    await createTurnoService({ turnosDe }).misTurnos('r1', 'u1', new Date('2026-11-05T01:00:00Z'));
    expect(turnosDe).toHaveBeenCalledWith('r1', 'u1', '2026-11-04');
  });
});
