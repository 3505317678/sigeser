import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router-dom'
import { Marco } from './componentes/Marco'
import { Cargando, Vacio } from './componentes/ui'
import { Auditoria } from './paginas/Auditoria'
import { Ayuda } from './paginas/Ayuda'
import { DetalleCliente, ListaClientes } from './paginas/Clientes'
import { Cuenta } from './paginas/Cuenta'
import { Ingreso } from './paginas/Ingreso'
import { KardexRepuesto, ListaInventario } from './paginas/Inventario'
import { DetalleOrden } from './paginas/ordenes/DetalleOrden'
import { ListaOrdenes } from './paginas/ordenes/ListaOrdenes'
import { NuevaOrden } from './paginas/ordenes/NuevaOrden'
import { Panel } from './paginas/Panel'
import { Tecnicos } from './paginas/Tecnicos'
import { Usuarios } from './paginas/Usuarios'
import { RequierePermiso, RequiereSesion } from './sesion/Protegida'
import { useSesion } from './sesion/Sesion'

// La librería de gráficos solo se descarga al abrir Reportes.
const Reportes = lazy(() => import('./paginas/Reportes'))

const con = (permisos: string[], pagina: ReactNode) => <RequierePermiso permisos={permisos}>{pagina}</RequierePermiso>

function Inicio() {
  const { puede } = useSesion()
  return <Navigate to={puede('reportes.ver') ? '/panel' : '/ordenes'} replace />
}

function NoEncontrada() {
  return (
    <Vacio icono="signpost-split" titulo="Esta página no existe" accion={<Link to="/">Ir al inicio</Link>}>
      Revise la dirección o vuelva al inicio desde el menú.
    </Vacio>
  )
}

const VER_ORDENES = ['ordenes.ver_todas', 'ordenes.ver_asignadas']

const enrutador = createBrowserRouter([
  { path: '/ingresar', element: <Ingreso /> },
  {
    path: '/',
    element: (
      <RequiereSesion>
        <Marco />
      </RequiereSesion>
    ),
    children: [
      { index: true, element: <Inicio /> },
      { path: 'panel', element: con(['reportes.ver'], <Panel />) },
      { path: 'ordenes', element: con(VER_ORDENES, <ListaOrdenes />) },
      { path: 'ordenes/nueva', element: con(['ordenes.crear'], <NuevaOrden />) },
      { path: 'ordenes/:id', element: con(VER_ORDENES, <DetalleOrden />) },
      { path: 'clientes', element: con(['clientes.ver', 'clientes.gestionar'], <ListaClientes />) },
      { path: 'clientes/:id', element: con(['clientes.ver', 'clientes.gestionar'], <DetalleCliente />) },
      { path: 'inventario', element: con(['inventario.ver', 'inventario.gestionar'], <ListaInventario />) },
      { path: 'inventario/:id', element: con(['inventario.ver', 'inventario.gestionar'], <KardexRepuesto />) },
      { path: 'tecnicos', element: con(['tecnicos.ver', 'tecnicos.gestionar'], <Tecnicos />) },
      {
        path: 'reportes',
        element: con(
          ['reportes.ver'],
          <Suspense fallback={<Cargando />}>
            <Reportes />
          </Suspense>,
        ),
      },
      { path: 'usuarios', element: con(['usuarios.gestionar'], <Usuarios />) },
      { path: 'auditoria', element: con(['auditoria.ver'], <Auditoria />) },
      { path: 'cuenta', element: <Cuenta /> },
      { path: 'ayuda', element: <Ayuda /> },
      { path: '*', element: <NoEncontrada /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={enrutador} />
}
