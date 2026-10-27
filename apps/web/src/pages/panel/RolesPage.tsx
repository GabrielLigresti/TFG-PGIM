import { useState, type FormEvent } from 'react';
import {
  ARQUETIPOS,
  type Arquetipo,
  type CodigoPermiso,
  type GrupoPermisos,
  type Rol,
  type RolInput,
} from '@pgim/shared';
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
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';
import { useConfirmar } from '../../components/Confirmacion';

const NOMBRE_ARQUETIPO: Record<Arquetipo, string> = {
  MOZO: 'Mozo',
  COCINERO: 'Cocinero',
  OTRO: 'Otro',
};

const NOMBRE_MODULO: Record<string, string> = {
  sucursal: 'Sucursales',
  rol: 'Roles',
  personal: 'Personal',
  menu: 'Menú y platos',
  beneficio: 'Beneficios',
  insumo: 'Insumos',
  receta: 'Recetas',
  reserva: 'Reservas',
  turno: 'Turnos',
  apertura: 'Asistente de apertura',
  metrica: 'Métricas',
  stock: 'Stock',
  pedido: 'Pedidos',
  mesa: 'Mesas',
  pago: 'Pagos',
};

const NOMBRE_ACCION: Record<string, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Dar de baja',
  activar: 'Activar',
  planificar: 'Planificar',
  consultar: 'Consultar',
  registrar: 'Registrar',
  gestionar_cola: 'Gestionar la cola',
  avanzar: 'Avanzar estado',
  cerrar: 'Cerrar',
};

// CU-02: roles con su arquetipo y permisos por módulo.
export function RolesPage() {
  const { tienePermiso, recargarSesion } = useSesion();
  const roles = useRecurso<Rol[]>('/roles');
  const catalogo = useRecurso<GrupoPermisos[]>('/roles/permisos');
  const [editando, setEditando] = useState<Rol | 'nuevo' | null>(null);
  const [viendo, setViendo] = useState<Rol | null>(null);
  const baja = useGuardar();

  async function guardado() {
    setEditando(null);
    roles.recargar();
    // Si se tocó el rol propio, los permisos de la sesión cambian.
    await recargarSesion();
  }

  const confirmar = useConfirmar();

  async function darDeBaja(rol: Rol) {
    if (
      !(await confirmar({
        mensaje: `¿Dar de baja el rol ${rol.nombre}?`,
        detalle: 'Deja de poder asignarse a empleados. Su historial se conserva.',
        accion: 'Dar de baja',
      }))
    )
      return;
    if (await baja.enviar(`/roles/${rol.id}`, 'DELETE')) await guardado();
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Roles"
        descripcion="Cada rol define qué puede hacer el personal que lo tiene. Tocá un rol para ver sus permisos."
        accion={
          tienePermiso('rol.crear') && <Boton onClick={() => setEditando('nuevo')}>Nuevo rol</Boton>
        }
      />
      <EstadoCarga cargando={roles.cargando && !roles.datos} error={roles.error} />
      <div className="mb-3">
        <Aviso>{baja.error}</Aviso>
      </div>
      {roles.datos && (
        <Lista
          filas={roles.datos}
          clave={(r) => r.id}
          inactiva={(r) => !r.activo}
          onSeleccionar={(r) => setViendo(r)}
          etiquetaSeleccion={(r) => `Ver los permisos de ${r.nombre}`}
          columnas={[
            {
              titulo: 'Rol',
              valor: (r) => (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {r.nombre}
                  {r.predeterminado && <Etiqueta>Predeterminado</Etiqueta>}
                  {!r.activo && <Etiqueta>Dado de baja</Etiqueta>}
                </span>
              ),
            },
            { titulo: 'Tipo de puesto', valor: (r) => NOMBRE_ARQUETIPO[r.arquetipo] },
            { titulo: 'Permisos', valor: (r) => r.permisos.length },
            { titulo: 'Empleados', valor: (r) => r.cantidadEmpleados },
          ]}
          acciones={(r) => (
            <span className="inline-flex flex-wrap justify-end gap-x-6 gap-y-2">
              {tienePermiso('rol.editar') && (
                <Boton variante="secundario" onClick={() => setEditando(r)}>
                  Editar
                </Boton>
              )}
              {tienePermiso('rol.eliminar') && r.activo && (
                <Boton variante="peligro" onClick={() => darDeBaja(r)}>
                  Dar de baja
                </Boton>
              )}
            </span>
          )}
        />
      )}

      {viendo && catalogo.datos && (
        <PermisosDelRol rol={viendo} catalogo={catalogo.datos} onCerrar={() => setViendo(null)} />
      )}

      {editando && catalogo.datos && (
        <FormularioRol
          rol={editando === 'nuevo' ? null : editando}
          catalogo={catalogo.datos}
          onCerrar={() => setEditando(null)}
          onGuardado={guardado}
        />
      )}
    </section>
  );
}

function FormularioRol({
  rol,
  catalogo,
  onCerrar,
  onGuardado,
}: {
  rol: Rol | null;
  catalogo: GrupoPermisos[];
  onCerrar(): void;
  onGuardado(): void;
}) {
  const [nombre, setNombre] = useState(rol?.nombre ?? '');
  const [arquetipo, setArquetipo] = useState<Arquetipo>(rol?.arquetipo ?? 'OTRO');
  const [permisos, setPermisos] = useState(() => new Set<CodigoPermiso>(rol?.permisos ?? []));
  const [activo, setActivo] = useState(rol?.activo ?? true);
  const { enviar, enviando, error } = useGuardar();

  function alternar(codigo: CodigoPermiso, marcado: boolean) {
    setPermisos((actual) => {
      const nuevo = new Set(actual);
      if (marcado) nuevo.add(codigo);
      else nuevo.delete(codigo);
      return nuevo;
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: RolInput = { nombre, arquetipo, permisos: [...permisos], ...(rol && { activo }) };
    const respuesta = rol
      ? await enviar(`/roles/${rol.id}`, 'PUT', datos)
      : await enviar('/roles', 'POST', datos);
    if (respuesta) onGuardado();
  }

  return (
    <Modal
      titulo={rol ? `Editar ${rol.nombre}` : 'Nuevo rol'}
      onCerrar={onCerrar}
      ancho="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <input
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Tipo de puesto" ayuda="Lo usa el optimizador de turnos">
            <select
              value={arquetipo}
              onChange={(e) => setArquetipo(e.target.value as Arquetipo)}
              className={claseInput}
            >
              {ARQUETIPOS.map((a) => (
                <option key={a} value={a}>
                  {NOMBRE_ARQUETIPO[a]}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">
            Permisos ({permisos.size} elegidos)
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {catalogo.map((grupo) => (
              <div key={grupo.modulo} className="rounded-control border border-line p-3">
                <p className="mb-2 text-sm font-medium text-ink">
                  {NOMBRE_MODULO[grupo.modulo] ?? grupo.modulo}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {grupo.permisos.map((p) => (
                    <Casilla
                      key={p.codigo}
                      etiqueta={NOMBRE_ACCION[p.accion] ?? p.accion}
                      checked={permisos.has(p.codigo)}
                      onChange={(marcado) => alternar(p.codigo, marcado)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {rol && <Casilla etiqueta="Rol activo" checked={activo} onChange={setActivo} />}

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

// Vista de solo lectura: los permisos del rol agrupados por módulo.
function PermisosDelRol({
  rol,
  catalogo,
  onCerrar,
}: {
  rol: Rol;
  catalogo: GrupoPermisos[];
  onCerrar(): void;
}) {
  const grupos = catalogo
    .map((grupo) => ({
      ...grupo,
      permisos: grupo.permisos.filter((p) => rol.permisos.includes(p.codigo)),
    }))
    .filter((grupo) => grupo.permisos.length > 0);

  return (
    <Modal titulo={`Permisos de ${rol.nombre}`} onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-meta">
        {NOMBRE_ARQUETIPO[rol.arquetipo]} · {rol.permisos.length} permisos · {rol.cantidadEmpleados}{' '}
        empleado(s)
      </p>
      <dl className="divide-y divide-line">
        {grupos.map((grupo) => (
          <div key={grupo.modulo} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
            <dt className="font-medium text-ink">{NOMBRE_MODULO[grupo.modulo] ?? grupo.modulo}</dt>
            <dd className="flex flex-wrap justify-end gap-1">
              {grupo.permisos.map((p) => (
                <Etiqueta key={p.codigo}>{NOMBRE_ACCION[p.accion] ?? p.accion}</Etiqueta>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex justify-end">
        <Boton variante="secundario" onClick={onCerrar}>
          Cerrar
        </Boton>
      </div>
    </Modal>
  );
}
