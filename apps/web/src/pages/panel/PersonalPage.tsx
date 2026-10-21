import { useState, type FormEvent } from 'react';
import type { Empleado, EmpleadoAlta, EmpleadoEdicion, OpcionesPersonal } from '@pgim/shared';
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
import { aNumero } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

// CU-15: alta de empleados con rol, sucursales y tope de horas semanales.
export function PersonalPage() {
  const { sesion, tienePermiso, recargarSesion } = useSesion();
  const personal = useRecurso<Empleado[]>('/personal');
  const opciones = useRecurso<OpcionesPersonal>('/personal/opciones');
  const [editando, setEditando] = useState<Empleado | 'nuevo' | null>(null);
  const baja = useGuardar();

  async function guardado() {
    setEditando(null);
    personal.recargar();
    // Puede haber cambiado el rol o las sucursales del propio usuario.
    await recargarSesion();
  }

  async function darDeBaja(empleado: Empleado) {
    if (!confirm(`¿Dar de baja a ${empleado.nombreCompleto}? No va a poder iniciar sesión.`))
      return;
    if (await baja.enviar(`/personal/${empleado.id}`, 'DELETE')) await guardado();
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Personal"
        descripcion="Empleados del restaurante, su rol y las sucursales donde trabajan."
        accion={
          tienePermiso('personal.crear') && (
            <Boton onClick={() => setEditando('nuevo')}>Nuevo empleado</Boton>
          )
        }
      />
      <EstadoCarga cargando={personal.cargando && !personal.datos} error={personal.error} />
      <div className="mb-3">
        <Aviso>{baja.error}</Aviso>
      </div>
      {personal.datos && (
        <Lista
          filas={personal.datos}
          clave={(e) => e.id}
          inactiva={(e) => !e.activo}
          columnas={[
            {
              titulo: 'Nombre',
              valor: (e) => (
                <span className="inline-flex flex-wrap items-center gap-1">
                  {e.nombreCompleto}
                  {e.id === sesion?.usuario.id && <Etiqueta>Vos</Etiqueta>}
                  {!e.activo && <Etiqueta>Dado de baja</Etiqueta>}
                </span>
              ),
            },
            { titulo: 'Email', valor: (e) => e.email, className: 'break-all' },
            { titulo: 'Rol', valor: (e) => e.rol.nombre },
            { titulo: 'Sucursales', valor: (e) => e.sucursales.map((s) => s.nombre).join(', ') },
            { titulo: 'Horas/semana', valor: (e) => e.horasSemanalesMax },
          ]}
          acciones={(e) => (
            <span className="inline-flex gap-2">
              {tienePermiso('personal.editar') && (
                <Boton variante="secundario" onClick={() => setEditando(e)}>
                  Editar
                </Boton>
              )}
              {tienePermiso('personal.eliminar') && e.activo && e.id !== sesion?.usuario.id && (
                <Boton variante="peligro" onClick={() => darDeBaja(e)}>
                  Dar de baja
                </Boton>
              )}
            </span>
          )}
        />
      )}

      {editando && opciones.datos && (
        <FormularioEmpleado
          empleado={editando === 'nuevo' ? null : editando}
          opciones={opciones.datos}
          esUnoMismo={editando !== 'nuevo' && editando.id === sesion?.usuario.id}
          onCerrar={() => setEditando(null)}
          onGuardado={guardado}
        />
      )}
    </section>
  );
}

function FormularioEmpleado({
  empleado,
  opciones,
  esUnoMismo,
  onCerrar,
  onGuardado,
}: {
  empleado: Empleado | null;
  opciones: OpcionesPersonal;
  esUnoMismo: boolean;
  onCerrar(): void;
  onGuardado(): void;
}) {
  const [email, setEmail] = useState(empleado?.email ?? '');
  const [password, setPassword] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState(empleado?.nombreCompleto ?? '');
  const [rolId, setRolId] = useState(empleado?.rol.id ?? '');
  const [sucursalIds, setSucursalIds] = useState(
    () => new Set(empleado?.sucursales.map((s) => s.id) ?? []),
  );
  const [horas, setHoras] = useState(String(empleado?.horasSemanalesMax ?? 40));
  const [activo, setActivo] = useState(empleado?.activo ?? true);
  const { enviar, enviando, error } = useGuardar();

  // Una sucursal dada de baja no figura en las opciones, pero puede seguir asignada.
  const sucursales = [
    ...opciones.sucursales,
    ...(empleado?.sucursales ?? [])
      .filter((s) => !opciones.sucursales.some((o) => o.id === s.id))
      .map((s) => ({ ...s, nombre: `${s.nombre} (dada de baja)` })),
  ];

  // Un rol dado de baja no figura en las opciones, pero puede ser el actual.
  const roles =
    opciones.roles.some((r) => r.id === rolId) || !empleado
      ? opciones.roles
      : [empleado.rol, ...opciones.roles];

  function alternarSucursal(id: string, marcada: boolean) {
    setSucursalIds((actual) => {
      const nuevo = new Set(actual);
      if (marcada) nuevo.add(id);
      else nuevo.delete(id);
      return nuevo;
    });
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const comunes = {
      nombreCompleto,
      rolId,
      sucursalIds: [...sucursalIds],
      horasSemanalesMax: aNumero(horas),
    };
    const respuesta = empleado
      ? await enviar(`/personal/${empleado.id}`, 'PUT', {
          ...comunes,
          activo,
          ...(password && { password }),
        } satisfies EmpleadoEdicion)
      : await enviar('/personal', 'POST', { ...comunes, email, password } satisfies EmpleadoAlta);
    if (respuesta) onGuardado();
  }

  return (
    <Modal
      titulo={empleado ? `Editar ${empleado.nombreCompleto}` : 'Nuevo empleado'}
      onCerrar={onCerrar}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <Campo etiqueta="Nombre completo">
          <input
            required
            value={nombreCompleto}
            onChange={(e) => setNombreCompleto(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo
          etiqueta="Email"
          ayuda={empleado ? 'El email no se puede cambiar' : 'Con este email inicia sesión'}
        >
          <input
            type="email"
            required
            disabled={Boolean(empleado)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo
          etiqueta={empleado ? 'Contraseña nueva' : 'Contraseña inicial'}
          ayuda={empleado ? 'Dejala vacía para no cambiarla' : 'Mínimo 8 caracteres'}
        >
          <input
            type="password"
            autoComplete="new-password"
            required={!empleado}
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Rol">
            <select
              required
              value={rolId}
              onChange={(e) => setRolId(e.target.value)}
              className={claseInput}
            >
              <option value="" disabled>
                Elegí un rol
              </option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Horas semanales máx.">
            <input
              type="number"
              min={1}
              max={84}
              required
              value={horas}
              onChange={(e) => setHoras(e.target.value)}
              className={claseInput}
            />
          </Campo>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium text-slate-700">Sucursales</legend>
          {sucursales.map((s) => (
            <Casilla
              key={s.id}
              etiqueta={s.nombre}
              checked={sucursalIds.has(s.id)}
              onChange={(marcada) => alternarSucursal(s.id, marcada)}
            />
          ))}
        </fieldset>
        {empleado && !esUnoMismo && (
          <Casilla etiqueta="Puede iniciar sesión (activo)" checked={activo} onChange={setActivo} />
        )}

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
