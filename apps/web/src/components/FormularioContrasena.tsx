import { useState, type FormEvent } from 'react';
import { Aviso, Boton, Campo, claseInput } from './ui';
import { useGuardar } from '../lib/useGuardar';

const ERROR_ACTUAL = 'La contraseña actual no es correcta';

// Cambio de contraseña de CU-20: lo comparten el comensal y el empleado.
export function FormularioContrasena() {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errorRepetida, setErrorRepetida] = useState<string | null>(null);
  const [guardada, setGuardada] = useState(false);
  const { enviar, enviando, error } = useGuardar();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGuardada(false);
    if (nueva !== repetida) {
      setErrorRepetida('Las contraseñas no coinciden');
      return;
    }
    setErrorRepetida(null);
    const respuesta = await enviar('/cuenta/contrasena', 'PUT', { actual, nueva });
    if (!respuesta) return;
    setActual('');
    setNueva('');
    setRepetida('');
    setGuardada(true);
  }

  // El error de la contraseña actual va en su campo; el resto (límite de intentos, etc.) arriba.
  const errorActual = error === ERROR_ACTUAL ? error : undefined;
  const errorGeneral = errorActual ? null : error;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Campo etiqueta="Contraseña actual" error={errorActual}>
        <input
          type="password"
          autoComplete="current-password"
          required
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className={claseInput}
        />
      </Campo>
      <Campo etiqueta="Contraseña nueva" ayuda="Al menos 8 caracteres">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className={claseInput}
        />
      </Campo>
      <Campo etiqueta="Repetir contraseña nueva" error={errorRepetida ?? undefined}>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className={claseInput}
        />
      </Campo>
      <Aviso>{errorGeneral}</Aviso>
      {guardada && <Aviso tono="ok">Contraseña actualizada</Aviso>}
      <Boton type="submit" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Cambiar contraseña'}
      </Boton>
    </form>
  );
}
