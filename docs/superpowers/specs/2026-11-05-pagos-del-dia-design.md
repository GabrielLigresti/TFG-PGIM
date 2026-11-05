# CU-23 Consultar pagos del día — diseño

## Objetivo

Una pestaña del panel donde el personal con `pago.ver` confirma, en vivo, que el
pago de una mesa llegó: cada pago que Mercado Pago aprueba o rechaza aparece sin
recargar, junto con los totales cobrados en el día.

## Alcance

**Incluye**

- Pagos `APROBADO` y `RECHAZADO` del día de hoy (calendario de Argentina) de la
  sucursal de trabajo.
- Totales del día: monto cobrado, cantidad de aprobados y de rechazados, y el
  cobrado por método (tarjeta, billetera virtual, sin método informado).
- Actualización en vivo por Socket.IO, solo para quien tenga `pago.ver` en esa
  sucursal.

**No incluye**

- Pagos `PENDIENTE`: los abandonados quedarían pendientes para siempre.
- El "cobro sin acreditar" (Mercado Pago aprueba sobre un pago ya resuelto). Hoy
  se registra en el log; mostrarlo exige persistirlo, que es un cambio de modelo
  aparte.
- Otros días, otras sucursales y exportaciones: para períodos está Métricas
  (CU-19).
- Cambios en los roles predeterminados: `pago.ver` se asigna desde Roles.

## Modelo

- **Caso de uso nuevo:** CU-23 "Consultar pagos del día". Actor: Empleado (con
  `pago.ver`). Se agrega al diagrama general (`casos-de-uso/0-general`), se
  regenera su imagen y se registra en `HISTORIAL.md` antes de escribir código.
- **Sin cambios en el schema ni en los DER.** Se leen `Pago`, `Comprobante`,
  `CuentaMesa`, `Reserva`, `Mesa` y `Comensal` tal como están.
- **Sin cambios en los eventos de dominio:** se reutilizan `PAGO_APROBADO` y
  `PAGO_RECHAZADO`, que ya llevan `sucursalId`.

## Diseño

### Contrato (`packages/shared/src/pago.ts`)

```ts
export interface PagoDelDia {
  id: string;
  fecha: string; // ISO; la de `Pago.fecha`
  mesaNumero: number;
  comensalNombre: string;
  monto: number;
  metodo: MetodoPago | null; // null: pago de $0 o pasarela de prueba
  estado: 'APROBADO' | 'RECHAZADO';
  comprobanteNumero: string | null; // solo los aprobados tienen comprobante
}

export interface PagosDelDia {
  fecha: string; // AAAA-MM-DD de Argentina
  totales: {
    cobrado: number; // suma de los aprobados
    aprobados: number;
    rechazados: number;
    porMetodo: { TARJETA: number; BILLETERA_VIRTUAL: number; SIN_METODO: number };
  };
  pagos: PagoDelDia[]; // más nuevos primero
}
```

En `EVENTOS_SOCKET` se suma `pagosCambio: 'pagos:cambio'`, un aviso sin datos.

### API

- **Ruta:** `GET /api/pagos/hoy` en `routes/pagos.ts`, montada antes de
  `/pagos/webhook` sin pisarla. Cadena: `autenticar` → `tenant` →
  `requierePermiso('pago.ver')`. La sucursal sale de `sucursalDeTrabajo(req)`,
  igual que en Cocina; sin sucursal de trabajo responde 409.
- **Servicio (`pagos-del-dia.service.ts`):** calcula hoy con `hoyArgentina(ahora)`,
  pide los pagos al repositorio y arma los totales con una función pura
  `resumirPagosDelDia(pagos)`, testeable sin base.
- **Repositorio (`pagos-del-dia.repository.ts`):**
  `delDia(restauranteId, sucursalId, desde, hasta)` filtra:
  - `estado in (APROBADO, RECHAZADO)`;
  - `fecha` en `[inicio del día, inicio del día siguiente)`, con el mismo cálculo
    de inicio de día de Argentina que `metrica.repository` (se extrae a un helper
    compartido en `lib/` para no duplicarlo);
  - `cuentaMesa.reserva.sucursalId = sucursalId` y
    `cuentaMesa.reserva.sucursal.restauranteId = restauranteId`, porque `Pago` no
    tiene `sucursal_id`.

  Ordena por `fecha` descendente y trae el número de mesa, el nombre del comensal
  y el número de comprobante. Los montos se convierten a `number`.

`Pago.fecha` es el instante de creación del pago, no el de la aprobación. Es el
mismo criterio de Métricas, así que el cobrado de hoy coincide con lo que
Métricas mostrará para esta fecha a partir de mañana.

### Tiempo real

En el NotificadorStaff (`realtime/notificadores.ts`), ante `PAGO_APROBADO` o
`PAGO_RECHAZADO` se emite `pagosCambio` a los sockets de
`salaSucursal(sucursalId)` que cumplan las tres condiciones:

1. `sesion.usuario.tipo === 'EMPLEADO'`;
2. `sesion.sucursalActiva?.id === sucursalId`;
3. `sesion.permisos.includes('pago.ver')`.

Es el mismo patrón que `ALERTA_CREADA`. No va a `salaPersonal`, que incluye a
cocina. El aviso no lleva datos: la pantalla vuelve a pedir `GET /api/pagos/hoy`.
Así la lista y los totales salen siempre de la misma consulta y el socket no
expone montos. Un error al emitir se ignora, porque el pago ya quedó guardado.

### Web

- **Ruta:** `/panel/pagos` en `App.tsx`, envuelta en `conPermiso('pago.ver', …)`.
- **Sección:** nueva en `SECCIONES` de `PanelLayout`, grupo Operación, con el
  permiso `pago.ver`. Nombre: "Pagos del día".
- **Pantalla:** `pages/panel/PagosDelDiaPage.tsx`.
  - Usa `useRecurso<PagosDelDia>('/pagos/hoy')`.
  - Con `useEventoSocket(EVENTOS_SOCKET.pagosCambio, recargar)` vuelve a pedir
    los datos; con `useConexionSocket` también recarga al reconectarse, para no
    perder pagos ocurridos mientras estaba desconectada.
  - **Cabecera:** el total cobrado, más la cantidad de aprobados y de rechazados,
    y lo cobrado por método.
  - **Lista:** hora, mesa, comensal, monto, método, estado y comprobante, con los
    más nuevos primero. Un pago que llega mientras se está mirando se resalta un
    momento para que se note.
  - **Textos:** los enums se traducen ("Aprobado", "Rechazado", "Tarjeta",
    "Billetera virtual", "Sin cobro" cuando el método es null). El estado vacío
    dice "Todavía no hay pagos hoy".
- La dirección visual se define con `/impeccable` y respeta `DESIGN.md`; se usan
  los componentes de `ui.tsx` y `lib/estados.ts`.

## Errores

- Sin `pago.ver`: 403 (middleware). Sin sucursal de trabajo: 409 con
  "Elegí una sucursal de trabajo".
- Si falla la recarga después de un aviso, la pantalla conserva los datos
  anteriores y muestra el error de `useRecurso`.

## Tests

- **Servicio:** `resumirPagosDelDia` suma solo los aprobados, cuenta los
  rechazados y agrupa por método, incluido `null` (SIN_METODO).
- **Repositorio (db test):**
  - Solo devuelve pagos de la sucursal y el restaurante pedidos.
  - Excluye los `PENDIENTE`.
  - Respeta el borde del día de Argentina: un pago a las 23:30 de ayer no entra
    y uno a las 00:10 de hoy sí.
- **Ruta (Supertest):** 200 con `pago.ver`, 403 sin el permiso y 409 sin
  sucursal de trabajo.
- **Notificador:** `pagosCambio` llega a un empleado con `pago.ver` en esa
  sucursal. No llega a un empleado sin el permiso, a uno de otra sucursal ni a
  un comensal.

## Cierre

Plan con tareas marcadas con **Agente** y **Crítica**. Críticas: el repositorio
(filtro multi-tenant) y el filtro del notificador. Antes de la pantalla se corre
`impeccable context --target`. Al final, evaluación con `ux-heuristics` a 390 y
1440 px y revisión con `revisor-pr`.
