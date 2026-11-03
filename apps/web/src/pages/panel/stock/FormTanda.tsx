import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, ChefHat, Plus, X } from 'lucide-react';
import {
  CONVERSION,
  ETIQUETA_UNIDAD,
  unidadesCompatibles,
  type ComponenteStock,
  type PlanTanda,
  type TandaDetalle,
  type TandaInput,
  type UnidadBase,
  type UnidadMedida,
} from '@pgim/shared';
import {
  Aviso,
  Boton,
  Campo,
  Etiqueta,
  Vacio,
  claseInput,
  propsDecimal,
} from '../../../components/ui';
import { ApiError, api } from '../../../lib/api';
import { aNumero, formatoCantidadLegible } from '../../../lib/formato';
import { useGuardar } from '../../../lib/useGuardar';
import { DetalleTanda } from './DetalleTanda';
import { formatoDiferencia } from './tanda';

// Se usa de pie en la cocina: todos los controles a 48 px.
const claseTactil = claseInput.replace('min-h-11', 'min-h-12').replace('sm:min-h-9', 'sm:min-h-12');

interface FilaConsumo {
  componenteId: string;
  nombre: string;
  unidadBase: UnidadBase;
  // null si el componente se agregó a mano y no está en la receta.
  teorica: number | null;
  existencia: number;
  usada: string;
}

const COLUMNAS = 'sm:grid-cols-[minmax(0,1.5fr)_8rem_10rem_minmax(0,12rem)_3rem]';

// Lo usado se precarga redondeado: sin decimales en g y ml, con dos en unidades.
const textoUsado = (n: number, unidad: UnidadBase) => {
  const decimales = unidad === 'UNIDAD' ? 2 : 0;
  const factor = 10 ** decimales;
  return String(Math.round(n * factor) / factor).replace('.', ',');
};

export function FormTanda({
  preparaciones,
  componentes,
  onVolver,
  onRegistrada,
}: {
  // Preparaciones que llevan stock.
  preparaciones: ComponenteStock[];
  // Todo lo que tiene stock, para sumar componentes a la tabla.
  componentes: ComponenteStock[];
  onVolver(): void;
  onRegistrada(): void;
}) {
  const [intermedioId, setIntermedioId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState<UnidadMedida | ''>('');
  const [plan, setPlan] = useState<PlanTanda | null>(null);
  const [filas, setFilas] = useState<FilaConsumo[]>([]);
  const [obtenido, setObtenido] = useState('');
  const [observacion, setObservacion] = useState('');
  const [calculando, setCalculando] = useState(false);
  const [errorPlan, setErrorPlan] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const [registrada, setRegistrada] = useState<TandaDetalle | null>(null);
  const guardar = useGuardar();

  const preparacion = preparaciones.find((p) => p.id === intermedioId);
  const unidades = preparacion ? unidadesCompatibles(preparacion.unidadBase) : [];

  function elegirPreparacion(id: string) {
    setIntermedioId(id);
    const p = preparaciones.find((x) => x.id === id);
    // Arranca en kg o l, la unidad con la que se lee una tanda.
    const compatibles = p ? unidadesCompatibles(p.unidadBase) : [];
    setUnidad(compatibles[compatibles.length - 1] ?? '');
    descartarPlan();
  }

  // Cambiar los datos de arranque invalida lo calculado.
  function descartarPlan() {
    setPlan(null);
    setFilas([]);
    setErrorPlan(null);
    setErrorLocal(null);
  }

  async function calcular() {
    const n = aNumero(cantidad);
    if (!preparacion || unidad === '' || !(n > 0)) {
      setErrorPlan('Elegí la preparación e indicá cuánto vas a hacer');
      return;
    }
    setCalculando(true);
    setErrorPlan(null);
    try {
      const q = new URLSearchParams({ intermedioId, cantidad: String(n), unidad });
      const respuesta = await api<PlanTanda>(`/stock/produccion/plan?${q}`);
      setPlan(respuesta);
      setFilas(
        respuesta.consumos.map((c) => ({
          componenteId: c.componente.id,
          nombre: c.componente.nombre,
          unidadBase: c.componente.unidadBase,
          teorica: c.teorica,
          existencia: c.existencia,
          usada: textoUsado(c.teorica, c.componente.unidadBase),
        })),
      );
    } catch (e) {
      setErrorPlan(e instanceof ApiError ? e.message : 'No se pudo calcular la tanda');
    } finally {
      setCalculando(false);
    }
  }

  const sumables = componentes.filter(
    (c) => c.id !== intermedioId && !filas.some((f) => f.componenteId === c.id),
  );

  function agregar(id: string) {
    const c = componentes.find((x) => x.id === id);
    if (!c) return;
    setFilas((fs) => [
      ...fs,
      {
        componenteId: c.id,
        nombre: c.nombre,
        unidadBase: c.unidadBase,
        teorica: null,
        existencia: c.existencia,
        usada: '',
      },
    ]);
  }

  const cambiarUsada = (id: string, usada: string) =>
    setFilas((fs) => fs.map((f) => (f.componenteId === id ? { ...f, usada } : f)));
  const quitar = (id: string) => setFilas((fs) => fs.filter((f) => f.componenteId !== id));

  const factor = unidad === '' ? 1 : CONVERSION[unidad].factor;
  const esperadoEnUnidad = plan ? plan.esperada / factor : 0;

  async function registrar(e: FormEvent) {
    e.preventDefault();
    if (!plan || unidad === '') return;
    setErrorLocal(null);
    const consumos = filas.map((f) => ({
      componenteId: f.componenteId,
      cantidad: aNumero(f.usada),
      unidad: f.unidadBase,
    }));
    if (consumos.length === 0) {
      setErrorLocal('Dejá al menos un componente usado');
      return;
    }
    if (consumos.some((c) => !(c.cantidad > 0))) {
      setErrorLocal('Indicá cuánto se usó de cada componente, o quitá el que no usaste');
      return;
    }
    const obtenida = aNumero(obtenido);
    if (!(obtenida > 0)) {
      setErrorLocal('Indicá cuánto se obtuvo');
      return;
    }
    const cuerpo: TandaInput = {
      intermedioId,
      cantidadPlaneada: aNumero(cantidad),
      unidad,
      cantidadObtenida: obtenida,
      consumos,
      ...(observacion.trim() && { observacion: observacion.trim() }),
    };
    const r = await guardar.enviar<TandaDetalle>('/stock/produccion', 'POST', cuerpo);
    if (r) {
      setRegistrada(r.datos);
      onRegistrada();
    }
  }

  function otra() {
    setRegistrada(null);
    setIntermedioId('');
    setCantidad('');
    setUnidad('');
    setObtenido('');
    setObservacion('');
    descartarPlan();
  }

  const volver = (
    <Boton variante="fantasma" densidad="tactil" onClick={onVolver} className="-ml-4">
      <ArrowLeft aria-hidden className="size-4" />
      Volver a las tandas
    </Boton>
  );

  if (registrada) {
    return (
      <div className="space-y-4">
        <Aviso tono="ok">
          Tanda registrada. Si te equivocaste, corregilo con un ajuste de cada componente.
        </Aviso>
        <DetalleTanda tanda={registrada} unidadBase={preparacion?.unidadBase} />
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" densidad="tactil" onClick={otra}>
            Registrar otra
          </Boton>
          <Boton variante="fantasma" densidad="tactil" onClick={onVolver}>
            Ver las tandas
          </Boton>
        </div>
      </div>
    );
  }

  if (preparaciones.length === 0) {
    return (
      <div className="space-y-4">
        {volver}
        <Vacio
          icono={ChefHat}
          titulo="Ninguna preparación se produce por tandas"
          texto="Para registrar una tanda, activá “Lleva stock (se produce por tandas)” en la receta de la preparación."
          accion={
            <Link
              to="/panel/recetas"
              className="text-sm font-medium text-accent-ink underline underline-offset-2"
            >
              Ir a Recetas
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {volver}

      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Campo etiqueta="Preparación">
          <select
            value={intermedioId}
            onChange={(e) => elegirPreparacion(e.target.value)}
            className={claseTactil}
          >
            <option value="">Elegí una preparación</option>
            {preparaciones.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Cantidad a preparar">
          <input
            {...propsDecimal}
            value={cantidad}
            onChange={(e) => {
              setCantidad(e.target.value);
              descartarPlan();
            }}
            className={claseTactil}
          />
        </Campo>
        <Campo etiqueta="Unidad">
          <select
            value={unidad}
            disabled={!preparacion}
            onChange={(e) => {
              setUnidad(e.target.value as UnidadMedida);
              descartarPlan();
            }}
            className={claseTactil}
          >
            {unidades.map((u) => (
              <option key={u} value={u}>
                {ETIQUETA_UNIDAD[u]}
              </option>
            ))}
          </select>
        </Campo>
        <Boton
          variante="secundario"
          densidad="tactil"
          onClick={calcular}
          disabled={calculando || !preparacion}
        >
          {calculando ? 'Calculando…' : 'Calcular'}
        </Boton>
      </div>
      <Aviso>{errorPlan}</Aviso>

      {plan && (
        <form onSubmit={registrar} className="space-y-5">
          <div>
            <h2 className="mb-2 text-lg font-semibold text-ink">Consumos</h2>
            <div className="overflow-hidden rounded-panel border border-line bg-surface">
              <div
                aria-hidden
                className={`hidden gap-x-4 border-b border-line px-3 py-1.5 text-xs text-meta sm:grid ${COLUMNAS}`}
              >
                <span>Componente</span>
                <span>Receta</span>
                <span>Hay</span>
                <span>Usado</span>
                <span />
              </div>
              <ul className="divide-y divide-line">
                {filas.map((f) => {
                  const usada = aNumero(f.usada);
                  const dif =
                    f.teorica !== null && !Number.isNaN(usada)
                      ? formatoDiferencia(usada - f.teorica, f.unidadBase)
                      : '';
                  const noAlcanza = usada > f.existencia;
                  return (
                    <li
                      key={f.componenteId}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 p-3 sm:items-center ${COLUMNAS}`}
                    >
                      <span className="font-medium text-ink [overflow-wrap:anywhere]">
                        {f.nombre}
                      </span>
                      <Boton
                        variante="fantasma"
                        densidad="tactil"
                        aria-label={`Quitar ${f.nombre}`}
                        onClick={() => quitar(f.componenteId)}
                        className="-my-1 sm:col-start-5 sm:row-start-1 sm:my-0"
                      >
                        <X aria-hidden className="size-5" />
                      </Boton>
                      <div className="col-span-2 flex items-baseline justify-between gap-2 text-sm sm:contents">
                        <span className="tabular-nums text-text">
                          <span className="text-meta sm:hidden">Receta </span>
                          {f.teorica === null
                            ? '—'
                            : formatoCantidadLegible(f.teorica, f.unidadBase)}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 tabular-nums text-meta">
                          <span className="sm:hidden">Hay </span>
                          {formatoCantidadLegible(f.existencia, f.unidadBase)}
                          {noAlcanza && <Etiqueta tono="bad">No alcanza</Etiqueta>}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <div className="flex items-center gap-2">
                          <input
                            {...propsDecimal}
                            aria-label={`Usado de ${f.nombre}`}
                            value={f.usada}
                            onChange={(e) => cambiarUsada(f.componenteId, e.target.value)}
                            className={claseTactil}
                          />
                          <span className="w-8 shrink-0 text-sm text-meta">
                            {ETIQUETA_UNIDAD[f.unidadBase]}
                          </span>
                        </div>
                        {dif && <p className="mt-1 text-xs tabular-nums text-meta">{dif}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
            {sumables.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Plus aria-hidden className="size-4 text-accent-ink" />
                <select
                  aria-label="Agregar componente"
                  value=""
                  onChange={(e) => agregar(e.target.value)}
                  className={`${claseTactil} max-w-xs border-accent/20 bg-accent-soft text-accent-ink`}
                >
                  <option value="">Agregar componente</option>
                  {sumables.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-panel bg-panel p-4">
            <div className="grid items-end gap-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-text">Esperado</p>
                <p className="flex min-h-12 items-center text-lg font-semibold tabular-nums text-ink">
                  {`${esperadoEnUnidad.toLocaleString('es-AR', { maximumFractionDigits: 3 })} ${
                    unidad === '' ? '' : ETIQUETA_UNIDAD[unidad]
                  }`}
                </p>
              </div>
              <Campo etiqueta={`Obtenido (${unidad === '' ? '' : ETIQUETA_UNIDAD[unidad]})`}>
                <input
                  {...propsDecimal}
                  value={obtenido}
                  onChange={(e) => setObtenido(e.target.value)}
                  className={claseTactil}
                />
              </Campo>
            </div>
            <Campo etiqueta="Observación (opcional)">
              <textarea
                rows={2}
                maxLength={200}
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                className={`${claseTactil} py-2`}
              />
            </Campo>
            <Aviso>{errorLocal ?? guardar.error}</Aviso>
            <div className="flex sm:justify-end">
              <Boton
                type="submit"
                densidad="tactil"
                disabled={guardar.enviando}
                className="w-full sm:w-auto"
              >
                {guardar.enviando ? 'Registrando…' : 'Registrar tanda'}
              </Boton>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
