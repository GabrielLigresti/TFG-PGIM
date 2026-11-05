# CU-23 Consultar pagos del día — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** una pestaña del panel, "Pagos del día", donde quien tiene `pago.ver` ve en vivo los pagos aprobados y rechazados de hoy en su sucursal de trabajo, con los totales cobrados.

**Architecture:**
- **API:** `GET /api/pagos/hoy` sigue la cadena ruta → servicio → repositorio. El repositorio filtra por restaurante y sucursal a través de `cuenta_mesa → reserva`.
- **Tiempo real:** ante `PAGO_APROBADO` o `PAGO_RECHAZADO`, el NotificadorStaff manda un aviso sin datos, `pagos:cambio`, solo a los sockets con `pago.ver` en esa sucursal. La pantalla vuelve a pedir el recurso.

**Tech Stack:** Express, Prisma 7, Socket.IO, React con Tailwind, Jest y Supertest.

**Spec:** `docs/superpowers/specs/2026-11-05-pagos-del-dia-design.md`

## Global Constraints

- Sin cambios en `schema.prisma`, en los DER ni en los eventos de dominio de `domain/eventos.ts`.
- Toda consulta filtra por `restauranteId` y por `sucursalId`.
- "Hoy" es el día de Argentina: `hoyArgentina(ahora)` de `@pgim/shared`. El día arranca a las 03:00 UTC.
- Estados incluidos: solo `APROBADO` y `RECHAZADO`; nunca `PENDIENTE`.
- Se ordena por `Pago.fecha` descendente (el instante de creación, mismo criterio que Métricas).
- Textos de la interfaz: "Pagos del día", "Aprobado", "Rechazado", "Tarjeta", "Billetera virtual", "Sin cobro" (método null) y "Todavía no hay pagos hoy".
- Sin dependencias nuevas.
- Commits pequeños, con el mensaje en español.

## Review Focus

1. **`/api/pagos/webhook` no puede quedar detrás de `autenticar`.** El router nuevo vive bajo `/api/pagos`. Si usa `router.use(autenticar…)` y se monta antes del webhook, Mercado Pago recibe 401. → El test de la tarea 4 prueba que el webhook sigue respondiendo sin sesión.
2. **Borde del día de Argentina:** un pago a las 23:30 de ayer (02:30 UTC de hoy) no entra, y uno a las 00:10 de hoy (03:10 UTC) sí. → Tarea 3.
3. **Pagos de otra sucursal o de otro restaurante** nunca aparecen. → Tarea 3.
4. **Un empleado de cocina en la misma sala no recibe el aviso**, ni otro con `pago.ver` cuya sucursal activa sea otra. → Tarea 5.
5. **Pago aprobado de $0 o con la pasarela de prueba (`metodo` null):** cuenta como aprobado, suma 0 y va a `SIN_METODO`. → Tarea 2.

---

### Task 1: CU-23 en el modelo

**Agente:** Opus en línea · **Crítica:** no

**Files:**
- Modify: `docs/modelos/casos-de-uso/0-general/v1/cu-general-v1.puml`
- Modify: `docs/modelos/casos-de-uso/0-general/v1/cu-general-v1.png` (regenerada)
- Modify: `docs/modelos/HISTORIAL.md` (fila "0 — General")

- [ ] **Step 1:** Agregar `usecase "CU-23 Consultar\npagos del día" as CU23` en el rectángulo "Menú, pedidos, pago y fidelización", con las asociaciones `GER -- CU23` y `STF -- CU23`. Si hace falta, sumar una línea `-[hidden]-` para que la grilla no se desarme.
- [ ] **Step 2:** Regenerar el `.png` con PlantUML (`java -jar plantuml.jar`, el mismo tema del archivo) y revisar la imagen.
- [ ] **Step 3:** En `HISTORIAL.md`, agregar al final de la fila "0 — General": *Menor (05/11):* CU-23 Consultar pagos del día, en el módulo de pagos, con los actores Gerente de sucursal y Staff (quien tenga «ver pagos»); confirma en vivo los pagos aprobados y rechazados del día de su sucursal.
- [ ] **Step 4:** Commit: `Agregar CU-23 Consultar pagos del día al diagrama general`.

---

### Task 2: Contrato compartido y resumen del día

**Agente:** implementador · **Crítica:** no

**Files:**
- Modify: `packages/shared/src/pago.ts` (tipos)
- Modify: `packages/shared/src/reserva.ts:75-86` (`EVENTOS_SOCKET`)
- Create: `apps/api/src/domain/pagos-del-dia.ts`
- Test: `apps/api/src/domain/pagos-del-dia.test.ts`

**Interfaces:**
- Produces, en `@pgim/shared`:
  - `PagoDelDia { id: string; fecha: string; mesaNumero: number; comensalNombre: string; monto: number; metodo: MetodoPago | null; estado: 'APROBADO' | 'RECHAZADO'; comprobanteNumero: string | null }`
  - `TotalesPagosDelDia { cobrado: number; aprobados: number; rechazados: number; porMetodo: { TARJETA: number; BILLETERA_VIRTUAL: number; SIN_METODO: number } }`
  - `PagosDelDia { fecha: string; totales: TotalesPagosDelDia; pagos: PagoDelDia[] }`
  - `EVENTOS_SOCKET.pagosCambio = 'pagos:cambio'`
- Produces, en `apps/api/src/domain/pagos-del-dia.ts`: `resumirPagosDelDia(pagos: PagoDelDia[]): TotalesPagosDelDia`

- [ ] **Step 1: test que falla.** En `pagos-del-dia.test.ts`, `describe('resumirPagosDelDia')` con estos casos:
  - `[]` → `{ cobrado: 0, aprobados: 0, rechazados: 0, porMetodo: { TARJETA: 0, BILLETERA_VIRTUAL: 0, SIN_METODO: 0 } }`.
  - Aprobado TARJETA 1500, aprobado BILLETERA_VIRTUAL 2000.50, rechazado TARJETA 999 y aprobado con `metodo: null` y monto 0 → `cobrado: 3500.5`, `aprobados: 3`, `rechazados: 1`, `porMetodo: { TARJETA: 1500, BILLETERA_VIRTUAL: 2000.5, SIN_METODO: 0 }`. El rechazado no suma en ningún método.
  - Montos con centavos: aprobados de 0.1 y 0.2 → `cobrado: 0.3`. Redondear a 2 decimales para evitar `0.30000000000000004`.
- [ ] **Step 2:** `npx jest -w @pgim/api src/domain/pagos-del-dia.test.ts` → falla porque el módulo no existe.
- [ ] **Step 3:** Implementar los tipos, el evento y `resumirPagosDelDia`. Compilar shared con `npm run build -w @pgim/shared`.
- [ ] **Step 4:** Volver a correr el test → pasa. `npm run typecheck` → sin errores.
- [ ] **Step 5:** Commit: `Agregar el contrato de los pagos del día y su resumen`.

---

### Task 3: Repositorio de los pagos del día

**Agente:** implementador · **Crítica:** sí (filtro multi-tenant y borde del día)

**Files:**
- Create: `apps/api/src/lib/dia-argentina.ts`
- Modify: `apps/api/src/repositories/metrica.repository.ts:64` (usar el helper)
- Create: `apps/api/src/repositories/pagos-del-dia.repository.ts`
- Test: `apps/api/src/repositories/pagos-del-dia.repository.db.test.ts`

**Interfaces:**
- Produces:
  - `inicioDeDiaArgentina(fecha: string): Date`, que es `aFecha(fecha) + 3 h`. Es la misma fórmula que hoy está en `metrica.repository.ts:64`; Métricas pasa a usar el helper.
  - `pagosDelDiaRepository.delDia(restauranteId: string, sucursalId: string, fecha: string): Promise<PagoDelDia[]>`
  - El tipo `PagosDelDiaRepository`, para mockearlo.

- [ ] **Step 1: test que falla.** En el db test, con `limpiarBase()` y `crearEscenario()`, `describe('pagos del día (CU-23)')` con estos casos:
  - **Devuelve solo los resueltos, más nuevos primero:**
    - Datos: un APROBADO TARJETA de 1500 con comprobante número `'0001'`, un RECHAZADO y un PENDIENTE, todos del 2026-11-05 en el horario de Argentina.
    - Resultado: dos filas, con `estado` `['RECHAZADO', 'APROBADO']` si el rechazado es posterior. La fila aprobada trae `mesaNumero: 4`, `comensalNombre: 'Comensal de prueba'`, `monto: 1500` (number), `metodo: 'TARJETA'` y `comprobanteNumero: '0001'`. La rechazada trae `comprobanteNumero: null`.
  - **Borde del día:** con `fecha: '2026-11-05'`, un pago en `2026-11-05T02:30:00Z` no entra, uno en `2026-11-05T03:10:00Z` entra y uno en `2026-11-06T02:59:00Z` entra.
  - **Aislamiento:** un pago de otra sucursal del mismo restaurante, y uno de otro restaurante, no aparecen. Crear la sucursal, la mesa, la reserva y la cuenta propias en el test.
- [ ] **Step 2:** `npm run db:up`, después `npx jest -w @pgim/api pagos-del-dia.repository` → falla.
- [ ] **Step 3:** Implementar. El filtro es:
  - `estado: { in: ['APROBADO', 'RECHAZADO'] }`;
  - `fecha` entre `inicioDeDiaArgentina(fecha)` (incluido) y `inicioDeDiaArgentina(sumarDias(fecha, 1))` (excluido);
  - `cuentaMesa: { reserva: { sucursalId, sucursal: { restauranteId } } }`.

  Ordenar con `orderBy: { fecha: 'desc' }`. Seleccionar la mesa, el comensal y el comprobante. Convertir `monto` con `Number` y la fecha con `toISOString()`.
- [ ] **Step 4:** El test nuevo y `metrica.repository.db.test.ts` pasan.
- [ ] **Step 5:** Commit: `Agregar el repositorio de los pagos del día`.

---

### Task 4: Servicio y ruta `GET /api/pagos/hoy`

**Agente:** implementador · **Crítica:** no

**Files:**
- Create: `apps/api/src/services/pagos-del-dia.service.ts`
- Test: `apps/api/src/services/pagos-del-dia.service.test.ts`
- Create: `apps/api/src/routes/pagos.ts`
- Test: `apps/api/src/routes/pagos.test.ts`
- Modify: `apps/api/src/app.ts:90` (montar `pagosRouter` en `${API_PREFIX}/pagos`, debajo del webhook)

**Interfaces:**
- Consumes: `pagosDelDiaRepository.delDia` (tarea 3) y `resumirPagosDelDia` (tarea 2).
- Produces:
  - `createPagosDelDiaService(repo: PagosDelDiaRepository)` devuelve `{ delDia(restauranteId: string, sucursalId: string, ahora: Date): Promise<PagosDelDia> }`.
  - `pagosDelDiaService`, la instancia por defecto.
  - `pagosRouter`.

- [ ] **Step 1: tests que fallan.**
  - **Servicio**, con el repositorio falso: con `ahora = new Date('2026-11-06T02:00:00Z')` (23:00 del 05 en Argentina), llama a `delDia(r, s, '2026-11-05')` y devuelve `{ fecha: '2026-11-05', totales: resumirPagosDelDia(filas), pagos: filas }`.
  - **Ruta**, con Supertest, mockeando `usuario.repository` y `pagos-del-dia.repository` como en `metricas.test.ts`:
    - Sin sesión → 401.
    - Con `cookieConPermisos(['pedido.ver'])` → 403.
    - Con `cookieConPermisos(['pago.ver'])` → 200, con `res.body.pagos` igual a `[]` y `res.body.totales.cobrado` igual a 0. Comprobar que el repositorio se llamó con `(IDS.restaurante, IDS.centro, <fecha>)`.
    - Sin sucursal de trabajo → 409. Para eso, firmar un token sin `sucursalId` con `firmarToken({ usuarioId: IDS.admin })` después de `cookieConPermisos(['pago.ver'])`.
    - **Review Focus 1:** `POST /api/pagos/webhook` sin cookie no responde 401.
- [ ] **Step 2:** Correr los dos tests → fallan.
- [ ] **Step 3:** Implementar. La ruta es `pagosRouter.get('/hoy', autenticar, tenant, requierePermiso('pago.ver'), …)`, con los middlewares **en la ruta y no en `router.use`**. Usa `sucursalDeTrabajo(req)` de `routes/reservas` y `new Date()`. En `app.ts`, montar el router debajo de la línea del webhook.
- [ ] **Step 4:** Los tests pasan, incluido `pagos-webhook.test.ts`. `npm run typecheck` → sin errores.
- [ ] **Step 5:** Commit: `Agregar la ruta de los pagos del día`.

---

### Task 5: Aviso en vivo al personal con `pago.ver`

**Agente:** implementador · **Crítica:** sí (qué sesiones reciben el aviso)

**Files:**
- Modify: `apps/api/src/realtime/notificadores.ts` (NotificadorStaff)
- Test: `apps/api/src/realtime/notificadores.test.ts`

**Interfaces:**
- Consumes: `EVENTOS_SOCKET.pagosCambio` (tarea 2).

- [ ] **Step 1: test que falla.** `describe('un pago resuelto')`, con el mismo armado que "una alerta nueva" (`io.in(...).fetchSockets`, `sesionDe` y `socketDe`).
  - **`PAGO_APROBADO` con `sucursalId: 'S'`:**
    - `io.in` se llama con `'sucursal:S'`.
    - Reciben `emit('pagos:cambio')`, sin argumentos: `EMPLEADO ['pago.ver']` y `EMPLEADO ['pago.ver', 'pedido.ver']`.
    - No reciben nada: `EMPLEADO ['pedido.ver']`, `EMPLEADO ['pago.ver']` con la sucursal `'OTRA'`, `COMENSAL ['pago.ver']` y un socket sin sesión.
  - **`PAGO_RECHAZADO`:** el empleado con `pago.ver` también recibe `pagos:cambio`.
  - Los dos tests de pago que ya existen siguen pasando. Hoy afirman `io.to` no llamado con `'sucursal:S'`, y eso sigue siendo cierto porque el aviso usa `io.in`. En esos dos tests, `io.in` tiene que devolver `{ fetchSockets: jest.fn().mockResolvedValue([]) }`.
- [ ] **Step 2:** `npx jest -w @pgim/api notificadores` → falla.
- [ ] **Step 3:** Implementar en `dejarStaff` un `case 'PAGO_APROBADO': case 'PAGO_RECHAZADO':` que haga `io.in(salaSucursal(evento.sucursalId)).fetchSockets()`. Filtrar por `tipo === 'EMPLEADO'`, `sucursalActiva?.id === sucursalId` y `permisos.includes('pago.ver')`, y emitir `EVENTOS_SOCKET.pagosCambio`. Terminar con `.catch(() => {})`, con un comentario: el pago ya quedó guardado.
- [ ] **Step 4:** Los tests pasan.
- [ ] **Step 5:** Commit: `Avisar en vivo los pagos resueltos a quien ve pagos en la sucursal`.

---

### Task 6: Pantalla "Pagos del día"

**Agente:** Opus define la dirección con `/impeccable` y el implementador la aplica · **Crítica:** no

**Files:**
- Create: `apps/web/src/pages/panel/PagosDelDiaPage.tsx`
- Modify: `apps/web/src/App.tsx` (ruta `pagos` dentro de `/panel`, con `conPermiso('pago.ver', <PagosDelDiaPage />)`)
- Modify: `apps/web/src/components/PanelLayout.tsx` (sección en `SECCIONES`)

**Interfaces:**
- Consumes: `GET /pagos/hoy` → `PagosDelDia`, y `EVENTOS_SOCKET.pagosCambio`.

- [ ] **Step 1:** Opus corre `npx impeccable context --target apps/web/src/pages/panel/PagosDelDiaPage.tsx` y lee `CocinaPage.tsx`, que es la referencia de pantalla en vivo. Con `/impeccable` define la dirección visual de la cabecera de totales, la lista y el resaltado del pago nuevo, y la agrega al brief del implementador.
- [ ] **Step 2:** Agregar la sección a `SECCIONES`, después de Cocina:
  - `ruta: 'pagos'`
  - `titulo: 'Pagos del día'`
  - `descripcion: 'Pagos aprobados y rechazados de hoy'`
  - `permisos: ['pago.ver']`
  - `grupo: 'Operación'`
  - un icono de `lucide-react` que ya esté instalado, por ejemplo `Wallet`.

  Agregar también la ruta en `App.tsx`.
- [ ] **Step 3:** Implementar la página:
  - `useRecurso<PagosDelDia>('/pagos/hoy')`.
  - `useEventoSocket(EVENTOS_SOCKET.pagosCambio, recargar)`.
  - `useConexionSocket(recargar)`, con el indicador de conexión como en Cocina.
  - La descripción usa el nombre de `sesion.sucursalActiva`.
  - Montos con el formateador de `lib/formato.ts` y horas en la hora de Argentina.
  - Los estados se muestran con el componente de `lib/estados.ts`, si existe uno para pagos; si no, se agrega ahí.
  - Si la recarga falla, se conservan los datos anteriores.
  - Los IDs que no estaban en la carga anterior se resaltan unos segundos.
- [ ] **Step 4:** `npm run typecheck` y `npm run build` → sin errores. Con `npm run dev` y el seed, aprobar un pago con la pasarela de prueba y ver que la fila aparece sin recargar.
- [ ] **Step 5:** Commit: `Agregar la pantalla de pagos del día`.

---

### Task 7: Cierre

**Agente:** Opus en línea · **Crítica:** no

- [ ] **Step 1:** El `verificador` corre typecheck, tests, build y `format:check`. Todo en verde.
- [ ] **Step 2:** Evaluación con `ux-heuristics` de `/panel/pagos`, con capturas a 390 y 1440 px. Los hallazgos llevan severidad.
- [ ] **Step 3:** `revisor-pr` sobre el rango de commits de la rama, con este plan, la spec y el Review Focus como foco.
- [ ] **Step 4:** Presentarle a Gabriel los hallazgos de ux-heuristics y de la revisión antes de arreglarlos.
