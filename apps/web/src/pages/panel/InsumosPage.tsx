import { useState, type FormEvent } from 'react';
import { UNIDADES_BASE, type Insumo, type InsumoInput, type UnidadBase } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { Lista } from '../../components/Lista';
import {
  Aviso,
  Boton,
  Campo,
  Casilla,
  EncabezadoPagina,
  EstadoCarga,
  Etiqueta,
  Modal,
  claseInput,
  propsDecimal,
} from '../../components/ui';
import { NOMBRE_UNIDAD, aNumero, formatoCantidad, formatoPesos } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';
import { useConfirmar } from '../../components/Confirmacion';

const COSTO_POR: Record<UnidadBase, string> = {
  GRAMO: 'por gramo',
  MILILITRO: 'por mililitro',
  UNIDAD: 'por unidad',
};

// Insumos del restaurante con su stock en la sucursal de trabajo.
export function InsumosPage() {
  const { sesion, tienePermiso } = useSesion();
  // La ruta incluye la sucursal para recargar el stock al cambiarla.
  const sucursal = sesion?.sucursalActiva;
  const { datos, cargando, error, recargar } = useRecurso<Insumo[]>(
    `/insumos?sucursal=${sucursal?.id ?? ''}`,
  );
  const [editando, setEditando] = useState<Insumo | 'nuevo' | null>(null);
  const baja = useGuardar();

  function guardado() {
    setEditando(null);
    recargar();
  }

  const confirmar = useConfirmar();

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

  return (
    <section>
      <EncabezadoPagina
        titulo="Insumos"
        descripcion={`Catálogo del restaurante. El stock es el de ${sucursal?.nombre ?? 'la sucursal de trabajo'}.`}
        accion={
          tienePermiso('insumo.crear') && (
            <Boton onClick={() => setEditando('nuevo')}>Nuevo insumo</Boton>
          )
        }
      />
      <EstadoCarga cargando={cargando && !datos} error={error} />
      <div className="mb-3">
        <Aviso>{baja.error}</Aviso>
      </div>
      {datos && (
        <Lista
          filas={datos}
          clave={(i) => i.id}
          inactiva={(i) => !i.activo}
          columnas={[
            {
              titulo: 'Insumo',
              valor: (i) => (
                <span>
                  {i.nombre} {!i.activo && <Etiqueta>Dado de baja</Etiqueta>}
                </span>
              ),
            },
            { titulo: 'Unidad base', valor: (i) => NOMBRE_UNIDAD[i.unidadBase] },
            {
              titulo: 'Costo por unidad',
              valor: (i) => (i.costoCompra === null ? '—' : formatoPesos(i.costoCompra)),
            },
            {
              titulo: `Stock ${sucursal?.nombre ?? ''}`.trim(),
              valor: (i) => formatoCantidad(i.stock, i.unidadBase),
            },
          ]}
          acciones={(i) => (
            <span className="inline-flex flex-wrap justify-end gap-x-6 gap-y-2">
              {tienePermiso('insumo.editar') && (
                <Boton variante="secundario" onClick={() => setEditando(i)}>
                  Editar
                </Boton>
              )}
              {tienePermiso('insumo.eliminar') && i.activo && (
                <Boton variante="peligro" onClick={() => darDeBaja(i)}>
                  Dar de baja
                </Boton>
              )}
            </span>
          )}
        />
      )}

      {editando && (
        <FormularioInsumo
          insumo={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={guardado}
        />
      )}
    </section>
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
    insumo?.costoCompra === null || !insumo ? '' : String(insumo.costoCompra),
  );
  const [activo, setActivo] = useState(insumo?.activo ?? true);
  const { enviar, enviando, error } = useGuardar();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: InsumoInput = {
      nombre,
      unidadBase,
      costoCompra: aNumero(costo),
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
