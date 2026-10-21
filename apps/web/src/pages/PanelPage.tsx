import { Link } from 'react-router';
import { useSesion } from '../auth/SesionProvider';
import { SECCIONES } from '../components/PanelLayout';

export function PanelPage() {
  const { tienePermiso } = useSesion();
  const visibles = SECCIONES.filter((s) => tienePermiso(s.permiso));

  if (visibles.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Tu rol todavía no tiene pantallas de gestión disponibles.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visibles.map((s) => (
        <li key={s.ruta}>
          <Link
            to={`/panel/${s.ruta}`}
            className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-slate-400"
          >
            <p className="font-medium text-slate-800">{s.titulo}</p>
            <p className="text-sm text-slate-500">{s.descripcion}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
