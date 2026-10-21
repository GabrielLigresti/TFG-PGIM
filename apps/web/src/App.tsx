import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { CodigoPermiso } from '@pgim/shared';
import { RutaProtegida } from './auth/RutaProtegida';
import { SesionProvider } from './auth/SesionProvider';
import { PanelLayout } from './components/PanelLayout';
import { InicioComensalPage } from './pages/InicioComensalPage';
import { LoginPage } from './pages/LoginPage';
import { PanelPage } from './pages/PanelPage';
import { SeleccionarSucursalPage } from './pages/SeleccionarSucursalPage';
import { InsumosPage } from './pages/panel/InsumosPage';
import { PersonalPage } from './pages/panel/PersonalPage';
import { PlatosPage } from './pages/panel/PlatosPage';
import { RecetaEditorPage } from './pages/panel/RecetaEditorPage';
import { RecetasPage } from './pages/panel/RecetasPage';
import { RolesPage } from './pages/panel/RolesPage';
import { SucursalesPage } from './pages/panel/SucursalesPage';

// Las pantallas del panel piden el permiso de lectura de su módulo.
function conPermiso(permiso: CodigoPermiso, pagina: ReactNode) {
  return (
    <RutaProtegida tipo="EMPLEADO" requiereSucursal permiso={permiso}>
      {pagina}
    </RutaProtegida>
  );
}

export default function App() {
  return (
    <SesionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/sucursal"
            element={
              <RutaProtegida tipo="EMPLEADO">
                <SeleccionarSucursalPage />
              </RutaProtegida>
            }
          />
          <Route
            path="/panel"
            element={
              <RutaProtegida tipo="EMPLEADO" requiereSucursal>
                <PanelLayout />
              </RutaProtegida>
            }
          >
            <Route index element={<PanelPage />} />
            <Route path="sucursales" element={conPermiso('sucursal.ver', <SucursalesPage />)} />
            <Route path="roles" element={conPermiso('rol.ver', <RolesPage />)} />
            <Route path="personal" element={conPermiso('personal.ver', <PersonalPage />)} />
            <Route path="insumos" element={conPermiso('insumo.ver', <InsumosPage />)} />
            <Route path="recetas" element={conPermiso('receta.ver', <RecetasPage />)} />
            <Route
              path="recetas/:tipo/:id"
              element={conPermiso('receta.ver', <RecetaEditorPage />)}
            />
            <Route path="platos" element={conPermiso('menu.ver', <PlatosPage />)} />
          </Route>
          <Route
            path="/inicio"
            element={
              <RutaProtegida tipo="COMENSAL">
                <InicioComensalPage />
              </RutaProtegida>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
