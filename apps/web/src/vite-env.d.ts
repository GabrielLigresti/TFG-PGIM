/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Client ID de Google para el ingreso del comensal; sin él no se muestra el botón.
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
