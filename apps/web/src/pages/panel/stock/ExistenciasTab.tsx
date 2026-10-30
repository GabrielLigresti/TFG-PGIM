import { useState, type FormEvent } from 'react';
import {
  UNIDADES_BASE,
  type ComponenteStock,
  type Insumo,
  type InsumoInput,
  type UnidadBase,
} from '@pgim/shared';
import { useSesion } from '../../../auth/SesionProvider';
import { useConfirmar } from '../../../components/Confirmacion';
import { Lista } from '../../../components/Lista';
import {
  Aviso,
  Boton,
  Campo,
  Casilla,
  EstadoCarga,
  Etiqueta,
  Modal,
  claseInput,
  propsDecimal,
} from '../../../components/ui';
import { NOMBRE_UNIDAD, aNumero, formatoCantidadLegible, formatoPesos } from '../../../lib/formato';
import { useGuardar } from '../../../lib/useGuardar';
import { useRecurso } from '../../../lib/useRecurso';
import { FormMovimiento, type TipoFormulario } from './FormMovimiento';

const COSTO_POR: Record<UnidadBase, string> = {
  GRAMO: 'por gramo',
  MILILITRO: 'por mililitro',
  UNIDAD: 'por unidad',
};

const POR_UNIDAD: Record<UnidadBase, string> = { GRAMO: 'g', MILILITRO: 'ml', UNIDAD: 'unidad' };

// Insumos y preparaciones con stock en la sucursal de trabajo, con el ABM del catálogo.
export function ExistenciasTab() {
  const { sesion, tienePermiso } = useSesion();
  // La ruta incluye la sucursal para recargar el stock al cambiarla.
  const sucursal = sesion?.sucursalActiva;
  const sucursalId = sucursal?.id ?? '';
  const stock = useRecurso<ComponenteStock[]>(`/stock?sucursal=${sucursalId}`);
  // El catálogo solo hace falta para editar un insumo.
  const catalogo = useRecurso<Insumo[]>(
    tienePermiso('insumo.ver') ? `/insumos?sucursal=${sucursalId}` : null,
  );
  const [editando, setEditando] = useState<Insumo | 'nuevo' | null>(null);
  const [movimiento, setMovimiento] = useState<{
    tipo: TipoFormulario;
    componente: ComponenteStock;
  } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const baja = useGuardar();
  const confirmar = useConfirmar();
  const puedeRegistrar = tienePermiso('stock.registrar');

  function guardado() {
    setEditando(null);
    stock.recargar();
    catalogo.recargar();
  }

  async function darDeBaja(insumo: Insumo) {
    if (
      !(await confirmar({
        mensaje: `¿Dar de baja ${insumo.nombre}?`,
        detalle: 'Deja de estar disponible para nuevas recetas. Su historial se conserva.',
        accion: 'Dar de baja',
      }))
    )
      return;
    if (await baja.enviar(`/insumos/${insumo.id}`, 'DELETE')) guardado();
  }

  const insumoDe = (id: string) => catalogo.datos?.find((i) => i.id === id);

  return (
    <div className="space-y-3">
      {tienePermiso('insumo.crear') && (
        <div className="flex justify-end">
          <Boton onClick={() => setEditando('nuevo')}>Nuevo insumo</Boton>
        </div>
      )}
      <EstadoCarga cargando={stock.cargando && !stock.datos} error={stock.error} />
      <Aviso tono="ok">{aviso}</Aviso>
      <Aviso>{baja.error}</Aviso>
      {stock.datos && (
        <Lista
          filas={stock.datos}
          clave={(c) => c.id}
          inactiva={(c) => !c.activo}
          columnas={[
            {
              titulo: 'Componente',
              valor: (c) => (
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  {c.nombre}
                  {c.tipo === 'INTERMEDIO' && <Etiqueta>Preparación</Etiqueta>}
                  {!c.activo && <Etiqueta>Dado de baja</Etiqueta>}
                </span>
              ),
            },
            {
              titulo: `Existencia ${sucursal?.nombre ?? ''}`.trim(),
              valor: (c) => formatoCantidadLegible(c.existencia, c.unidadBase),
              className: 'tabular-nums',
            },
            {
              titulo: 'Costo vigente',
              valor: (c) =>
                c.costoCompraVigente === null
                  ? '—'
                  : `${formatoPesos(c.costoCompraVigente)} por ${POR_UNIDAD[c.unidadBase]}`,
              className: 'whitespace-nowrap tabular-nums',
            },
          ]}
          acciones={(c) => {
            const insumo = c.tipo === 'INSUMO' ? insumoDe(c.id) : undefined;
            return (
              <span className="inline-flex flex-wrap justify-end gap-x-2 gap-y-2">
                {puedeRegistrar && c.activo && (
                  <>
                    {c.tipo === 'INSUMO' && (
                      <Boton
                        variante="tonal"
                        onClick={() => setMovimiento({ tipo: 'INGRESO', componente: c })}
                      >
                        Ingreso
                      </Boton>
                    )}
                    <Boton
                      variante="tonal"
                      onClick={() => setMovimiento({ tipo: 'MERMA', componente: c })}
                    >
                      Merma
                    </Boton>
                    <Boton
                      variante="tonal"
                      onClick={() => setMovimiento({ tipo: 'AJUSTE', componente: c })}
                    >
                      Ajuste
                    </Boton>
                  </>
                )}
                {insumo && tienePermiso('insumo.editar') && (
                  <Boton variante="secundario" onClick={() => setEditando(insumo)}>
                    Editar
                  </Boton>
                )}
                {insumo && tienePermiso('insumo.eliminar') && insumo.activo && (
                  <Boton variante="peligro" onClick={() => darDeBaja(insumo)}>
                    Dar de baja
                  </Boton>
                )}
              </span>
            );
          }}
        />
      )}

      {editando && (
        <FormularioInsumo
          insumo={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={guardado}
        />
      )}
      {movimiento && (
        <FormMovimiento
          tipo={movimiento.tipo}
          componente={movimiento.componente}
          onCerrar={() => setMovimiento(null)}
          onRegistrado={(texto) => {
            setMovimiento(null);
            setAviso(texto);
            stock.recargar();
          }}
        />
      )}
    </div>
  );
}

function FormularioInsumo({
  insumo,
  onCerrar,
  onGuardado,
}: {
  insumo: Insumo | null;
  onCerrar(): void;
  onGuardado(): void;
}) {
  const [nombre, setNombre] = useState(insumo?.nombre ?? '');
  const [unidadBase, setUnidadBase] = useState<UnidadBase>(insumo?.unidadBase ?? 'GRAMO');
  const [costo, setCosto] = useState(
    insumo?.costoCompraVigente === null || !insumo ? '' : String(insumo.costoCompraVigente),
  );
  const [activo, setActivo] = useState(insumo?.activo ?? true);
  const { enviar, enviando, error } = useGuardar();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: InsumoInput = {
      nombre,
      unidadBase,
      costoCompraVigente: aNumero(costo),
      ...(insumo && { activo }),
    };
    const respuesta = insumo
      ? await enviar(`/insumos/${insumo.id}`, 'PUT', datos)
      : await enviar('/insumos', 'POST', datos);
    if (respuesta) onGuardado();
  }

  return (
    <Modal titulo={insumo ? `Editar ${insumo.nombre}` : 'Nuevo insumo'} onCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Campo etiqueta="Nombre">
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Unidad base" ayuda="El stock y las recetas se calculan en esta unidad">
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
        <Campo etiqueta={`Costo de compra ${COSTO_POR[unidadBase]}`} ayuda="En pesos">
          <input
            {...propsDecimal}
            required
            value={costo}
            onChange={(e) => setCosto(e.target.value)}
            className={claseInput}
          />
        </Campo>
        {insumo && <Casilla etiqueta="Insumo activo" checked={activo} onChange={setActivo} />}

        <Aviso>{error}</Aviso>
        <div className="flex justify-end gap-2">
          <Boton variante="secundario" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
