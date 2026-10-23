import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  DIAS_ANTICIPACION_RESERVA,
  MAX_PERSONAS_RESERVA,
  hoyArgentina,
  EVENTOS_SOCKET,
  type CambioSalon,
  type FranjaDisponible,
  type MapaDeFranja,
  type ReservaComensal,
  type RestauranteComensal,
} from '@pgim/shared';
import { LayoutComensal } from '../../components/LayoutComensal';
import { MapaSalon } from '../../components/MapaSalon';
import { Aviso, Boton, Campo, EstadoCarga, claseInput } from '../../components/ui';
import { formatoDiaYHora, formatoHora, sumarDias } from '../../lib/formato';
import { useEventoSocket } from '../../lib/socket';
import { useAhora } from '../../lib/useAhora';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

// CU-03: fecha y personas → franja → mesa en el mapa (o asignación automática).
export function ReservarPage() {
  const { sucursalId } = useParams();
  const hoy = hoyArgentina();
  const [fecha, setFecha] = useState(hoy);
  const [personas, setPersonas] = useState(2);
  const [franja, setFranja] = useState<string | null>(null);
  const [mesaId, setMesaId] = useState<string | null>(null);
  const [confirmada, setConfirmada] = useState<ReservaComensal | null>(null);
  const { enviar, enviando, error, setError } = useGuardar();

  const base = `/comensal/sucursales/${sucursalId}`;
  const restaurantes = useRecurso<RestauranteComensal[]>('/comensal/sucursales');
  const sucursal = restaurantes.datos
    ?.flatMap((r) => r.sucursales)
    .find((s) => s.id === sucursalId);
  const franjas = useRecurso<FranjaDisponible[]>(
    fecha ? `${base}/franjas?fecha=${fecha}&personas=${personas}` : null,
  );
  // Una franja que empieza mientras la pantalla está abierta deja de ofrecerse.
  const ahora = useAhora();
  const ofrecidas = franjas.datos?.filter((f) => Date.parse(f.inicio) > ahora);
  const franjaVigente = franja !== null && Date.parse(franja) > ahora;
  const mapa = useRecurso<MapaDeFranja>(
    franja ? `${base}/mapa?inicio=${encodeURIComponent(franja)}&personas=${personas}` : null,
  );
  // Otro comensal reservó o canceló: se actualizan el mapa (si es la misma
  // franja) y la cantidad de mesas libres.
  useEventoSocket<CambioSalon>(
    EVENTOS_SOCKET.cambioSalon,
    (cambio) => {
      if (cambio.inicio === franja) mapa.recargar();
      franjas.recargar();
    },
    sucursalId,
  );
  const mesaElegida = mapa.datos?.mesas.find((m) => m.id === mesaId && m.estado === 'LIBRE');

  function cambiarDatos(cambio: () => void) {
    cambio();
    setFranja(null);
    setMesaId(null);
    setError(null);
  }

  async function reservar(mesa: string | null) {
    if (!franja) return;
    const respuesta = await enviar<ReservaComensal>('/comensal/reservas', 'POST', {
      sucursalId,
      inicio: franja,
      personas,
      mesaId: mesa,
    });
    if (respuesta) {
      setConfirmada(respuesta.datos);
      return;
    }
    // La mesa o la franja pudieron ocuparse mientras tanto: se recarga lo que se ve.
    setMesaId(null);
    mapa.recargar();
    franjas.recargar();
  }

  const volver = { a: `/s/${sucursalId}/menu`, texto: sucursal?.nombre ?? 'Menú' };

  if (confirmada) {
    return (
      <LayoutComensal volver={volver}>
        <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h1 className="text-xl font-semibold text-slate-800">¡Reserva confirmada!</h1>
          <p className="text-slate-700">
            Mesa {confirmada.mesa.numero} en {confirmada.sucursal.nombre}, el{' '}
            {formatoDiaYHora(confirmada.inicio)} h, para {confirmada.cantidadPersonas}{' '}
            {confirmada.cantidadPersonas === 1 ? 'persona' : 'personas'}.
          </p>
          <p className="text-sm text-slate-500">
            Tenés tolerancia hasta las {formatoHora(confirmada.limiteLlegada)}.
          </p>
          <Link to="/reservas" className="inline-block font-medium text-slate-800 underline">
            Ver mis reservas
          </Link>
        </div>
      </LayoutComensal>
    );
  }

  return (
    <LayoutComensal volver={volver}>
      <h1 className="mb-1 text-xl font-semibold text-slate-800">Reservar mesa</h1>
      <p className="mb-4 text-sm text-slate-500">
        {sucursal ? `${sucursal.nombre} · ` : ''}Turnos de una hora, hasta{' '}
        {DIAS_ANTICIPACION_RESERVA} días antes.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Campo etiqueta="Fecha">
          <input
            type="date"
            min={hoy}
            max={sumarDias(hoy, DIAS_ANTICIPACION_RESERVA)}
            value={fecha}
            onChange={(e) => cambiarDatos(() => setFecha(e.target.value))}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Personas">
          <select
            value={personas}
            onChange={(e) => cambiarDatos(() => setPersonas(Number(e.target.value)))}
            className={claseInput}
          >
            {Array.from({ length: MAX_PERSONAS_RESERVA }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <EstadoCarga cargando={franjas.cargando && !franjas.datos} error={franjas.error} />
      {ofrecidas?.length === 0 && (
        <p className="rounded-xl bg-white p-4 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
          No hay mesas disponibles para esa fecha y cantidad de personas. Probá con otra fecha.
        </p>
      )}
      {ofrecidas && ofrecidas.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-medium text-slate-700">Horario</h2>
          <div className="flex flex-wrap gap-2">
            {ofrecidas.map((f) => (
              <Boton
                key={f.inicio}
                variante={f.inicio === franja ? 'primario' : 'secundario'}
                aria-pressed={f.inicio === franja}
                onClick={() => {
                  setFranja(f.inicio);
                  setMesaId(null);
                  setError(null);
                }}
              >
                {f.hora}
              </Boton>
            ))}
          </div>
        </section>
      )}

      {franjaVigente && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-slate-700">Elegí tu mesa</h2>
          <EstadoCarga cargando={mapa.cargando && !mapa.datos} error={mapa.error} />
          {mapa.datos && (
            <>
              <MapaSalon mesas={mapa.datos.mesas} seleccionadaId={mesaId} onElegir={setMesaId} />
              <p className="text-xs text-slate-500">
                En verde, las libres. Las grises están reservadas o son chicas para {personas}{' '}
                {personas === 1 ? 'persona' : 'personas'}.
              </p>
            </>
          )}
          <Aviso>{error}</Aviso>
          <div className="flex flex-wrap gap-2">
            <Boton disabled={!mesaElegida || enviando} onClick={() => reservar(mesaId)}>
              {mesaElegida ? `Reservar mesa ${mesaElegida.numero}` : 'Tocá una mesa libre'}
            </Boton>
            <Boton variante="secundario" disabled={enviando} onClick={() => reservar(null)}>
              Asignarme una mesa
            </Boton>
          </div>
        </section>
      )}
    </LayoutComensal>
  );
}
