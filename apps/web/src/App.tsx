import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { CodigoPermiso } from '@pgim/shared';
import { RutaProtegida } from './auth/RutaProtegida';
import { SesionProvider } from './auth/SesionProvider';
import { ProveedorAvisos } from './components/AvisoEmergente';
import { ProveedorConfirmacion } from './components/Confirmacion';
import { PanelLayout } from './components/PanelLayout';
import { ProveedorCarrito } from './lib/carrito';
import { LoginPage } from './pages/LoginPage';
import { PanelPage } from './pages/PanelPage';
import { RegistroPage } from './pages/RegistroPage';
import { InicioComensalPage } from './pages/comensal/InicioComensalPage';
import { MenuSucursalPage } from './pages/comensal/MenuSucursalPage';
import { MisPuntosPage } from './pages/comensal/MisPuntosPage';
import { MiMesaPage } from './pages/comensal/MiMesaPage';
import { MisReservasPage } from './pages/comensal/MisReservasPage';
import { PedidoPage } from './pages/comensal/PedidoPage';
import { PlatoPage } from './pages/comensal/PlatoPage';
import { ReservarPage } from './pages/comensal/ReservarPage';
import { SeleccionarSucursalPage } from './pages/SeleccionarSucursalPage';
import { BeneficiosPage } from './pages/panel/BeneficiosPage';
import { ProgramaPuntosPage } from './pages/panel/ProgramaPuntosPage';
import { AlertasPage } from './pages/panel/AlertasPage';
import { CocinaPage } from './pages/panel/CocinaPage';
import { InsumosPage } from './pages/panel/InsumosPage';
import { MenusPage } from './pages/panel/MenusPage';
import { PersonalPage } from './pages/panel/PersonalPage';
import { PlatosPage } from './pages/panel/PlatosPage';
import { RecetaEditorPage } from './pages/panel/RecetaEditorPage';
import { RecetasPage } from './pages/panel/RecetasPage';
import { ReservasPage } from './pages/panel/ReservasPage';
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
      <ProveedorAvisos>
        <ProveedorCarrito>
          <BrowserRouter>
            <ProveedorConfirmacion>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/registro" element={<RegistroPage />} />
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
                  <Route path="reservas" element={conPermiso('reserva.ver', <ReservasPage />)} />
                  <Route path="cocina" element={conPermiso('pedido.ver', <CocinaPage />)} />
                  <Route path="alertas" element={conPermiso('stock.registrar', <AlertasPage />)} />
                  <Route
                    path="sucursales"
                    element={conPermiso('sucursal.ver', <SucursalesPage />)}
                  />
                  <Route
                    path="sucursales/:id/salon"
                    element={conPermiso('sucursal.ver', <SalonPage />)}
                  />
                  <Route
                    path="programa-puntos"
                    element={conPermiso('beneficio.ver', <ProgramaPuntosPage />)}
                  />
                  <Route
                    path="beneficios"
                    element={conPermiso('beneficio.ver', <BeneficiosPage />)}
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
                <Route path="/s/:sucursalId/reservar" element={paraComensal(<ReservarPage />)} />
                <Route path="/s/:sucursalId/pedido" element={paraComensal(<PedidoPage />)} />
                <Route path="/reservas" element={paraComensal(<MisReservasPage />)} />
                <Route path="/mesa" element={paraComensal(<MiMesaPage />)} />
                <Route path="/puntos" element={paraComensal(<MisPuntosPage />)} />
                <Route path="*" element={<Navigate to="/login" replace />} />
              </Routes>
            </ProveedorConfirmacion>
          </BrowserRouter>
        </ProveedorCarrito>
      </ProveedorAvisos>
    </SesionProvider>
  );
}
