import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RutaProtegida } from './auth/RutaProtegida';
import { SesionProvider } from './auth/SesionProvider';
import { InicioComensalPage } from './pages/InicioComensalPage';
import { LoginPage } from './pages/LoginPage';
import { PanelPage } from './pages/PanelPage';
import { SeleccionarSucursalPage } from './pages/SeleccionarSucursalPage';

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
                <PanelPage />
              </RutaProtegida>
            }
          />
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
