import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  CONVERSION,
  UNIDADES_BASE,
  unidadesCompatibles,
  type ComponenteReceta,
  type ErrorReceta,
  type IntermedioAlta,
  type RecetaDetalle,
  type RecetaInput,
  type UnidadBase,
  type UnidadMedida,
} from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { Aviso, Boton, Campo, EstadoCarga, claseInput, propsDecimal } from '../../components/ui';
import { NOMBRE_UNIDAD, aNumero, formatoCantidad, formatoPesos } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';
import { useConfirmar } from '../../components/Confirmacion';

interface LineaFormulario {
  clave: number;
  componenteId: string;
  cantidad: string;
  unidad: UnidadMedida;
  merma: string;
}

let siguienteClave = 0;

// Pantalla del CU-07. Rutas: /panel/recetas/plato/:id, /panel/recetas/intermedio/:id
// y /panel/recetas/intermedio/nuevo (flujo A).
export function RecetaEditorPage() {
  const { tipo, id } = useParams<{ tipo: 'plato' | 'intermedio'; id: string }>();
  const esNuevo = tipo === 'intermedio' && id === 'nuevo';
  const componentes = useRecurso<ComponenteReceta[]>('/recetas/componentes');
  const detalle = useRecurso<RecetaDetalle>(esNuevo ? null : `/recetas/${tipo}/${id}`);

  const listo = componentes.datos && (esNuevo || detalle.datos);
  return (
    <section>
      <Link to="/panel/recetas" className="inline-block py-2 text-sm text-meta hover:text-text">
        ← Volver a recetas
      </Link>
      <EstadoCarga
        cargando={!listo && (componentes.cargando || detalle.cargando)}
        error={componentes.error ?? detalle.error}
      />
      {listo && (
        <Editor
          key={`${tipo}-${id}`}
          tipo={tipo === 'plato' ? 'plato' : 'intermedio'}
          detalle={esNuevo ? null : detalle.datos}
          componentes={componentes.datos!}
        />
      )}
    </section>
  );
}

function Editor({
  tipo,
  detalle: inicial,
  componentes,
}: {
  tipo: 'plato' | 'intermedio';
  detalle: RecetaDetalle | null;
  componentes: ComponenteReceta[];
}) {
  const { tienePermiso } = useSesion();
  const navigate = useNavigate();
  const [detalle, setDetalle] = useState(inicial);
  const receta = detalle?.receta ?? null;
  const [nombre, setNombre] = useState('');
  const [unidadBase, setUnidadBase] = useState<UnidadBase>('GRAMO');
  const [lineas, setLineas] = useState<LineaFormulario[]>(() =>
    (receta?.lineas ?? []).map((l) => ({
      clave: siguienteClave++,
      componenteId: l.componenteId,
      cantidad: String(l.cantidad),
      unidad: l.unidad,
      merma: String(l.porcentajeMerma),
    })),
  );
  const [rendimiento, setRendimiento] = useState(
    receta ? String(receta.rendimiento) : tipo === 'plato' ? '1' : '',
  );
  const [instrucciones, setInstrucciones] = useState(receta?.instrucciones ?? '');
  const [guardada, setGuardada] = useState(false);
  const guardar = useGuardar();
  const borrar = useGuardar();

  const esNuevo = detalle === null;
  const puedeGuardar = tienePermiso(receta ? 'receta.editar' : 'receta.crear');
  const porId = new Map(componentes.map((c) => [c.id, c]));
  // Un intermedio no se puede usar en su propia receta.
  const disponibles = componentes.filter((c) => c.id !== detalle?.dueno.id);
  const erroresPorLinea = new Map<number, string>();
  const erroresGenerales: string[] = [];
  for (const e of (Array.isArray(guardar.detalles) ? guardar.detalles : []) as ErrorReceta[]) {
    if (typeof e?.mensaje !== 'string') continue;
    if (e.linea === null) erroresGenerales.push(e.mensaje);
    else erroresPorLinea.set(e.linea, e.mensaje);
  }

  // Estimación en vivo; el costo guardado lo calcula la API.
  const costoEstimado = lineas.reduce((total, l) => {
    const componente = porId.get(l.componenteId);
    const cantidad = aNumero(l.cantidad);
    const merma = aNumero(l.merma || '0');
    if (!componente || !(cantidad > 0) || !(merma >= 0 && merma < 100)) return total;
    const bruta = (cantidad * CONVERSION[l.unidad].factor) / (1 - merma / 100);
    return total + bruta * componente.costoUnitario;
  }, 0);
  const rinde = aNumero(rendimiento);

  function cambiarLinea(clave: number, cambios: Partial<LineaFormulario>) {
    setGuardada(false);
    setLineas((actual) => actual.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  }

  function elegirComponente(clave: number, componenteId: string) {
    const componente = porId.get(componenteId);
    cambiarLinea(clave, { componenteId, ...(componente && { unidad: componente.unidadBase }) });
  }

  function agregarLinea() {
    setLineas((actual) => [
      ...actual,
      { clave: siguienteClave++, componenteId: '', cantidad: '', unidad: 'GRAMO', merma: '0' },
    ]);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: RecetaInput = {
      lineas: lineas.map((l) => ({
        componenteId: l.componenteId,
        cantidad: aNumero(l.cantidad),
        unidad: l.unidad,
        porcentajeMerma: aNumero(l.merma || '0'),
      })),
      rendimiento: aNumero(rendimiento),
      instrucciones: instrucciones || null,
    };
    if (lineas.some((l) => !l.componenteId)) {
      guardar.setError('Elegí el componente de cada línea');
      return;
    }
    if (tipo === 'intermedio' && esNuevo) {
      const nuevo = await guardar.enviar<RecetaDetalle>('/recetas/intermedios', 'POST', {
        nombre,
        unidadBase,
        receta: datos,
      } satisfies IntermedioAlta);
      if (nuevo) navigate(`/panel/recetas/intermedio/${nuevo.datos.dueno.id}`, { replace: true });
      return;
    }
    const respuesta = await guardar.enviar<RecetaDetalle>(
      `/recetas/${tipo}/${detalle!.dueno.id}`,
      'PUT',
      datos,
    );
    if (respuesta) {
      setDetalle(respuesta.datos);
      setGuardada(true);
    }
  }

  const confirmar = useConfirmar();

  async function borrarReceta() {
    if (!detalle) return;
    const ok = await confirmar({
      mensaje: `¿Borrar la receta de ${detalle.dueno.nombre}?`,
      detalle:
        'Si su categoría exige receta, el plato deja de mostrarse en el menú. No se puede deshacer.',
      accion: 'Borrar receta',
    });
    if (!ok) return;
    if (await borrar.enviar(`/recetas/plato/${detalle.dueno.id}`, 'DELETE')) {
      navigate('/panel/recetas');
    }
  }

  const titulo = esNuevo ? 'Nueva preparación' : `Receta de ${detalle.dueno.nombre}`;
  const unidadRendimiento =
    tipo === 'plato'
      ? 'porciones'
      : NOMBRE_UNIDAD[esNuevo ? unidadBase : (detalle.dueno.unidadBase ?? 'GRAMO')];

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink">{titulo}</h1>
        <p className="text-sm text-meta">
          {tipo === 'plato'
            ? 'La cantidad bruta que se descuenta del stock es la neta ÷ (1 − merma).'
            : 'El costo por unidad de la preparación es el costo de la receta ÷ lo que rinde.'}
        </p>
      </div>

      {esNuevo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre de la preparación">
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Unidad base">
            <select
              value={unidadBase}
              onChange={(e) => setUnidadBase(e.target.value as UnidadBase)}
              className={claseInput}
            >
              {UNIDADES_BASE.map((u) => (
                <option key={u} value={u}>
                  {NOMBRE_UNIDAD[u]}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      )}

      <fieldset disabled={!puedeGuardar} className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-text">Líneas</legend>
        {lineas.length === 0 && (
          <p className="text-sm text-meta">La receta todavía no tiene líneas.</p>
        )}
        {lineas.map((l, indice) => {
          const componente = porId.get(l.componenteId);
          const unidades = componente ? unidadesCompatibles(componente.unidadBase) : [];
          const error = erroresPorLinea.get(indice);
          return (
            <div
              key={l.clave}
              className={`rounded-control border bg-surface p-3 ${error ? 'border-bad/30' : 'border-line'}`}
            >
              <div className="grid gap-2 sm:grid-cols-[1fr_7rem_9rem_6rem_auto] sm:items-end">
                <Campo etiqueta="Componente">
                  <select
                    required
                    value={l.componenteId}
                    onChange={(e) => elegirComponente(l.clave, e.target.value)}
                    className={claseInput}
                  >
                    <option value="" disabled>
                      Elegí un insumo o una preparación
                    </option>
                    <optgroup label="Insumos">
                      {disponibles
                        .filter((c) => c.tipo === 'INSUMO')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Preparaciones">
                      {disponibles
                        .filter((c) => c.tipo === 'INTERMEDIO')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                </Campo>
                <Campo etiqueta="Cantidad">
                  <input
                    {...propsDecimal}
                    required
                    value={l.cantidad}
                    onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                    className={claseInput}
                  />
                </Campo>
                <Campo etiqueta="Unidad">
                  <select
                    value={l.unidad}
                    onChange={(e) =>
                      cambiarLinea(l.clave, { unidad: e.target.value as UnidadMedida })
                    }
                    className={claseInput}
                  >
                    {(unidades.length > 0 ? unidades : [l.unidad]).map((u) => (
                      <option key={u} value={u}>
                        {NOMBRE_UNIDAD[u]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo etiqueta="Merma %">
                  <input
                    {...propsDecimal}
                    value={l.merma}
                    onChange={(e) => cambiarLinea(l.clave, { merma: e.target.value })}
                    className={claseInput}
                  />
                </Campo>
                <Boton
                  variante="peligro"
                  aria-label={`Quitar línea ${indice + 1}`}
                  onClick={() => setLineas((actual) => actual.filter((x) => x.clave !== l.clave))}
                >
                  Quitar
                </Boton>
              </div>
              {error && <p className="mt-2 text-sm text-bad">{error}</p>}
            </div>
          );
        })}
        <Boton variante="secundario" onClick={agregarLinea}>
          Agregar línea
        </Boton>
      </fieldset>

      <fieldset disabled={!puedeGuardar} className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Campo etiqueta={`Rendimiento (${unidadRendimiento})`}>
          <input
            {...propsDecimal}
            required
            value={rendimiento}
            onChange={(e) => setRendimiento(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Instrucciones">
          <textarea
            rows={3}
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            className={claseInput}
          />
        </Campo>
      </fieldset>

      <div className="rounded-panel border border-line bg-surface p-4 text-sm">
        <p className="font-medium text-ink">Costo</p>
        <p className="text-meta">
          Estimado: {formatoPesos(costoEstimado)} en total
          {rinde > 0 &&
            ` · ${formatoPesos(costoEstimado / rinde)} por ${tipo === 'plato' ? 'porción' : 'unidad'}`}
        </p>
        {receta && (
          <>
            <p className="text-meta">
              Guardado: {formatoPesos(receta.costoTotal)} en total ·{' '}
              {formatoPesos(receta.costoPorPorcion)} por {tipo === 'plato' ? 'porción' : 'unidad'}
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-meta">
              {receta.lineas.map((l) => (
                <li key={l.componenteId}>
                  {l.componente}: descuenta{' '}
                  {formatoCantidad(
                    l.cantidadBruta,
                    porId.get(l.componenteId)?.unidadBase ?? l.unidad,
                  )}{' '}
                  · {formatoPesos(l.costo)}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="space-y-2">
        {erroresGenerales.map((m) => (
          <Aviso key={m}>{m}</Aviso>
        ))}
        {erroresGenerales.length === 0 && <Aviso>{guardar.error}</Aviso>}
        <Aviso>{borrar.error}</Aviso>
        {guardada && (
          <p role="status" className="rounded-control bg-ok-soft px-3 py-2 text-sm text-ok">
            Receta guardada.
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-between gap-2">
        <div>
          {tipo === 'plato' && receta && tienePermiso('receta.eliminar') && (
            <Boton variante="peligro" onClick={borrarReceta}>
              Borrar receta
            </Boton>
          )}
        </div>
        {puedeGuardar && (
          <Boton type="submit" disabled={guardar.enviando}>
            {guardar.enviando ? 'Guardando…' : 'Guardar receta'}
          </Boton>
        )}
      </div>
    </form>
  );
}
