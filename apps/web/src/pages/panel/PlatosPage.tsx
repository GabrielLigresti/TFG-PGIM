import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Categoria, CategoriaInput, Insumo, Plato, PlatoInput } from '@pgim/shared';
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
import { aNumero, formatoPesos } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';
import { ModeloRaModal } from './ModeloRaModal';
import { useConfirmar } from '../../components/Confirmacion';

// CU-16: platos (con su modelo RA) y categorías. Los menús van en su propia pantalla.
export function PlatosPage() {
  const { tienePermiso } = useSesion();
  const platos = useRecurso<Plato[]>('/platos');
  const categorias = useRecurso<Categoria[]>('/categorias');
  const [plato, setPlato] = useState<Plato | 'nuevo' | null>(null);
  const [categoria, setCategoria] = useState<Categoria | 'nueva' | null>(null);
  const [modelo, setModelo] = useState<Plato | null>(null);
  const baja = useGuardar();

  function recargarTodo() {
    platos.recargar();
    categorias.recargar();
  }

  const confirmar = useConfirmar();

  async function darDeBaja(p: Plato) {
    if (
      !(await confirmar({
        mensaje: `¿Dar de baja el plato ${p.nombre}?`,
        detalle: 'Deja de mostrarse en los menús. Su historial se conserva.',
        accion: 'Dar de baja',
      }))
    )
      return;
    if (await baja.enviar(`/platos/${p.id}`, 'DELETE')) recargarTodo();
  }

  async function borrarCategoria(c: Categoria) {
    if (
      !(await confirmar({
        mensaje: `¿Borrar la categoría ${c.nombre}?`,
        detalle: 'No se puede deshacer.',
        accion: 'Borrar categoría',
      }))
    )
      return;
    if (await baja.enviar(`/categorias/${c.id}`, 'DELETE')) recargarTodo();
  }

  const sinCategorias = categorias.datos?.length === 0;

  return (
    <section className="space-y-8">
      <div>
        <EncabezadoPagina
          titulo="Platos"
          descripcion="Los platos de una categoría que requiere receta se marcan si todavía no la tienen."
          accion={
            tienePermiso('menu.crear') && (
              <Boton onClick={() => setPlato('nuevo')} disabled={sinCategorias}>
                Nuevo plato
              </Boton>
            )
          }
        />
        <EstadoCarga cargando={platos.cargando && !platos.datos} error={platos.error} />
        <div className="mb-3">
          <Aviso>{baja.error}</Aviso>
        </div>
        {sinCategorias && <p className="mb-3 text-sm text-meta">Primero creá una categoría.</p>}
        {platos.datos && (
          <Lista
            filas={platos.datos}
            clave={(p) => p.id}
            inactiva={(p) => !p.activo}
            columnas={[
              {
                titulo: 'Plato',
                valor: (p) => (
                  <span className="inline-flex flex-wrap items-center gap-1">
                    {p.nombre}
                    {p.sinReceta && <Etiqueta tono="warn">Sin receta</Etiqueta>}
                    {p.reventa && <Etiqueta>Se vende como viene</Etiqueta>}
                    {!p.activo && <Etiqueta>Dado de baja</Etiqueta>}
                  </span>
                ),
              },
              { titulo: 'Categoría', valor: (p) => p.categoria.nombre },
              { titulo: 'Precio', valor: (p) => formatoPesos(p.precio) },
              {
                titulo: 'Disponible',
                valor: (p) => (p.disponible ? 'Sí' : <Etiqueta tono="bad">Agotado</Etiqueta>),
              },
              {
                titulo: 'RA',
                valor: (p) => (p.modeloRa ? <Etiqueta tono="ok">Con modelo</Etiqueta> : '—'),
              },
              {
                titulo: 'Receta',
                // Un plato de reventa no lleva receta.
                valor: (p) =>
                  p.reventa ? (
                    '—'
                  ) : tienePermiso('receta.ver') &&
                    (p.tieneReceta || tienePermiso('receta.crear')) ? (
                    <Link
                      to={`/panel/recetas/plato/${p.id}`}
                      className="inline-block py-2 text-text underline md:py-0"
                    >
                      {p.tieneReceta ? 'Ver receta' : 'Cargar receta'}
                    </Link>
                  ) : p.tieneReceta ? (
                    'Cargada'
                  ) : (
                    '—'
                  ),
              },
            ]}
            acciones={(p) => (
              <span className="inline-flex flex-wrap justify-end gap-x-6 gap-y-2">
                {tienePermiso('menu.editar') && (
                  <Boton variante="secundario" onClick={() => setPlato(p)}>
                    Editar
                  </Boton>
                )}
                {tienePermiso('menu.editar') && (
                  <Boton variante="secundario" onClick={() => setModelo(p)}>
                    Modelo RA
                  </Boton>
                )}
                {tienePermiso('menu.eliminar') && p.activo && (
                  <Boton variante="peligro" onClick={() => darDeBaja(p)}>
                    Dar de baja
                  </Boton>
                )}
              </span>
            )}
          />
        )}
      </div>

      <div>
        <EncabezadoPagina
          titulo="Categorías"
          accion={
            tienePermiso('menu.crear') && (
              <Boton variante="secundario" onClick={() => setCategoria('nueva')}>
                Nueva categoría
              </Boton>
            )
          }
        />
        <EstadoCarga cargando={categorias.cargando && !categorias.datos} error={categorias.error} />
        {categorias.datos && (
          <Lista
            filas={categorias.datos}
            clave={(c) => c.id}
            columnas={[
              { titulo: 'Categoría', valor: (c) => c.nombre },
              { titulo: 'Requiere receta', valor: (c) => (c.requiereReceta ? 'Sí' : 'No') },
              { titulo: 'Platos', valor: (c) => c.cantidadPlatos },
            ]}
            acciones={(c) => (
              <span className="inline-flex flex-wrap justify-end gap-x-6 gap-y-2">
                {tienePermiso('menu.editar') && (
                  <Boton variante="secundario" onClick={() => setCategoria(c)}>
                    Editar
                  </Boton>
                )}
                {tienePermiso('menu.eliminar') && (
                  <Boton variante="peligro" onClick={() => borrarCategoria(c)}>
                    Borrar
                  </Boton>
                )}
              </span>
            )}
          />
        )}
      </div>

      {plato && categorias.datos && (
        <FormularioPlato
          plato={plato === 'nuevo' ? null : plato}
          categorias={categorias.datos}
          onCerrar={() => setPlato(null)}
          onGuardado={() => {
            setPlato(null);
            recargarTodo();
          }}
        />
      )}
      {modelo && (
        <ModeloRaModal
          plato={modelo}
          onCerrar={() => setModelo(null)}
          onGuardado={() => {
            setModelo(null);
            platos.recargar();
          }}
        />
      )}
      {categoria && (
        <FormularioCategoria
          categoria={categoria === 'nueva' ? null : categoria}
          onCerrar={() => setCategoria(null)}
          onGuardado={() => {
            setCategoria(null);
            recargarTodo();
          }}
        />
      )}
    </section>
  );
}

function Acciones({ onCerrar, enviando }: { onCerrar(): void; enviando: boolean }) {
  return (
    <div className="flex justify-end gap-2">
      <Boton variante="secundario" onClick={onCerrar}>
        Cancelar
      </Boton>
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </Boton>
    </div>
  );
}

function FormularioPlato({
  plato,
  categorias,
  onCerrar,
  onGuardado,
}: {
  plato: Plato | null;
  categorias: Categoria[];
  onCerrar(): void;
  onGuardado(): void;
}) {
  const [categoriaId, setCategoriaId] = useState(plato?.categoria.id ?? '');
  const [nombre, setNombre] = useState(plato?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(plato?.descripcion ?? '');
  const [precio, setPrecio] = useState(plato ? String(plato.precio) : '');
  const [fotoUrl, setFotoUrl] = useState(plato?.fotoUrl ?? '');
  const [disponible, setDisponible] = useState(plato?.disponible ?? true);
  const [activo, setActivo] = useState(plato?.activo ?? true);
  const [insumoReventaId, setInsumoReventaId] = useState(plato?.reventa?.id ?? '');
  const { enviar, enviando, error } = useGuardar();
  const { tienePermiso } = useSesion();
  // Solo se revenden insumos que se cuentan por unidades (botellas, latas…).
  const insumos = useRecurso<Insumo[]>(tienePermiso('insumo.ver') ? '/insumos' : null);
  const porUnidad = insumos.datos?.filter(
    (i) => i.unidadBase === 'UNIDAD' && (i.activo || i.id === insumoReventaId),
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: PlatoInput = {
      categoriaId,
      nombre,
      descripcion: descripcion || null,
      precio: aNumero(precio),
      fotoUrl: fotoUrl.trim() || null,
      disponible,
      // Sin permiso para ver insumos el campo no se muestra: no se toca.
      ...(porUnidad && { insumoReventaId: insumoReventaId || null }),
      ...(plato && { activo }),
    };
    const respuesta = plato
      ? await enviar(`/platos/${plato.id}`, 'PUT', datos)
      : await enviar('/platos', 'POST', datos);
    if (respuesta) onGuardado();
  }

  return (
    <Modal titulo={plato ? `Editar ${plato.nombre}` : 'Nuevo plato'} onCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Campo etiqueta="Nombre">
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Categoría">
            <select
              required
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className={claseInput}
            >
              <option value="" disabled>
                Elegí una
              </option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Precio ($)">
            <input
              {...propsDecimal}
              required
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              className={claseInput}
            />
          </Campo>
        </div>
        <Campo etiqueta="Descripción">
          <textarea
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Foto (URL)" ayuda="Opcional">
          <input
            type="url"
            value={fotoUrl}
            onChange={(e) => setFotoUrl(e.target.value)}
            className={claseInput}
          />
        </Campo>
        {porUnidad && (
          <Campo
            etiqueta="Se vende como viene"
            ayuda={
              plato?.tieneReceta
                ? 'Tiene receta: para venderlo como viene, primero borrá la receta.'
                : 'Para bebidas y otros productos que se venden sin preparar: cada venta descuenta 1 unidad del insumo.'
            }
          >
            <select
              value={insumoReventaId}
              disabled={plato?.tieneReceta}
              onChange={(e) => setInsumoReventaId(e.target.value)}
              className={claseInput}
            >
              <option value="">No, se prepara con receta</option>
              {porUnidad.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Casilla
          etiqueta="Disponible (desmarcar si está agotado)"
          checked={disponible}
          onChange={setDisponible}
        />
        {plato && <Casilla etiqueta="Plato activo" checked={activo} onChange={setActivo} />}

        <Aviso>{error}</Aviso>
        <Acciones onCerrar={onCerrar} enviando={enviando} />
      </form>
    </Modal>
  );
}

function FormularioCategoria({
  categoria,
  onCerrar,
  onGuardado,
}: {
  categoria: Categoria | null;
  onCerrar(): void;
  onGuardado(): void;
}) {
  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [requiereReceta, setRequiereReceta] = useState(categoria?.requiereReceta ?? false);
  const { enviar, enviando, error } = useGuardar();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: CategoriaInput = { nombre, requiereReceta };
    const respuesta = categoria
      ? await enviar(`/categorias/${categoria.id}`, 'PUT', datos)
      : await enviar('/categorias', 'POST', datos);
    if (respuesta) onGuardado();
  }

  return (
    <Modal
      titulo={categoria ? `Editar ${categoria.nombre}` : 'Nueva categoría'}
      onCerrar={onCerrar}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Campo etiqueta="Nombre">
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Casilla
          etiqueta="Sus platos requieren receta"
          checked={requiereReceta}
          onChange={setRequiereReceta}
        />
        <Aviso>{error}</Aviso>
        <Acciones onCerrar={onCerrar} enviando={enviando} />
      </form>
    </Modal>
  );
}
