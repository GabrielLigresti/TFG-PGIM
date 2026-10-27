import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Pencil, Radio, TriangleAlert, WifiOff } from 'lucide-react';
import {
  EVENTOS_SOCKET,
  MOTIVOS_CANCELACION,
  type CambioPedido,
  type EstadoPedido,
  type PedidoCola,
} from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { useAvisos } from '../../components/AvisoEmergente';
import { Boton, EncabezadoPagina, EstadoCarga, claseInput } from '../../components/ui';
import { ApiError, api } from '../../lib/api';
import { useConexionSocket, useEventoSocket } from '../../lib/socket';
import { useAhora } from '../../lib/useAhora';
import { useRecurso } from '../../lib/useRecurso';

// CU-05: cola de cocina de la sucursal de trabajo, en tres columnas por estado
// y por orden de llegada. Se usa de pie, en una tablet y con apuro.

type EstadoCola = 'CONFIRMADO' | 'EN_PREPARACION' | 'LISTO';

const COLUMNAS: { estado: EstadoCola; titulo: string; vacio: string }[] = [
  { estado: 'CONFIRMADO', titulo: 'Nuevos', vacio: 'No hay pedidos nuevos' },
  { estado: 'EN_PREPARACION', titulo: 'En preparación', vacio: 'Nada en preparación' },
  { estado: 'LISTO', titulo: 'Listos', vacio: 'Nada para entregar' },
];

// Siguiente paso de cada columna: texto del botón, estado al que pasa y el
// permiso que lo habilita (preparar o entregar).
const PASOS: Record<
  EstadoCola,
  { accion: string; hacia: EstadoPedido; permiso: 'pedido.gestionar_cola' | 'pedido.avanzar' }
> = {
  CONFIRMADO: { accion: 'Empezar', hacia: 'EN_PREPARACION', permiso: 'pedido.gestionar_cola' },
  EN_PREPARACION: { accion: 'Marcar listo', hacia: 'LISTO', permiso: 'pedido.gestionar_cola' },
  LISTO: { accion: 'Entregar', hacia: 'ENTREGADO', permiso: 'pedido.avanzar' },
};

// Umbrales de demora en minutos: en cocina, desde que se hizo el pedido; en
// Listos, desde que quedó listo (ahí la espera es del salón).
const DEMORA: Record<EstadoCola, { warn: number; bad: number }> = {
  CONFIRMADO: { warn: 15, bad: 25 },
  EN_PREPARACION: { warn: 15, bad: 25 },
  LISTO: { warn: 3, bad: 6 },
};

const DESHACER_MS = 5000;
const RESALTADO_MS = 4000;

type Demora = 'ok' | 'warn' | 'bad';

function minutosDesde(pedido: PedidoCola, estado: EstadoCola, ahora: number): number {
  const desde = estado === 'LISTO' && pedido.listoEn ? pedido.listoEn : pedido.creadoEn;
  return Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / 60_000));
}

function demoraDe(minutos: number, estado: EstadoCola): Demora {
  const umbral = DEMORA[estado];
  return minutos >= umbral.bad ? 'bad' : minutos >= umbral.warn ? 'warn' : 'ok';
}

const esDeLaCola = (estado: EstadoPedido): estado is EstadoCola =>
  estado === 'CONFIRMADO' || estado === 'EN_PREPARACION' || estado === 'LISTO';

export function CocinaPage() {
  const { sesion, tienePermiso } = useSesion();
  const { avisar } = useAvisos();
  const recurso = useRecurso<PedidoCola[]>('/pedidos/cola');
  const [pedidos, setPedidos] = useState<PedidoCola[]>([]);
  // Avances esperando que venza el "Deshacer": se envían a la API recién después.
  const [pendientes, setPendientes] = useState<Record<string, EstadoPedido>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [resaltados, setResaltados] = useState<Set<string>>(new Set());
  const ahora = useAhora(15_000);
  const conexion = useConexionSocket(recurso.recargar);

  useEffect(() => {
    if (recurso.datos) setPedidos(recurso.datos);
  }, [recurso.datos]);

  // Al salir de la pantalla, los avances sin enviar se descartan.
  useEffect(() => {
    const pendientesAlSalir = timers.current;
    return () => {
      for (const timer of pendientesAlSalir.values()) clearTimeout(timer);
    };
  }, []);

  const aplicarCambio = useCallback((cambio: CambioPedido) => {
    setPedidos((lista) =>
      esDeLaCola(cambio.estado)
        ? lista.map((p) =>
            p.id === cambio.id ? { ...p, estado: cambio.estado, listoEn: cambio.listoEn } : p,
          )
        : lista.filter((p) => p.id !== cambio.id),
    );
  }, []);

  useEventoSocket<PedidoCola>(EVENTOS_SOCKET.pedidoNuevo, (pedido) => {
    setPedidos((lista) => (lista.some((p) => p.id === pedido.id) ? lista : [...lista, pedido]));
    setResaltados((s) => new Set(s).add(pedido.id));
    setTimeout(
      () =>
        setResaltados((s) => {
          const otro = new Set(s);
          otro.delete(pedido.id);
          return otro;
        }),
      RESALTADO_MS,
    );
    avisar(`Pedido nuevo: mesa ${pedido.mesa.numero}`);
  });
  useEventoSocket<CambioPedido>(EVENTOS_SOCKET.pedidoCambio, aplicarCambio);

  function quitarPendiente(id: string) {
    timers.current.delete(id);
    setPendientes(({ [id]: _, ...resto }) => resto);
  }

  async function enviarAvance(pedido: PedidoCola) {
    try {
      aplicarCambio(await api<CambioPedido>(`/pedidos/${pedido.id}/avanzar`, { method: 'POST' }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) avisar('El pedido ya cambió');
      else avisar(e instanceof ApiError ? e.message : 'No se pudo actualizar el pedido');
      recurso.recargar();
    } finally {
      quitarPendiente(pedido.id);
    }
  }

  function avanzar(pedido: PedidoCola, estado: EstadoCola) {
    const paso = PASOS[estado];
    setPendientes((p) => ({ ...p, [pedido.id]: paso.hacia }));
    timers.current.set(
      pedido.id,
      setTimeout(() => void enviarAvance(pedido), DESHACER_MS),
    );
    const texto =
      paso.hacia === 'LISTO'
        ? `Mesa ${pedido.mesa.numero}: pedido listo, le avisamos al cliente`
        : paso.hacia === 'ENTREGADO'
          ? `Mesa ${pedido.mesa.numero}: pedido entregado`
          : `Mesa ${pedido.mesa.numero}: pedido en preparación`;
    avisar(texto, {
      duracionMs: DESHACER_MS,
      deshacer: () => {
        clearTimeout(timers.current.get(pedido.id));
        quitarPendiente(pedido.id);
      },
    });
  }

  async function cancelar(pedido: PedidoCola, motivo: string): Promise<boolean> {
    try {
      aplicarCambio(
        await api<CambioPedido>(`/pedidos/${pedido.id}/cancelar`, {
          method: 'POST',
          body: { motivo },
        }),
      );
      avisar(`Pedido #${pedido.numero} cancelado; los ingredientes volvieron al stock`);
      return true;
    } catch (e) {
      avisar(e instanceof ApiError ? e.message : 'No se pudo cancelar el pedido');
      recurso.recargar();
      return false;
    }
  }

  // Estado que se ve: el pendiente de "Deshacer" o el real.
  const visibles = pedidos.flatMap((p) => {
    const estado = pendientes[p.id] ?? p.estado;
    return esDeLaCola(estado) ? [{ pedido: p, estado }] : [];
  });

  return (
    <section>
      <EncabezadoPagina
        titulo="Cocina"
        descripcion={`Pedidos de ${sesion?.sucursalActiva?.nombre ?? 'la sucursal'}, por orden de llegada.`}
        accion={<IndicadorConexion estado={conexion} />}
      />
      <EstadoCarga cargando={recurso.cargando && !recurso.datos} error={recurso.error} />
      {recurso.datos && (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNAS.map((columna) => {
            const deLaColumna = visibles
              .filter((v) => v.estado === columna.estado)
              .sort((a, b) => a.pedido.creadoEn.localeCompare(b.pedido.creadoEn));
            const demorados = deLaColumna.filter(
              (v) =>
                demoraDe(minutosDesde(v.pedido, columna.estado, ahora), columna.estado) !== 'ok',
            ).length;
            const nuevos = deLaColumna.filter((v) => resaltados.has(v.pedido.id)).length;
            return (
              <section
                key={columna.estado}
                aria-label={columna.titulo}
                className="flex min-w-0 flex-col gap-3 rounded-panel bg-panel p-3"
              >
                <header className="flex flex-wrap items-center gap-2 px-1">
                  <h2 className="text-lg font-semibold text-ink">{columna.titulo}</h2>
                  <span className="rounded-full bg-surface px-2 text-sm font-semibold tabular-nums text-text">
                    {deLaColumna.length}
                  </span>
                  {demorados > 0 && (
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-warn">
                      <TriangleAlert aria-hidden className="size-4" />
                      {demorados} {demorados === 1 ? 'demorado' : 'demorados'}
                    </span>
                  )}
                  {nuevos > 0 && (
                    <span className="text-sm font-semibold text-accent-ink">
                      {nuevos} {nuevos === 1 ? 'nuevo' : 'nuevos'}
                    </span>
                  )}
                </header>
                {deLaColumna.length === 0 && (
                  <p className="rounded-panel border border-dashed border-line-strong px-3 py-6 text-center text-sm text-meta">
                    {columna.vacio}
                  </p>
                )}
                {deLaColumna.map(({ pedido }) => (
                  <Comanda
                    key={pedido.id}
                    pedido={pedido}
                    estado={columna.estado}
                    ahora={ahora}
                    resaltado={resaltados.has(pedido.id)}
                    pendiente={pedido.id in pendientes}
                    puedeAvanzar={tienePermiso(PASOS[columna.estado].permiso)}
                    puedeCancelar={
                      columna.estado === 'CONFIRMADO' && tienePermiso('pedido.gestionar_cola')
                    }
                    onAvanzar={() => avanzar(pedido, columna.estado)}
                    onCancelar={(motivo) => cancelar(pedido, motivo)}
                  />
                ))}
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-meta">
        Demorado: 15 min o más (en Listos, 3 min). Muy demorado: 25 min o más (en Listos, 6 min).
      </p>
    </section>
  );
}

function IndicadorConexion({ estado }: { estado: ReturnType<typeof useConexionSocket> }) {
  if (estado === 'en-vivo') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ok">
        <Radio aria-hidden className="size-4" />
        En vivo
      </span>
    );
  }
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-sm font-semibold text-bad">
      <WifiOff aria-hidden className="size-4" />
      {estado === 'reintentando' ? 'Sin conexión. Reintentando…' : 'Sin conexión'}
    </span>
  );
}

const CLASES_DEMORA: Record<Demora, { tarjeta: string; encabezado: string; reloj: string }> = {
  ok: { tarjeta: 'border-line', encabezado: '', reloj: 'text-meta' },
  warn: {
    tarjeta: 'border-line border-l-4 border-l-warn',
    encabezado: 'bg-warn-soft',
    reloj: 'text-warn',
  },
  bad: {
    tarjeta: 'border-line border-l-4 border-l-bad',
    encabezado: 'bg-bad-soft',
    reloj: 'text-bad',
  },
};

function Comanda({
  pedido,
  estado,
  ahora,
  resaltado,
  pendiente,
  puedeAvanzar,
  puedeCancelar,
  onAvanzar,
  onCancelar,
}: {
  pedido: PedidoCola;
  estado: EstadoCola;
  ahora: number;
  resaltado: boolean;
  pendiente: boolean;
  puedeAvanzar: boolean;
  puedeCancelar: boolean;
  onAvanzar(): void;
  onCancelar(motivo: string): Promise<boolean>;
}) {
  const [cancelando, setCancelando] = useState(false);
  const minutos = minutosDesde(pedido, estado, ahora);
  const demora = demoraDe(minutos, estado);
  const clases = CLASES_DEMORA[demora];

  return (
    <article
      className={`overflow-hidden rounded-panel border bg-surface ${clases.tarjeta} ${
        resaltado ? 'ring-2 ring-accent' : ''
      }`}
    >
      <header
        className={`flex items-baseline justify-between gap-3 px-4 pt-3 pb-2 ${clases.encabezado}`}
      >
        <div>
          <p className="text-xl font-semibold text-ink">Mesa {pedido.mesa.numero}</p>
          <p className="text-xs text-meta">Pedido #{pedido.numero}</p>
        </div>
        <p
          className={`inline-flex items-center gap-1 text-xl font-semibold tabular-nums ${clases.reloj}`}
          title={estado === 'LISTO' ? 'Desde que quedó listo' : 'Desde que se hizo el pedido'}
        >
          {demora === 'ok' ? (
            <Clock aria-hidden className="size-5" />
          ) : (
            <TriangleAlert aria-hidden className="size-5" />
          )}
          {minutos} min
          {demora !== 'ok' && (
            <span className="sr-only">{demora === 'bad' ? ', muy demorado' : ', demorado'}</span>
          )}
        </p>
      </header>
      <ul className="space-y-2 px-4 py-2">
        {pedido.lineas.map((l) => (
          <li key={l.id}>
            <p className="text-base text-text">
              <span className="font-bold tabular-nums">{l.cantidad}×</span> {l.plato.nombre}
            </p>
            {l.observaciones && (
              <p className="mt-1 flex items-start gap-1.5 rounded-control bg-accent-soft px-2 py-1 text-[15px] font-semibold text-ink">
                <Pencil aria-hidden className="mt-0.5 size-4 shrink-0" />
                {l.observaciones}
              </p>
            )}
          </li>
        ))}
      </ul>
      {cancelando ? (
        <ConfirmarCancelacion
          numero={pedido.numero}
          onVolver={() => setCancelando(false)}
          onConfirmar={async (motivo) => {
            if (await onCancelar(motivo)) setCancelando(false);
          }}
        />
      ) : (
        (puedeAvanzar || puedeCancelar) && (
          <footer className="flex items-center justify-between gap-6 px-4 pt-1 pb-4">
            {puedeAvanzar ? (
              <Boton variante="tonal" densidad="tactil" disabled={pendiente} onClick={onAvanzar}>
                {PASOS[estado].accion}
              </Boton>
            ) : (
              <span />
            )}
            {puedeCancelar && (
              <Boton variante="fantasma" densidad="tactil" onClick={() => setCancelando(true)}>
                Cancelar
              </Boton>
            )}
          </footer>
        )
      )}
    </article>
  );
}

const OTRO = 'Otro';

function ConfirmarCancelacion({
  numero,
  onVolver,
  onConfirmar,
}: {
  numero: number;
  onVolver(): void;
  onConfirmar(motivo: string): Promise<void>;
}) {
  const [motivo, setMotivo] = useState<string>(MOTIVOS_CANCELACION[0]);
  const [otro, setOtro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const texto = motivo === OTRO ? otro.trim() : motivo;

  return (
    <div className="space-y-3 border-t border-line bg-bad-soft px-4 py-3">
      <p className="font-semibold text-ink">
        ¿Cancelar el pedido #{numero}? Los ingredientes vuelven al stock.
      </p>
      <fieldset className="grid gap-1">
        <legend className="mb-1 text-sm text-meta">Motivo</legend>
        {[...MOTIVOS_CANCELACION, OTRO].map((m) => (
          <label key={m} className="flex min-h-12 items-center gap-2 text-base text-text">
            <input
              type="radio"
              name={`motivo-${numero}`}
              checked={motivo === m}
              onChange={() => setMotivo(m)}
              className="size-5 accent-accent"
            />
            {m}
          </label>
        ))}
      </fieldset>
      {motivo === OTRO && (
        <input
          value={otro}
          maxLength={200}
          onChange={(e) => setOtro(e.target.value)}
          aria-label="Otro motivo"
          placeholder="Contá el motivo"
          className={`${claseInput} text-base`}
        />
      )}
      <div className="flex justify-between gap-6">
        <Boton variante="fantasma" densidad="tactil" onClick={onVolver}>
          Volver
        </Boton>
        <Boton
          variante="peligro"
          densidad="tactil"
          disabled={!texto || enviando}
          onClick={async () => {
            setEnviando(true);
            await onConfirmar(texto);
            setEnviando(false);
          }}
        >
          Cancelar pedido
        </Boton>
      </div>
    </div>
  );
}
