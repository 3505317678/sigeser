import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import 'bootstrap-icons/font/bootstrap-icons.min.css'
import './estilos/tokens.css'
import './estilos/base.css'
import './estilos/componentes.css'
import './estilos/layout.css'
import './estilos/multimedia.css'
import { ErrorApi } from './api/cliente'
import App from './App'
import { ProveedorNotificaciones } from './componentes/Notificaciones'
import { ProveedorSesion } from './sesion/Sesion'

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      // No se reintentan errores del cliente (permisos, validación, inexistente): repetirlos no cambia el resultado.
      retry: (intentos, error) => !(error instanceof ErrorApi && error.status >= 400 && error.status < 500) && intentos < 2,
    },
    mutations: { retry: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <ProveedorNotificaciones>
        <ProveedorSesion>
          <App />
        </ProveedorSesion>
      </ProveedorNotificaciones>
    </QueryClientProvider>
  </StrictMode>,
)
