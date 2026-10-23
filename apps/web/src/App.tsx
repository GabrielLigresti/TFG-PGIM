import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { CodigoPermiso } from '@pgim/shared';
import { RutaProtegida } from './auth/RutaProtegida';
import { SesionProvider } from './auth/SesionProvider';
import { PanelLayout } from './components/PanelLayout';
import { LoginPage } from './pages/LoginPage';
import { PanelPage } from './pages/PanelPage';
import { InicioComensalPage } from './pages/comensal/InicioComensalPage';
import { MenuSucursalPage } from './pages/comensal/MenuSucursalPage';
import { PlatoPage } from './pages/comensal/PlatoPage';
import { SeleccionarSucursalPage } from './pages/SeleccionarSucursalPage';
import { InsumosPage } from './pages/panel/InsumosPage';
import { MenusPage } from './pages/panel/MenusPage';
import { PersonalPage } from './pages/panel/PersonalPage';
import { PlatosPage } from './pages/panel/PlatosPage';
import { RecetaEditorPage } from './pages/panel/RecetaEditorPage';
import { RecetasPage } from './pages/panel/RecetasPage';
import { RolesPage } from './pages/panel/RolesPage';
import { SalonPage } from './pages/panel/SalonPage';
import { SucursalesPage } from './pages/panel/SucursalesPage';

// Las pantallas del panel piden el permiso de lectura de su módulo.
function conPermiso(permiso: CodigoPermiso, pagina: ReactNode) {
  return (
    <RutaProtegida tipo="EMPLEADO" requiereSucursal permiso={permiso}>
      {pagina}
    </RutaProtegida>
  );
}

function paraComensal(pagina: ReactNode) {
  return <RutaProtegida tipo="COMENSAL">{pagina}</RutaProtegida>;
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
            <Route
              path="sucursales/:id/salon"
              element={conPermiso('sucursal.ver', <SalonPage />)}
            />
            <Route path="roles" element={conPermiso('rol.ver', <RolesPage />)} />
            <Route path="personal" element={conPermiso('personal.ver', <PersonalPage />)} />
            <Route path="insumos" element={conPermiso('insumo.ver', <InsumosPage />)} />
            <Route path="recetas" element={conPermiso('receta.ver', <RecetasPage />)} />
            <Route
              path="recetas/:tipo/:id"
              element={conPermiso('receta.ver', <RecetaEditorPage />)}
            />
            <Route path="platos" element={conPermiso('menu.ver', <PlatosPage />)} />
            <Route path="menus" element={conPermiso('menu.ver', <MenusPage />)} />
          </Route>
          <Route path="/inicio" element={paraComensal(<InicioComensalPage />)} />
          <Route path="/s/:sucursalId/menu" element={paraComensal(<MenuSucursalPage />)} />
          <Route path="/s/:sucursalId/platos/:id" element={paraComensal(<PlatoPage />)} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </SesionProvider>
  );
}
