import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { Mesa, MesaInput, Sucursal } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { Lista } from '../../components/Lista';
import { MapaSalon } from '../../components/MapaSalon';
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

function datosDe(mesa: Mesa): MesaInput {
  return {
    numero: mesa.numero,
    capacidad: mesa.capacidad,
    posX: mesa.posX,
    posY: mesa.posY,
  };
}

// CU-14: mapa del salón de una sucursal. Las mesas nuevas aparecen en el
// centro y se acomodan arrastrándolas; la posición se guarda al soltar.
export function SalonPage() {
  const { id: sucursalId } = useParams();
  const { tienePermiso } = useSesion();
  const editable = tienePermiso('sucursal.editar');
  const ruta = `/sucursales/${sucursalId}/mesas`;
  const { datos, cargando, error, recargar } = useRecurso<Mesa[]>(ruta);
  const sucursales = useRecurso<Sucursal[]>('/sucursales');
  const sucursal = sucursales.datos?.find((s) => s.id === sucursalId);
  // Copia local para que la mesa quede donde se soltó mientras se guarda.
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [editando, setEditando] = useState<Mesa | null>(null);
  const guardar = useGuardar();

  useEffect(() => {
    if (datos) setMesas(datos);
  }, [datos]);

  async function mover(id: string, posX: number, posY: number) {
    const mesa = mesas.find((m) => m.id === id);
    if (!mesa) return;
    setMesas((actual) => actual.map((m) => (m.id === id ? { ...m, posX, posY } : m)));
    if (!(await guardar.enviar(`${ruta}/${id}`, 'PUT', { ...datosDe(mesa), posX, posY }))) {
      recargar();
    }
  }

  async function agregar() {
    const numero = Math.max(0, ...mesas.map((m) => m.numero)) + 1;
    const nueva: MesaInput = { numero, capacidad: 4, posX: 50, posY: 30 };
    if (await guardar.enviar(ruta, 'POST', nueva)) recargar();
  }

  async function darDeBaja(mesa: Mesa) {
    if (!confirm(`¿Dar de baja la mesa ${mesa.numero}?`)) return;
    if (await guardar.enviar(`${ruta}/${mesa.id}`, 'DELETE')) recargar();
  }

  return (
    <section>
      <p className="mb-2 text-sm">
        <Link to="/panel/sucursales" className="text-slate-600 underline">
          ← Sucursales
        </Link>
      </p>
      <EncabezadoPagina
        titulo={`Salón${sucursal ? ` de ${sucursal.nombre}` : ''}`}
        descripcion={
          editable
            ? 'Arrastrá las mesas para ubicarlas; la posición se guarda al soltar.'
            : 'Ubicación y capacidad de las mesas.'
        }
        accion={
          editable && (
            <Boton onClick={agregar} disabled={guardar.enviando}>
              Agregar mesa
            </Boton>
          )
        }
      />
      <EstadoCarga cargando={cargando && !datos} error={error} />
      <div className="mb-3">
        <Aviso>{guardar.error}</Aviso>
      </div>
      {datos && (
        <div className="space-y-4">
          <MapaSalon
            mesas={mesas.map((m) => ({ ...m, inactiva: !m.activa }))}
            onMover={editable ? mover : undefined}
          />
          <Lista
            filas={mesas}
            clave={(m) => m.id}
            inactiva={(m) => !m.activa}
            columnas={[
              {
                titulo: 'Mesa',
                valor: (m) => (
                  <span>
                    {m.numero} {!m.activa && <Etiqueta>Dada de baja</Etiqueta>}
                  </span>
                ),
              },
              { titulo: 'Capacidad', valor: (m) => `${m.capacidad} personas` },
            ]}
            acciones={(m) =>
              editable && (
                <span className="inline-flex gap-2">
                  <Boton variante="secundario" onClick={() => setEditando(m)}>
                    Editar
                  </Boton>
                  {m.activa && (
                    <Boton variante="peligro" onClick={() => darDeBaja(m)}>
                      Dar de baja
                    </Boton>
                  )}
                </span>
              )
            }
          />
        </div>
      )}

      {editando && (
        <FormularioMesa
          ruta={ruta}
          mesa={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
    </section>
  );
}

function FormularioMesa({
  ruta,
  mesa,
  onCerrar,
  onGuardado,
}: {
  ruta: string;
  mesa: Mesa;
  onCerrar(): void;
  onGuardado(): void;
}) {
  const [numero, setNumero] = useState(String(mesa.numero));
  const [capacidad, setCapacidad] = useState(String(mesa.capacidad));
  const [activa, setActiva] = useState(mesa.activa);
  const { enviar, enviando, error } = useGuardar();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos: MesaInput = {
      ...datosDe(mesa),
      numero: aNumero(numero),
      capacidad: aNumero(capacidad),
      activa,
    };
    if (await enviar(`${ruta}/${mesa.id}`, 'PUT', datos)) onGuardado();
  }

  return (
    <Modal titulo={`Editar mesa ${mesa.numero}`} onCerrar={onCerrar}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Número">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              required
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Capacidad">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              required
              value={capacidad}
              onChange={(e) => setCapacidad(e.target.value)}
              className={claseInput}
            />
          </Campo>
        </div>
        <Casilla etiqueta="Mesa activa" checked={activa} onChange={setActiva} />
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
