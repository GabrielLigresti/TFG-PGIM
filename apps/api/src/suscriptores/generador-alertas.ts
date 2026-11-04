import type { BusEventos } from '../domain/eventos';
import type { AlertaRepository, DatosAlertaStock } from '../repositories/alerta.repository';

// GeneradorAlertas (Observer): guarda las alertas de la secuencia de CU-04 y
// las inasistencias (CU-21), y las publica para el panel. Es un efecto
// secundario: si falla, el pedido (o su rechazo) o el vencimiento de la
// reserva ya quedaron resueltos igual.
export function registrarGeneradorAlertas(
  bus: BusEventos,
  repo: Pick<AlertaRepository, 'crearSiNoHay' | 'crearInasistencia'>,
): () => void {
  return bus.suscribir((evento) => {
    let datos: DatosAlertaStock;
    if (evento.tipo === 'RESERVA_VENCIDA') {
      const { sucursalId } = evento.reserva;
      repo
        .crearInasistencia(evento.reserva)
        .then((alerta) => {
          if (alerta) bus.publicar({ tipo: 'ALERTA_CREADA', sucursalId, alerta });
        })
        .catch((e: unknown) => console.error('No se pudo guardar la alerta de inasistencia', e));
      return;
    }
    if (evento.tipo === 'STOCK_INSUFICIENTE') {
      datos = {
        sucursalId: evento.sucursalId,
        tipo: evento.tipo,
        componenteId: evento.componenteId,
        itemMenuId: evento.itemMenuId,
      };
    } else if (evento.tipo === 'PLATO_SIN_RECETA') {
      datos = { sucursalId: evento.sucursalId, tipo: evento.tipo, itemMenuId: evento.itemMenuId };
    } else {
      return;
    }
    repo
      .crearSiNoHay(datos)
      .then((alerta) => {
        if (alerta) bus.publicar({ tipo: 'ALERTA_CREADA', sucursalId: datos.sucursalId, alerta });
      })
      .catch((e: unknown) => console.error('No se pudo guardar la alerta', e));
  });
}
