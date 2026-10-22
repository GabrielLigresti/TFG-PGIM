import { useState, type FormEvent } from 'react';
import {
  FRANJAS,
  administraModulo,
  type Franja,
  type Sucursal,
  type SucursalInput,
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
import { aNumero } from '../../lib/formato';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

const NOMBRE_FRANJA: Record<Franja, string> = { ALMUERZO: 'Almuerzo', CENA: 'Cena' };

const HORARIO_POR_DEFECTO: Record<Franja, { horaInicio: string; horaFin: string }> = {
  ALMUERZO: { horaInicio: '12:00', horaFin: '16:00' },
  CENA: { horaInicio: '20:00', horaFin: '00:00' },
};

function horarios(s: Sucursal) {
  return s.horariosServicio
    .map((h) => `${NOMBRE_FRANJA[h.franja]} ${h.horaInicio}–${h.horaFin}`)
    .join(' · ');
}

// CU-13: sucursales y horarios de servicio (el menú activo llega con los menús).
export function SucursalesPage() {
  const { sesion, tienePermiso, recargarSesion } = useSesion();
  const acotada = !administraModulo(sesion?.permisos ?? [], 'sucursal');
  const { datos, cargando, error, recargar } = useRecurso<Sucursal[]>('/sucursales');
  const [editando, setEditando] = useState<Sucursal | 'nueva' | null>(null);
  const baja = useGuardar();

  async function guardado() {
    setEditando(null);
    recargar();
    // La sucursal nueva queda asignada a quien la crea, y una baja puede sacar la activa.
    await recargarSesion();
  }

  async function darDeBaja(s: Sucursal) {
    if (!confirm(`¿Dar de baja la sucursal ${s.nombre}?`)) return;
    if (await baja.enviar(`/sucursales/${s.id}`, 'DELETE')) await guardado();
  }

  return (
    <section>
      <EncabezadoPagina
        titulo="Sucursales"
        descripcion={
          acotada
            ? 'Mostrando las sucursales que tenés asignadas.'
            : 'Locales del restaurante, su horario y los horarios de almuerzo y cena.'
        }
        accion={
          tienePermiso('sucursal.crear') && (
            <Boton onClick={() => setEditando('nueva')}>Nueva sucursal</Boton>
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
          clave={(s) => s.id}
          inactiva={(s) => !s.activa}
          columnas={[
            {
              titulo: 'Sucursal',
              valor: (s) => (
                <span>
                  {s.nombre} {!s.activa && <Etiqueta>Dada de baja</Etiqueta>}
                </span>
              ),
            },
            { titulo: 'Dirección', valor: (s) => s.direccion },
            { titulo: 'Horario', valor: (s) => `${s.horarioApertura}–${s.horarioCierre}` },
            { titulo: 'Servicio', valor: (s) => horarios(s) || '—' },
            { titulo: 'Tolerancia', valor: (s) => `${s.toleranciaNoShowMin} min` },
          ]}
          acciones={(s) => (
            <span className="inline-flex gap-2">
              {tienePermiso('sucursal.editar') && (
                <Boton variante="secundario" onClick={() => setEditando(s)}>
                  Editar
                </Boton>
              )}
              {tienePermiso('sucursal.eliminar') && s.activa && (
                <Boton variante="peligro" onClick={() => darDeBaja(s)}>
                  Dar de baja
                </Boton>
              )}
            </span>
          )}
        />
      )}

      {editando && (
        <FormularioSucursal
          sucursal={editando === 'nueva' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={guardado}
        />
      )}
    </section>
  );
}

function FormularioSucursal({
  sucursal,
  onCerrar,
  onGuardado,
}: {
  sucursal: Sucursal | null;
  onCerrar(): void;
  onGuardado(): void;
}) {
  const [nombre, setNombre] = useState(sucursal?.nombre ?? '');
  const [direccion, setDireccion] = useState(sucursal?.direccion ?? '');
  const [apertura, setApertura] = useState(sucursal?.horarioApertura ?? '12:00');
  const [cierre, setCierre] = useState(sucursal?.horarioCierre ?? '00:00');
  const [tolerancia, setTolerancia] = useState(String(sucursal?.toleranciaNoShowMin ?? 15));
  const [activa, setActiva] = useState(sucursal?.activa ?? true);
  const [servicio, setServicio] = useState(() =>
    FRANJAS.map((franja) => {
      const actual = sucursal?.horariosServicio.find((h) => h.franja === franja);
      return {
        franja,
        habilitada: sucursal ? Boolean(actual) : true,
        ...(actual ?? HORARIO_POR_DEFECTO[franja]),
      };
    }),
  );
  const { enviar, enviando, error } = useGuardar();

  function cambiarServicio(franja: Franja, cambios: Partial<(typeof servicio)[number]>) {
    setServicio((actual) => actual.map((h) => (h.franja === franja ? { ...h, ...cambios } : h)));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: SucursalInput = {
      nombre,
      direccion,
      horarioApertura: apertura,
      horarioCierre: cierre,
      toleranciaNoShowMin: aNumero(tolerancia),
      horariosServicio: servicio
        .filter((h) => h.habilitada)
        .map(({ franja, horaInicio, horaFin }) => ({ franja, horaInicio, horaFin })),
      ...(sucursal && { activa }),
    };
    const respuesta = sucursal
      ? await enviar(`/sucursales/${sucursal.id}`, 'PUT', datos)
      : await enviar('/sucursales', 'POST', datos);
    if (respuesta) onGuardado();
  }

  return (
    <Modal titulo={sucursal ? `Editar ${sucursal.nombre}` : 'Nueva sucursal'} onCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Campo etiqueta="Nombre">
          <input
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <Campo etiqueta="Dirección">
          <input
            required
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            className={claseInput}
          />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Apertura">
            <input
              type="time"
              required
              value={apertura}
              onChange={(e) => setApertura(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Cierre" ayuda="00:00 es medianoche">
            <input
              type="time"
              required
              value={cierre}
              onChange={(e) => setCierre(e.target.value)}
              className={claseInput}
            />
          </Campo>
        </div>
        <Campo etiqueta="Tolerancia de no-show (minutos)">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={240}
            required
            value={tolerancia}
            onChange={(e) => setTolerancia(e.target.value)}
            className={claseInput}
          />
        </Campo>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Horarios de servicio</legend>
          {servicio.map((h) => (
            <div key={h.franja} className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2">
              <Casilla
                etiqueta={NOMBRE_FRANJA[h.franja]}
                checked={h.habilitada}
                onChange={(habilitada) => cambiarServicio(h.franja, { habilitada })}
              />
              <input
                type="time"
                aria-label={`Inicio de ${NOMBRE_FRANJA[h.franja]}`}
                disabled={!h.habilitada}
                value={h.horaInicio}
                onChange={(e) => cambiarServicio(h.franja, { horaInicio: e.target.value })}
                className={claseInput}
              />
              <input
                type="time"
                aria-label={`Fin de ${NOMBRE_FRANJA[h.franja]}`}
                disabled={!h.habilitada}
                value={h.horaFin}
                onChange={(e) => cambiarServicio(h.franja, { horaFin: e.target.value })}
                className={claseInput}
              />
            </div>
          ))}
        </fieldset>

        {sucursal && <Casilla etiqueta="Sucursal activa" checked={activa} onChange={setActiva} />}

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
