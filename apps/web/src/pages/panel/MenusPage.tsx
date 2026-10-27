import { useState, type FormEvent } from 'react';
import { estaVigente, hoyArgentina, type Menu, type MenuInput, type Plato } from '@pgim/shared';
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
} from '../../components/ui';
import { formatoFecha, formatoLista } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

function EstadoVigencia({ menu, hoy }: { menu: Menu; hoy: string }) {
  if (menu.vigenciaDesde > hoy) {
    return <Etiqueta tono="warn">Desde el {formatoFecha(menu.vigenciaDesde)}</Etiqueta>;
  }
  if (!estaVigente(menu, hoy)) return <Etiqueta tono="bad">Vencido</Etiqueta>;
  return <Etiqueta tono="ok">Vigente</Etiqueta>;
}

function vigencia(menu: Menu) {
  const desde = formatoFecha(menu.vigenciaDesde);
  return menu.vigenciaHasta ? `${desde} al ${formatoFecha(menu.vigenciaHasta)}` : `Desde ${desde}`;
}

// CU-16: menús del restaurante con vigencia. El menú activo de cada sucursal se
// elige en Sucursales.
export function MenusPage() {
  const { tienePermiso } = useSesion();
  const menus = useRecurso<Menu[]>('/menus');
  const platos = useRecurso<Plato[]>('/platos');
  const [editando, setEditando] = useState<Menu | 'nuevo' | null>(null);
  const baja = useGuardar();
  const hoy = hoyArgentina();

  async function borrar(m: Menu) {
    if (!confirm(`¿Borrar el menú ${m.nombre}?`)) return;
    if (await baja.enviar(`/menus/${m.id}`, 'DELETE')) menus.recargar();
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Menús"
        descripcion="Cada sucursal muestra su menú activo mientras esté vigente. El menú activo se elige en Sucursales."
        accion={
          tienePermiso('menu.crear') && (
            <Boton onClick={() => setEditando('nuevo')}>Nuevo menú</Boton>
          )
        }
      />
      <EstadoCarga cargando={menus.cargando && !menus.datos} error={menus.error} />
      <div className="mb-3">
        <Aviso>{baja.error}</Aviso>
      </div>
      {menus.datos && (
        <Lista
          filas={menus.datos}
          clave={(m) => m.id}
          inactiva={(m) => !estaVigente(m, hoy)}
          vacio="Todavía no hay menús."
          columnas={[
            {
              titulo: 'Menú',
              valor: (m) => (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {m.nombre} <EstadoVigencia menu={m} hoy={hoy} />
                </span>
              ),
            },
            { titulo: 'Vigencia', valor: vigencia },
            { titulo: 'Platos', valor: (m) => m.platoIds.length },
            {
              titulo: 'Activo en',
              valor: (m) => formatoLista(m.sucursalesActivas.map((s) => s.nombre)) || '—',
            },
          ]}
          acciones={(m) => (
            <span className="inline-flex gap-2">
              {tienePermiso('menu.editar') && (
                <Boton variante="secundario" onClick={() => setEditando(m)}>
                  Editar
                </Boton>
              )}
              {tienePermiso('menu.eliminar') && (
                <Boton variante="peligro" onClick={() => borrar(m)}>
                  Borrar
                </Boton>
              )}
            </span>
          )}
        />
      )}

      {editando && platos.datos && (
        <FormularioMenu
          menu={editando === 'nuevo' ? null : editando}
          platos={platos.datos.filter((p) => p.activo)}
          hoy={hoy}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            menus.recargar();
          }}
        />
      )}
    </section>
  );
}

// Platos activos agrupados por categoría, en el orden en que llegan de la API.
function porCategoria(platos: Plato[]) {
  const grupos = new Map<string, Plato[]>();
  for (const p of platos)
    grupos.set(p.categoria.nombre, [...(grupos.get(p.categoria.nombre) ?? []), p]);
  return [...grupos];
}

function FormularioMenu({
  menu,
  platos,
  hoy,
  onCerrar,
  onGuardado,
}: {
  menu: Menu | null;
  platos: Plato[];
  hoy: string;
  onCerrar(): void;
  onGuardado(): void;
}) {
  const [nombre, setNombre] = useState(menu?.nombre ?? '');
  const [descripcion, setDescripcion] = useState(menu?.descripcion ?? '');
  const [desde, setDesde] = useState(menu?.vigenciaDesde ?? hoy);
  const [hasta, setHasta] = useState(menu?.vigenciaHasta ?? '');
  // Un plato dado de baja después de armar el menú se quita al guardar.
  const [elegidos, setElegidos] = useState(
    () => new Set(menu?.platoIds.filter((id) => platos.some((p) => p.id === id)) ?? []),
  );
  const { enviar, enviando, error } = useGuardar();

  function alternar(id: string, elegido: boolean) {
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      if (elegido) nuevo.add(id);
      else nuevo.delete(id);
      return nuevo;
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: MenuInput = {
      nombre,
      descripcion: descripcion || null,
      vigenciaDesde: desde,
      vigenciaHasta: hasta || null,
      platoIds: [...elegidos],
    };
    const respuesta = menu
      ? await enviar(`/menus/${menu.id}`, 'PUT', datos)
      : await enviar('/menus', 'POST', datos);
    if (respuesta) onGuardado();
  }

  return (
    <Modal titulo={menu ? `Editar ${menu.nombre}` : 'Nuevo menú'} onCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Campo etiqueta="Nombre">
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Descripción">
          <textarea
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Vigente desde">
            <input
              type="date"
              required
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Hasta" ayuda="Vacío: sin fecha de fin">
            <input
              type="date"
              min={desde}
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className={claseInput}
            />
          </Campo>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-700">
            Platos ({elegidos.size} elegidos)
          </legend>
          {platos.length === 0 && (
            <p className="text-sm text-slate-500">Primero cargá platos en la sección Platos.</p>
          )}
          {porCategoria(platos).map(([categoria, delGrupo]) => (
            <div key={categoria}>
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">{categoria}</p>
              <div className="space-y-1">
                {delGrupo.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Casilla
                      etiqueta={p.nombre}
                      checked={elegidos.has(p.id)}
                      onChange={(elegido) => alternar(p.id, elegido)}
                    />
                    {p.sinReceta && <Etiqueta tono="warn">Sin receta: no se muestra</Etiqueta>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

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
