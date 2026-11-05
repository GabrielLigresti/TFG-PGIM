import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { UserRound } from 'lucide-react';
import type { CuentaUsuario } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { FormularioContrasena } from '../../components/FormularioContrasena';
import {
  Aviso,
  Boton,
  Campo,
  EncabezadoPagina,
  EstadoCarga,
  Panel,
  claseInput,
} from '../../components/ui';
import { ApiError, subirArchivo } from '../../lib/api';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

const LIMITE_FOTO_MB = 5;

type CuentaEmpleado = Extract<CuentaUsuario, { tipo: 'EMPLEADO' }>;

// "Mi cuenta" del empleado (CU-20): nombre, foto y contraseña. El rol y las
// sucursales se ven, pero los cambia un administrador.
export function MiCuentaPanelPage() {
  const { datos, cargando, error } = useRecurso<CuentaUsuario>('/cuenta');
  const cuenta = datos?.tipo === 'EMPLEADO' ? datos : null;

  return (
    <div className="mx-auto max-w-2xl">
      <EncabezadoPagina titulo="Mi cuenta" />
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {cuenta && (
        <div className="space-y-4">
          <Panel titulo="Tus datos">
            <FormularioDatos cuenta={cuenta} />
          </Panel>
          <Panel titulo="Contraseña">
            <FormularioContrasena />
          </Panel>
        </div>
      )}
    </div>
  );
}

function FormularioDatos({ cuenta }: { cuenta: CuentaEmpleado }) {
  const { recargarSesion } = useSesion();
  const [nombre, setNombre] = useState(cuenta.nombreCompleto);
  const [fotoUrl, setFotoUrl] = useState(cuenta.fotoUrl);
  const [guardado, setGuardado] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const { enviar, enviando, error } = useGuardar();

  // Volver a editar saca el aviso de "guardado".
  useEffect(() => setGuardado(false), [nombre]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const respuesta = await enviar('/cuenta', 'PUT', { nombreCompleto: nombre });
    if (!respuesta) return;
    await recargarSesion();
    setGuardado(true);
  }

  async function subirFoto(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    setErrorFoto(null);
    if (archivo.size > LIMITE_FOTO_MB * 1024 * 1024) {
      setErrorFoto(`La foto puede pesar hasta ${LIMITE_FOTO_MB} MB`);
      return;
    }
    setSubiendoFoto(true);
    try {
      const respuesta = await subirArchivo<{ fotoUrl: string }>('/cuenta/foto', archivo);
      setFotoUrl(respuesta.fotoUrl);
    } catch (err) {
      setErrorFoto(err instanceof ApiError ? err.message : 'No se pudo subir la foto');
    } finally {
      setSubiendoFoto(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {fotoUrl ? (
          <img
            src={fotoUrl}
            alt={`Foto de ${cuenta.nombreCompleto}`}
            className="size-20 rounded-full border border-line object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-20 place-items-center rounded-full border border-line bg-panel text-meta"
          >
            <UserRound className="size-8" strokeWidth={1.6} />
          </span>
        )}
        <div className="space-y-1">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-line-strong bg-surface px-3 text-sm font-medium text-text hover:bg-panel has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-accent/20 sm:min-h-9">
            {subiendoFoto ? 'Subiendo…' : 'Cambiar foto'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={subiendoFoto}
              onChange={subirFoto}
              className="sr-only"
            />
          </label>
          <p className="text-xs text-meta">JPG, PNG o WEBP de hasta {LIMITE_FOTO_MB} MB</p>
        </div>
      </div>
      <Aviso>{errorFoto}</Aviso>

      <Campo etiqueta="Nombre completo">
        <input
          autoComplete="name"
          required
          maxLength={100}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={claseInput}
        />
      </Campo>

      <dl className="grid gap-3 sm:grid-cols-2">
        <Dato titulo="Email" valor={cuenta.email} />
        <Dato titulo="Rol" valor={cuenta.rol} />
        <Dato
          titulo="Sucursales"
          valor={cuenta.sucursales.length > 0 ? cuenta.sucursales.join(', ') : 'Sin sucursales'}
        />
      </dl>
      <p className="text-xs text-meta">Los cambia un administrador desde Personal.</p>

      <Aviso>{error}</Aviso>
      {guardado && <Aviso tono="ok">Datos guardados</Aviso>}
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar cambios'}
      </Boton>
    </form>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-sm font-medium text-text">{titulo}</dt>
      <dd className="text-sm text-meta [overflow-wrap:anywhere]">{valor}</dd>
    </div>
  );
}
