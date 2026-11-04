import { useState, type FormEvent } from 'react';
import {
  Check,
  CircleHelp,
  RefreshCw,
  Settings2,
  TrendingUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import {
  ETIQUETA_METODO_PRONOSTICO,
  configuracionAperturaSchema,
  type AsistenteApertura,
  type ConfiguracionApertura,
  type PlanificacionSemana,
  type PronosticoFranja,
} from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import {
  Aviso,
  Boton,
  Campo,
  Estado,
  Etiqueta,
  EncabezadoPagina,
  EstadoCarga,
  Kpi,
  Modal,
  Panel,
  Vacio,
  claseInput,
  propsDecimal,
} from '../../components/ui';
import type { Tono } from '../../lib/estados';
import { ApiError, api } from '../../lib/api';
import { aNumero, formatoPesosEnteros, sumarDias } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';
import { AlertasSemana } from './apertura/AlertasSemana';
import { GrillaTurnos, cantidadFaltantes } from './apertura/GrillaTurnos';
import {
  NOMBRE_FRANJA,
  ORDEN_FRANJA,
  clave,
  diaCorto,
  diaLargo,
  diaMinuscula,
} from './apertura/semana';

const cubiertos = (n: number) => `${n} ${n === 1 ? 'cubierto' : 'cubiertos'}`;
const porciones = (n: number) => `${n} ${n === 1 ? 'porción' : 'porciones'}`;

interface Confianza {
  texto: string;
  tono: Tono;
  icono: LucideIcon;
}

// Cuánto confiar en el pronóstico según el error medido sobre el historial.
function confianza(error: number): Confianza {
  if (error <= 15) return { texto: 'Confiable', tono: 'ok', icono: Check };
  if (error <= 25) return { texto: 'Aceptable', tono: 'acento', icono: CircleHelp };
  return { texto: 'Orientativo', tono: 'warn', icono: TriangleAlert };
}

// Pronóstico de la semana siguiente de la sucursal de trabajo (CU-09).
export function AperturaPage() {
  const recurso = useRecurso<AsistenteApertura>('/apertura/pronostico');
  const [configurando, setConfigurando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const { sesion } = useSesion();
  const puedePlanificar = sesion?.permisos.includes('turno.planificar') ?? false;
  const [aviso, setAviso] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<AsistenteApertura | null>(null);
  const asistente = nuevo ?? recurso.datos;

  const suficiente = asistente?.progreso.suficiente ?? false;
  const fin = asistente ? sumarDias(asistente.semanaDesde, 6) : null;
  const plan = asistente?.planificacion ?? null;
  // Con la semana confirmada la pantalla queda en modo lectura.
  const editable = puedePlanificar && suficiente && plan?.estado !== 'CONFIRMADA';

  return (
    <section className={editable && plan ? 'pb-20 md:pb-0' : undefined}>
      <EncabezadoPagina
        titulo="Asistente de apertura"
        descripcion={
          asistente && fin
            ? `Semana del ${diaMinuscula(asistente.semanaDesde)} al ${diaMinuscula(fin)}`
            : 'Pronóstico de la semana siguiente'
        }
        accion={
          <div className="flex flex-wrap items-center gap-2">
            {plan && suficiente && <Estado entidad="planificacion" valor={plan.estado} />}
            <Boton variante="secundario" onClick={() => setConfigurando(true)}>
              <Settings2 aria-hidden className="size-4" />
              Configuración
            </Boton>
            {editable && (
              <Boton variante="secundario" onClick={() => setRegenerando(true)}>
                <RefreshCw aria-hidden className="size-4" />
                Regenerar
              </Boton>
            )}
            {editable && plan && (
              <Boton className="hidden md:inline-flex" onClick={() => setConfirmando(true)}>
                <Check aria-hidden className="size-4" />
                Confirmar turnos
              </Boton>
            )}
          </div>
        }
      />
      <EstadoCarga
        cargando={recurso.cargando && !asistente}
        error={asistente ? null : recurso.error}
      />
      {aviso && (
        <div className="mb-3">
          <Aviso tono="ok">{aviso}</Aviso>
        </div>
      )}
      {asistente && !suficiente && <Progreso asistente={asistente} />}
      {asistente && suficiente && <Pronostico asistente={asistente} />}
      {editable && plan && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface p-3 md:hidden">
          <Boton densidad="comensal" className="w-full" onClick={() => setConfirmando(true)}>
            <Check aria-hidden className="size-4" />
            Confirmar turnos
          </Boton>
        </div>
      )}

      {confirmando && plan && (
        <ModalConfirmar
          plan={plan}
          onCerrar={() => setConfirmando(false)}
          onConfirmada={(datos) => {
            setNuevo(datos);
            setAviso('Turnos confirmados.');
            setConfirmando(false);
          }}
        />
      )}

      {regenerando && (
        <ModalRegenerar
          onCerrar={() => setRegenerando(false)}
          onRegenerado={(datos) => {
            setNuevo(datos);
            setAviso(null);
            setRegenerando(false);
          }}
        />
      )}
      {configurando && (
        <ModalConfiguracion
          onCerrar={() => setConfigurando(false)}
          onGuardado={(minimoCambio) => {
            setConfigurando(false);
            // Solo el mínimo de semanas cambia el pronóstico vigente: los
            // coeficientes (mozos, cocineros) no entran en él, así que alcanza con
            // confirmar. Si el mínimo cambió se pide el pronóstico de nuevo (el
            // servidor genera la semana si ya alcanza el historial) y el aviso
            // depende del resultado.
            setAviso('Configuración guardada.');
            if (!minimoCambio) return;
            api<AsistenteApertura>('/apertura/pronostico')
              .then((datos) => {
                setNuevo(datos);
                if (!datos.progreso.suficiente) {
                  setAviso(
                    'Configuración guardada. Todavía no hay historial suficiente para pronosticar.',
                  );
                }
              })
              .catch(() => recurso.recargar());
          }}
        />
      )}
    </section>
  );
}

function Progreso({ asistente }: { asistente: AsistenteApertura }) {
  const { semanas, minimo } = asistente.progreso;
  const faltan = Math.max(minimo - semanas, 0);
  const porcentaje = Math.min(100, Math.round((semanas / minimo) * 100));
  return (
    <Panel className="mx-auto grid max-w-xl justify-items-center gap-4 py-8 text-center">
      <p className="text-2xl font-semibold tracking-tight text-ink tabular-nums">
        {semanas} de {minimo} semanas
      </p>
      <div
        role="progressbar"
        aria-label="Semanas de historial"
        aria-valuenow={Math.min(semanas, minimo)}
        aria-valuemin={0}
        aria-valuemax={minimo}
        className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-panel"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${porcentaje}%` }} />
      </div>
      <p className="max-w-md text-sm text-meta">
        {faltan === 1 ? 'Falta 1 semana' : `Faltan ${faltan} semanas`} de reservas atendidas para
        pronosticar la demanda. Se cuentan desde la primera reserva con la cuenta cerrada.
      </p>
    </Panel>
  );
}

function Pronostico({ asistente }: { asistente: AsistenteApertura }) {
  const { pronosticos, semanaDesde, planificacion } = asistente;
  const [elegida, setElegida] = useState<string | null>(null);

  if (pronosticos.length === 0) {
    return (
      <Vacio
        icono={TrendingUp}
        titulo="Todavía no hay pronóstico guardado."
        texto="Tocá Regenerar para calcular la semana."
      />
    );
  }

  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(semanaDesde, i));
  const franjas = ORDEN_FRANJA.filter((f) => pronosticos.some((p) => p.franja === f));
  const porClave = new Map(pronosticos.map((p) => [clave(p), p]));

  const mayor = pronosticos.reduce((a, b) => (b.cubiertosEstimados > a.cubiertosEstimados ? b : a));
  const seleccionada = (elegida && porClave.get(elegida)) || mayor;

  const totalCubiertos = pronosticos.reduce((s, p) => s + p.cubiertosEstimados, 0);
  const totalIngreso = pronosticos.reduce((s, p) => s + p.ingresoEstimado, 0);
  const porDia = fechas.map((f) => ({
    fecha: f,
    total: pronosticos.filter((p) => p.fecha === f).reduce((s, p) => s + p.cubiertosEstimados, 0),
  }));
  const diaMayor = porDia.reduce((a, b) => (b.total > a.total ? b : a));

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi etiqueta="Cubiertos estimados" valor={totalCubiertos} detalle="En la semana" />
        <Kpi
          etiqueta="Ingreso estimado"
          valor={formatoPesosEnteros(totalIngreso)}
          detalle="En la semana"
        />
        <Kpi
          etiqueta="Día de más demanda"
          valor={diaLargo(diaMayor.fecha)}
          detalle={cubiertos(diaMayor.total)}
        />
      </div>

      {planificacion && <AlertasSemana planificacion={planificacion} />}

      <div className="grid gap-4">
        <div className="min-w-0">
          <Panel titulo="Demanda de la semana">
            <div className="hidden md:block">
              <table className="w-full table-fixed border-separate border-spacing-1 text-left">
                <thead>
                  <tr>
                    <th scope="col" className="w-24" />
                    {fechas.map((f) => (
                      <th key={f} scope="col" className="px-1 pb-1 text-xs font-medium text-meta">
                        {diaCorto(f)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {franjas.map((franja) => (
                    <tr key={franja}>
                      <th scope="row" className="pr-2 text-sm font-medium text-ink">
                        {NOMBRE_FRANJA[franja]}
                      </th>
                      {fechas.map((f) => {
                        const p = porClave.get(clave({ fecha: f, franja }));
                        return (
                          <td key={f} className="align-top">
                            {p ? (
                              <Celda
                                p={p}
                                activa={clave(p) === clave(seleccionada)}
                                onElegir={() => setElegida(clave(p))}
                              />
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="grid gap-3 md:hidden">
              {fechas.map((f) => (
                <li key={f} className="rounded-panel border border-line p-2">
                  <h3 className="px-1 pb-1 text-sm font-semibold text-ink">{diaLargo(f)}</h3>
                  <div className="grid gap-1">
                    {franjas.map((franja) => {
                      const p = porClave.get(clave({ fecha: f, franja }));
                      if (!p) return null;
                      return (
                        <Celda
                          key={franja}
                          fila
                          p={p}
                          activa={clave(p) === clave(seleccionada)}
                          onElegir={() => setElegida(clave(p))}
                        />
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>

            <ul className="mt-4 grid gap-2 border-t border-line pt-3">
              {franjas.map((franja) => {
                const p = pronosticos.find((x) => x.franja === franja)!;
                const c = confianza(p.errorMape);
                return (
                  <li key={franja} className="grid gap-0.5 text-sm">
                    <div className="flex items-center justify-between gap-2 sm:justify-start">
                      <span className="font-medium text-ink">{NOMBRE_FRANJA[franja]}</span>
                      <Etiqueta tono={c.tono}>
                        <c.icono aria-hidden className="size-3.5" strokeWidth={2.4} />
                        {c.texto}
                      </Etiqueta>
                    </div>
                    <span className="text-meta">
                      {ETIQUETA_METODO_PRONOSTICO[p.metodo]} · Error del pronóstico{' '}
                      {Math.round(p.errorMape)} %
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        <Detalle p={seleccionada} />
      </div>

      {planificacion && <GrillaTurnos plan={planificacion} fechas={fechas} franjas={franjas} />}
    </div>
  );
}

function Celda({
  p,
  activa,
  fila = false,
  onElegir,
}: {
  p: PronosticoFranja;
  activa: boolean;
  // En el celular, cada franja es una fila baja; en la grilla, una celda.
  fila?: boolean;
  onElegir(): void;
}) {
  const color = activa
    ? 'border-accent bg-accent-soft'
    : 'border-transparent bg-surface hover:bg-panel';
  const etiqueta = `${diaLargo(p.fecha)}, ${NOMBRE_FRANJA[p.franja]}: ${cubiertos(p.cubiertosEstimados)}`;
  if (fila) {
    return (
      <button
        type="button"
        onClick={onElegir}
        aria-pressed={activa}
        aria-label={etiqueta}
        className={`grid min-h-11 w-full grid-cols-[5.5rem_1fr_auto] items-center gap-2 rounded-control border-2 px-2 py-1 text-left ${color}`}
      >
        <span className="text-sm font-medium text-ink">{NOMBRE_FRANJA[p.franja]}</span>
        <span className="text-[20px] font-semibold text-ink tabular-nums">
          {p.cubiertosEstimados}
        </span>
        <span className="grid text-right text-xs leading-4 text-meta tabular-nums">
          <span>
            entre {p.limiteInferior} y {p.limiteSuperior}
          </span>
          <span>{formatoPesosEnteros(p.ingresoEstimado)}</span>
        </span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onElegir}
      aria-pressed={activa}
      aria-label={etiqueta}
      className={`grid w-full min-w-0 gap-0.5 rounded-control border-2 px-2 py-2 text-left ${color}`}
    >
      <span className="text-[22px] font-semibold leading-7 text-ink tabular-nums">
        {p.cubiertosEstimados}
      </span>
      <span className="text-xs text-meta">
        entre {p.limiteInferior} y {p.limiteSuperior}
      </span>
      <span className="text-sm text-text tabular-nums">
        {formatoPesosEnteros(p.ingresoEstimado)}
      </span>
    </button>
  );
}

function Detalle({ p }: { p: PronosticoFranja }) {
  const platos = [...p.demanda].sort((a, b) => b.cantidad - a.cantidad);
  const maxima = platos[0]?.cantidad ?? 0;
  return (
    <Panel
      titulo={`${diaLargo(p.fecha)} · ${NOMBRE_FRANJA[p.franja]}`}
      className="min-w-0 content-start"
    >
      <p className="text-sm text-text">
        <span className="font-semibold text-ink tabular-nums">
          {cubiertos(p.cubiertosEstimados)}
        </span>{' '}
        <span className="text-meta">
          (entre {p.limiteInferior} y {p.limiteSuperior})
        </span>
      </p>
      <div className="mt-3">
        {platos.length === 0 ? (
          <Vacio icono={TrendingUp} titulo="Sin platos estimados para esta franja" />
        ) : (
          <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
            {platos.map((d) => (
              <li key={d.itemMenuId} className="grid gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 text-ink [overflow-wrap:anywhere]">{d.nombre}</span>
                  <span className="shrink-0 text-meta tabular-nums">{porciones(d.cantidad)}</span>
                </div>
                <div aria-hidden className="h-1.5 rounded-full bg-panel">
                  <div
                    className="h-full rounded-full bg-accent-soft"
                    style={{ width: `${maxima > 0 ? (d.cantidad / maxima) * 100 : 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function ModalRegenerar({
  onCerrar,
  onRegenerado,
}: {
  onCerrar(): void;
  onRegenerado(datos: AsistenteApertura): void;
}) {
  const { enviar, enviando, error } = useGuardar();

  async function confirmar() {
    const r = await enviar<AsistenteApertura>('/apertura/pronostico/regenerar', 'POST');
    if (r) onRegenerado(r.datos);
  }

  return (
    <Modal titulo="¿Regenerar la semana?" onCerrar={onCerrar} ancho="max-w-md">
      <p className="text-sm text-text">
        Se vuelve a calcular el pronóstico con el historial y la configuración actuales, y se
        rehacen los turnos y las alertas de la semana. Lo que había quedado guardado se reemplaza.
      </p>
      <div className="mt-3">
        <Aviso>{error}</Aviso>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton onClick={() => void confirmar()} disabled={enviando}>
          {enviando ? 'Regenerando…' : 'Regenerar'}
        </Boton>
      </div>
    </Modal>
  );
}

function ModalConfirmar({
  plan,
  onCerrar,
  onConfirmada,
}: {
  plan: PlanificacionSemana;
  onCerrar(): void;
  onConfirmada(datos: AsistenteApertura): void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const faltan = cantidadFaltantes(plan);

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      await api(`/apertura/planificacion/${plan.id}/confirmar`, { method: 'POST' });
    } catch (e) {
      // 409: otra sesión confirmó o regeneró a la vez. Se recarga lo vigente, que
      // queda en modo lectura si ya estaba confirmada.
      if (!(e instanceof ApiError && e.status === 409)) {
        setError(e instanceof ApiError ? e.message : 'No se pudo confirmar');
        setEnviando(false);
        return;
      }
    }
    try {
      onConfirmada(await api<AsistenteApertura>('/apertura/pronostico'));
    } catch {
      onCerrar();
    }
    setEnviando(false);
  }

  return (
    <Modal titulo="¿Confirmar los turnos?" onCerrar={onCerrar} ancho="max-w-md">
      <p className="text-sm text-text">
        Los empleados asignados van a ver sus turnos de la semana. Después de confirmar no se pueden
        regenerar.
      </p>
      {faltan > 0 && (
        <p className="mt-2 text-sm font-semibold text-warn">
          {faltan === 1
            ? 'Todavía falta cubrir 1 puesto.'
            : `Todavía faltan cubrir ${faltan} puestos.`}
        </p>
      )}
      <div className="mt-3">
        <Aviso>{error}</Aviso>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton onClick={() => void confirmar()} disabled={enviando}>
          {enviando ? 'Confirmando…' : 'Confirmar turnos'}
        </Boton>
      </div>
    </Modal>
  );
}

type CampoConfiguracion = keyof ConfiguracionApertura;

function ModalConfiguracion({
  onCerrar,
  onGuardado,
}: {
  onCerrar(): void;
  onGuardado(minimoCambio: boolean): void;
}) {
  const config = useRecurso<ConfiguracionApertura>('/apertura/configuracion');
  return (
    <Modal titulo="Configuración" onCerrar={onCerrar} ancho="max-w-md">
      <EstadoCarga cargando={config.cargando && !config.datos} error={config.error} />
      {config.datos && (
        <FormularioConfiguracion
          inicial={config.datos}
          onCerrar={onCerrar}
          onGuardado={onGuardado}
        />
      )}
    </Modal>
  );
}

function FormularioConfiguracion({
  inicial,
  onCerrar,
  onGuardado,
}: {
  inicial: ConfiguracionApertura;
  onCerrar(): void;
  onGuardado(minimoCambio: boolean): void;
}) {
  const [valores, setValores] = useState({
    semanasHistoricoMinimo: String(inicial.semanasHistoricoMinimo),
    cubiertosPorMozo: String(inicial.cubiertosPorMozo),
    platosPorCocineroHora: String(inicial.platosPorCocineroHora),
  });
  const [errores, setErrores] = useState<Partial<Record<CampoConfiguracion, string>>>({});
  const { enviar, enviando, error } = useGuardar();

  const cambiar = (campo: CampoConfiguracion) => (e: { target: { value: string } }) =>
    setValores((v) => ({ ...v, [campo]: e.target.value }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const resultado = configuracionAperturaSchema.safeParse({
      semanasHistoricoMinimo: aNumero(valores.semanasHistoricoMinimo),
      cubiertosPorMozo: aNumero(valores.cubiertosPorMozo),
      platosPorCocineroHora: aNumero(valores.platosPorCocineroHora),
    });
    if (!resultado.success) {
      const nuevos: Partial<Record<CampoConfiguracion, string>> = {};
      for (const issue of resultado.error.issues) {
        const campo = issue.path[0] as CampoConfiguracion;
        nuevos[campo] ??= mensaje(campo, aNumero(valores[campo]), issue.message);
      }
      setErrores(nuevos);
      return;
    }
    setErrores({});
    const r = await enviar('/apertura/configuracion', 'PUT', resultado.data);
    if (r) onGuardado(resultado.data.semanasHistoricoMinimo !== inicial.semanasHistoricoMinimo);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <Campo
        etiqueta="Semanas mínimas de historial"
        ayuda="Entre 5 y 52. Con menos semanas de reservas atendidas no se pronostica."
        error={errores.semanasHistoricoMinimo}
      >
        <input
          {...propsDecimal}
          value={valores.semanasHistoricoMinimo}
          onChange={cambiar('semanasHistoricoMinimo')}
          className={claseInput}
        />
      </Campo>
      <Campo
        etiqueta="Cubiertos que atiende un mozo por franja"
        ayuda="Se usan para planificar los turnos"
        error={errores.cubiertosPorMozo}
      >
        <input
          {...propsDecimal}
          value={valores.cubiertosPorMozo}
          onChange={cambiar('cubiertosPorMozo')}
          className={claseInput}
        />
      </Campo>
      <Campo
        etiqueta="Platos que prepara un cocinero por hora"
        ayuda="Se usan para planificar los turnos"
        error={errores.platosPorCocineroHora}
      >
        <input
          {...propsDecimal}
          value={valores.platosPorCocineroHora}
          onChange={cambiar('platosPorCocineroHora')}
          className={claseInput}
        />
      </Campo>
      <Aviso>{error}</Aviso>
      <div className="flex justify-end gap-2">
        <Boton variante="secundario" onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Boton>
        <Boton type="submit" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </Boton>
      </div>
    </form>
  );
}

// Los mensajes de zod para números vacíos o inválidos no están pensados para la pantalla.
function mensaje(campo: CampoConfiguracion, valor: number, original: string): string {
  if (Number.isNaN(valor)) return 'Ingresá un número';
  if (campo === 'semanasHistoricoMinimo') return 'Ingresá un número entero entre 5 y 52';
  return original.includes('mayor que 0') ? original : 'Ingresá un número mayor que 0 y hasta 999';
}
