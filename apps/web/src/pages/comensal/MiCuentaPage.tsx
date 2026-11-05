import { useEffect, useState, type FormEvent } from 'react';
import type { CuentaUsuario } from '@pgim/shared';
import { useSesion } from '../../auth/SesionProvider';
import { FormularioContrasena } from '../../components/FormularioContrasena';
import { LayoutComensal, TituloComensal } from '../../components/LayoutComensal';
import { Aviso, Boton, Campo, EstadoCarga, Panel, claseInput } from '../../components/ui';
import { useGuardar } from '../../lib/useGuardar';
import { useRecurso } from '../../lib/useRecurso';

// "Mi cuenta" del comensal (CU-20): sus datos y su contraseña.
export function MiCuentaPage() {
  const { datos, cargando, error } = useRecurso<CuentaUsuario>('/cuenta');
  const cuenta = datos?.tipo === 'COMENSAL' ? datos : null;

  return (
    <LayoutComensal>
      <div className="mb-4">
        <TituloComensal>Mi cuenta</TituloComensal>
      </div>
      <EstadoCarga cargando={cargando && !datos} error={error} />
      {cuenta && (
        <div className="space-y-4">
          <Panel titulo="Tus datos">
            <FormularioDatos
              email={cuenta.email}
              nombre={cuenta.nombre}
              telefono={cuenta.telefono}
            />
          </Panel>
          <Panel titulo="Contraseña">
            <FormularioContrasena />
          </Panel>
        </div>
      )}
    </LayoutComensal>
  );
}

function FormularioDatos({
  email,
  nombre: nombreInicial,
  telefono: telefonoInicial,
}: {
  email: string;
  nombre: string;
  telefono: string | null;
}) {
  const { recargarSesion } = useSesion();
  const [nombre, setNombre] = useState(nombreInicial);
  const [telefono, setTelefono] = useState(telefonoInicial ?? '');
  const [guardado, setGuardado] = useState(false);
  const { enviar, enviando, error } = useGuardar();

  // Volver a editar saca el aviso de "guardado".
  useEffect(() => setGuardado(false), [nombre, telefono]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const respuesta = await enviar('/cuenta', 'PUT', { nombre, telefono });
    if (!respuesta) return;
    await recargarSesion();
    setGuardado(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-text">Email</p>
        <p className="text-sm text-meta [overflow-wrap:anywhere]">{email}</p>
      </div>
      <Campo etiqueta="Nombre">
        <input
          autoComplete="name"
          required
          maxLength={100}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className={claseInput}
        />
      </Campo>
      <Campo etiqueta="Teléfono (opcional)">
        <input
          type="tel"
          autoComplete="tel"
          maxLength={30}
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          className={claseInput}
        />
      </Campo>
      <Aviso>{error}</Aviso>
      {guardado && <Aviso tono="ok">Datos guardados</Aviso>}
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar cambios'}
      </Boton>
    </form>
  );
}
