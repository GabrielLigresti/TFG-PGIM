import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import type { CodigoPermiso } from '@pgim/shared';
import { RutaProtegida } from './auth/RutaProtegida';
import { SesionProvider } from './auth/SesionProvider';
import { ProveedorAvisos } from './components/AvisoEmergente';
import { ProveedorConfirmacion } from './components/Confirmacion';
import { PanelLayout } from './components/PanelLayout';
import { ProveedorCarrito } from './lib/carrito';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PanelPage } from './pages/PanelPage';
import { RegistroPage } from './pages/RegistroPage';
import { RegistroRestaurantePage } from './pages/RegistroRestaurantePage';
import { MenuSucursalPage } from './pages/comensal/MenuSucursalPage';
import { MiCuentaPage } from './pages/comensal/MiCuentaPage';
import { MisPuntosPage } from './pages/comensal/MisPuntosPage';
import { MiMesaPage } from './pages/comensal/MiMesaPage';
import { MisReservasPage } from './pages/comensal/MisReservasPage';
import { PedidoPage } from './pages/comensal/PedidoPage';
import { PlatoPage } from './pages/comensal/PlatoPage';
import { ReservarPage } from './pages/comensal/ReservarPage';
import { SeleccionarSucursalPage } from './pages/SeleccionarSucursalPage';
import { BeneficiosPage } from './pages/panel/BeneficiosPage';
import { ProgramaPuntosPage } from './pages/panel/ProgramaPuntosPage';
import { MiCuentaPanelPage } from './pages/panel/MiCuentaPanelPage';
import { MetricasPage } from './pages/panel/MetricasPage';
import { MisTurnosPage } from './pages/panel/MisTurnosPage';
import { AperturaPage } from './pages/panel/AperturaPage';
import { AlertasPage } from './pages/panel/AlertasPage';
import { CocinaPage } from './pages/panel/CocinaPage';
import { MenusPage } from './pages/panel/MenusPage';
import { PersonalPage } from './pages/panel/PersonalPage';
import { PlatosPage } from './pages/panel/PlatosPage';
import { RecetaEditorPage } from './pages/panel/RecetaEditorPage';
import { RecetasPage } from './pages/panel/RecetasPage';
import { ReservasPage } from './pages/panel/ReservasPage';
import { RolesPage } from './pages/panel/RolesPage';
import { SalonEnVivoPage } from './pages/panel/SalonEnVivoPage';
import { SalonPage } from './pages/panel/SalonPage';
import { StockPage } from './pages/panel/StockPage';
import { SucursalesPage } from './pages/panel/SucursalesPage';

// Las pantallas del panel piden el permiso de lectura de su módulo.
function conPermiso(permiso: CodigoPermiso, pagina: ReactNode) {
  return (
    <RutaProtegida tipo="EMPLEADO" requiereSucursal permiso={permiso}>
      {pagina}
    </RutaProtegida>
  );
}

// Igual, pero alcanza con tener uno de los permisos.
function conAlgunPermiso(permisos: CodigoPermiso[], pagina: ReactNode) {
  return (
    <RutaProtegida tipo="EMPLEADO" requiereSucursal permiso={permisos}>
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
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/registro" element={<RegistroPage />} />
                <Route path="/registrar-restaurante" element={<RegistroRestaurantePage />} />
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
                    // Sin sucursal elegida igual se abre "Mi cuenta": cada pantalla pide la suya.
                    <RutaProtegida tipo="EMPLEADO">
                      <PanelLayout />
                    </RutaProtegida>
                  }
                >
                  <Route
                    index
                    element={
                      <RutaProtegida tipo="EMPLEADO" requiereSucursal>
                        <PanelPage />
                      </RutaProtegida>
                    }
                  />
                  <Route
                    path="mi-cuenta"
                    element={
                      <RutaProtegida tipo="EMPLEADO">
                        <MiCuentaPanelPage />
                      </RutaProtegida>
                    }
                  />
                  <Route path="salon" element={conPermiso('reserva.ver', <SalonEnVivoPage />)} />
                  <Route path="reservas" element={conPermiso('reserva.ver', <ReservasPage />)} />
                  <Route path="cocina" element={conPermiso('pedido.ver', <CocinaPage />)} />
                  <Route
                    path="apertura"
                    element={conPermiso('apertura.consultar', <AperturaPage />)}
                  />
                  <Route path="metricas" element={conPermiso('metrica.ver', <MetricasPage />)} />
                  <Route path="mis-turnos" element={conPermiso('turno.ver', <MisTurnosPage />)} />
                  <Route
                    path="alertas"
                    element={conAlgunPermiso(['stock.registrar', 'reserva.ver'], <AlertasPage />)}
                  />
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
                  <Route path="insumos" element={<Navigate to="/panel/stock" replace />} />
                  <Route
                    path="stock"
                    element={conAlgunPermiso(['insumo.ver', 'stock.registrar'], <StockPage />)}
                  />
                  <Route path="recetas" element={conPermiso('receta.ver', <RecetasPage />)} />
                  <Route
                    path="recetas/:tipo/:id"
                    element={conPermiso('receta.ver', <RecetaEditorPage />)}
                  />
                  <Route path="platos" element={conPermiso('menu.ver', <PlatosPage />)} />
                  <Route path="menus" element={conPermiso('menu.ver', <MenusPage />)} />
                </Route>
                <Route path="/inicio" element={<Navigate to="/" replace />} />
                <Route path="/s/:sucursalId/menu" element={<MenuSucursalPage />} />
                <Route path="/s/:sucursalId/platos/:id" element={<PlatoPage />} />
                <Route path="/s/:sucursalId/reservar" element={paraComensal(<ReservarPage />)} />
                <Route path="/s/:sucursalId/pedido" element={paraComensal(<PedidoPage />)} />
                <Route path="/reservas" element={paraComensal(<MisReservasPage />)} />
                <Route path="/mesa" element={paraComensal(<MiMesaPage />)} />
                <Route path="/cuenta" element={paraComensal(<MiCuentaPage />)} />
                <Route path="/puntos" element={paraComensal(<MisPuntosPage />)} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </ProveedorConfirmacion>
          </BrowserRouter>
        </ProveedorCarrito>
      </ProveedorAvisos>
    </SesionProvider>
  );
}
