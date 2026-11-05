# Escaneo de platos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el restaurante cargue el modelo RA de un plato grabando un video, que PGIM verifica, manda a un proveedor 3D (por ahora simulado), deja revisar y publica.

**Architecture:** tabla `ESCANEO_PLATO` con patrón State; una tarea periódica avanza los escaneos contra la interfaz `Proveedor3D`; la verificación de calidad son funciones puras en `@pgim/shared` que corren en el navegador, y el servidor revalida el contenedor MP4. La publicación crea o reemplaza `MODELO_RA` en una transacción.

**Tech Stack:** TypeScript 6, Express, Prisma 7 + PostgreSQL, zod, Jest + Supertest, React + Vite + Tailwind, model-viewer.

**Spec:** `docs/superpowers/specs/2026-11-05-escaneo-de-platos-design.md`

**Ejecución (CLAUDE.md §7):** cada tarea lleva **Agente** y **Crítica**. Ciclo: `implementador` commitea → `verificador` corre typecheck y tests → Opus lee el diff con `git show` (completo en las críticas) → correcciones al mismo implementador con `SendMessage`. Al final, `revisor-pr`.

## Global Constraints

- Términos del dominio en español (`Escaneo`, `estado`) y técnicos en inglés (`service`, `repository`, `router`); los métodos siguen los nombres del módulo (`buscar`, `listar`, `crear`).
- Textos de interfaz en español rioplatense, sin "RA", "glb", "usdz", "proveedor" ni nombres de estados (`PRODUCT.md`).
- Toda consulta del repositorio filtra por `restaurante_id`, salvo `enCurso()`, que es la tarea de sistema y lo dice en un comentario como `pago.repository.ts:317`.
- `packages/shared` solo lleva tipos, zod, constantes y funciones puras; nunca Prisma, Express ni React.
- Tablas en snake_case con `@@map`; modelos y campos en camelCase con `@map`.
- `LIMITE_VIDEO_MB = 100`. Solo MP4/MOV.
- Variables de entorno nuevas, con su valor por defecto: `PROVEEDOR_3D=simulado`, `SIMULADO_DEMORA_MS=20000`, `SIMULADO_FALLA=false`, `ESCANEO_INTERVALO_MS=10000`, `ESCANEO_TIMEOUT_MIN=30`. Van en `config/env.ts` y en `apps/api/.env.example`.
- Commits chicos, en español, con el pie de atribución de la sesión.
- Comandos: `npm run typecheck`, `npm test`, `npm run test:db -w @pgim/api` para los `*.db.test.ts` (con `npm run db:up`), `npm run format`.

## Review Focus

1. **Video vertical del celular:** el `tkhd` guarda 1920×1080 con una matriz de rotación y el navegador informa 1080×1920; la comparación de resolución tiene que ser independiente de la orientación (lado menor y lado mayor). Test en la tarea 3.
2. **`moov` al final del archivo** (después de `mdat`), habitual en grabaciones de celular: el lector recorre todas las cajas de primer nivel, incluido `largesize` (tamaño 1). Test en la tarea 3.
3. **Publicar sobre un modelo que tenía `.usdz`** (los del seed o uno de un proveedor futuro) con un escaneo sin `.usdz`: `url_modelo_ios` queda null y se borra el `.usdz` anterior; no se conserva el viejo. Test en la tarea 7.
4. **Reescanear** después de un escaneo FALLIDO, DESCARTADO o PUBLICADO: se permite; solo bloquea uno activo. Test en la tarea 7.
5. **Encabezado `X-Calidad-Video` mal formado** (base64 inválido, JSON roto, texto con tildes): 422 con mensaje, nunca 500; un informe válido con "más" en un mensaje se decodifica bien. Test en la tarea 9.

---

### Task 1: Modelos (DER 2 v3, clases v4, estado del escaneo v1, HISTORIAL)

**Agente:** Opus en línea · **Crítica:** no

**Files:**
- Create: `docs/modelos/der/2-menu-recetas-inventario/v3/der-2-menu-recetas-inventario-v3.mmd` y `.png`
- Create: `docs/modelos/clases/0-unificado/v4/clases-0-unificado-v4.puml`, `.png`, `.svg`, `.pdf`
- Create: `docs/modelos/estado/escaneo-plato/v1/estado-escaneo-plato-v1.puml` y `.png`
- Modify: `docs/modelos/HISTORIAL.md`, tabla de versiones vigentes de `CLAUDE.md` §3

- [ ] **Step 1:** copiar el DER 2 v2 a v3 y sumar `ESCANEO_PLATO` con las columnas, relaciones y la nota del índice único parcial de la spec §2.
- [ ] **Step 2:** copiar el unificado v3 a v4 y sumar las clases, el State, `Proveedor3D`, `ProveedorSimulado`, `ResultadoEscaneo`, `CriterioCalidad` y sus 5 estrategias, `InformeCalidad`, `ResultadoCriterio` y `NivelCalidad` (spec §2). Mismo formato y colores por estereotipo que v3.
- [ ] **Step 3:** escribir el diagrama de estados con el formato de `estado/pedido/v1` (spec §2, transiciones con sus disparadores: tarea, proveedor, gerente).
- [ ] **Step 4:** renderizar. PlantUML: `plantuml.jar` (Java ya está instalado) con `-tpng`, `-tsvg` y `-tpdf`; el PNG del unificado por debajo de 25 MP (bajar los dpi si hace falta, como en el historial). Mermaid: `npx @mermaid-js/mermaid-cli` con Chromium en `/opt/pw-browsers/chromium` (`PUPPETEER_EXECUTABLE_PATH`).
- [ ] **Step 5:** registrar en `HISTORIAL.md` (DER 2 v3, clases v4, estado escaneo v1, con fecha 05/11 y qué cambia) y actualizar la tabla de `CLAUDE.md` §3 (la edición de `CLAUDE.md` se le muestra a Gabriel en el resumen).
- [ ] **Step 6:** commit `Agregar el escaneo de platos a los modelos: DER 2 v3, clases v4 y estados del escaneo`.

### Task 2: Schema, migración y tipos compartidos del escaneo

**Agente:** Opus en línea (cambio de schema) · **Crítica:** sí

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_escaneo_plato/migration.sql`
- Create: `packages/shared/src/escaneo.ts`; Modify: `packages/shared/src/index.ts`, `packages/shared/src/menu.ts`

**Interfaces — Produces:**
- Prisma: `enum EstadoEscaneo { PENDIENTE PROCESANDO EN_REVISION PUBLICADO DESCARTADO FALLIDO }`; `model EscaneoPlato` (`@@map("escaneo_plato")`) con los campos de la spec §2 (`calidad Json`), relaciones a `Restaurante`, `ItemMenu` y `Empleado` (por `usuarioId`), `@@index([restauranteId, itemMenuId])`.
- `@pgim/shared`:
  ```ts
  export const ESTADOS_ESCANEO = ['PENDIENTE','PROCESANDO','EN_REVISION','PUBLICADO','DESCARTADO','FALLIDO'] as const;
  export type EstadoEscaneo = (typeof ESTADOS_ESCANEO)[number];
  export const LIMITE_VIDEO_MB = 100;
  export interface Escaneo {
    id: string; platoId: string; estado: EstadoEscaneo;
    urlModelo: string | null; urlModeloIos: string | null;
    error: string | null; creadoEn: string; actualizadoEn: string;
  }
  ```
- `Plato` suma `escaneo: { id: string; estado: EstadoEscaneo } | null` (último escaneo del plato).

- [ ] **Step 1:** editar el schema y crear la migración con `npm run db:migrate -w @pgim/api -- --name escaneo_plato --create-only`.
- [ ] **Step 2:** agregar al final de `migration.sql` el índice parcial:
  ```sql
  CREATE UNIQUE INDEX "escaneo_plato_activo_por_plato"
    ON "escaneo_plato" ("item_menu_id")
    WHERE "estado" IN ('PENDIENTE', 'PROCESANDO', 'EN_REVISION');
  ```
- [ ] **Step 3:** aplicar la migración y regenerar el cliente: `npm run db:migrate -w @pgim/api`. Esperado: sin cambios pendientes.
- [ ] **Step 4:** crear `escaneo.ts` en shared, exportarlo y sumar `escaneo` a `Plato`. En `menu.repository.ts`, `listarPlatos` y `buscarPlato` incluyen `escaneos: { orderBy: { creadoEn: 'desc' }, take: 1, select: { id: true, estado: true } }` y `aPlato` lo mapea a `escaneo`.
- [ ] **Step 5:** `npm run typecheck` y `npm test`. Esperado: PASS (ajustar los objetos `Plato` de los tests existentes con `escaneo: null`).
- [ ] **Step 6:** commit `Agregar la tabla del escaneo de platos y sus tipos`.

### Task 3: Lector de MP4 y archivos de video

**Agente:** implementador · **Crítica:** no

**Files:**
- Create: `apps/api/src/lib/mp4.ts`, `apps/api/src/lib/mp4.test.ts`
- Create: `apps/api/src/lib/archivos-video.ts`, `apps/api/src/lib/archivos-video.test.ts`
- Create: `apps/api/src/test/mp4-falso.ts`

**Interfaces — Produces:**
- `leerMetadatosMp4(archivo: Buffer): { ancho: number; alto: number; duracionS: number }` — lanza `AppError(400, 'El video tiene que ser MP4 o MOV')` si no hay `ftyp` en el byte 4 o faltan `moov`/`mvhd`/un `tkhd` con ancho y alto distintos de 0.
- `FormatoVideo = 'mp4' | 'mov'`; `formatoVideo(archivo: Buffer): FormatoVideo` (marca mayor `qt  ` → `mov`, el resto `mp4`).
- `CARPETA_VIDEOS = path.resolve(env.UPLOADS_DIR, 'escaneos')`; `guardarVideo(archivo: Buffer, formato: FormatoVideo): Promise<string>` (devuelve la ruta absoluta, nombre `<uuid>.<formato>`); `leerVideo(ruta: string): Promise<Buffer>`; `borrarVideo(ruta: string | null): Promise<void>` (solo dentro de `CARPETA_VIDEOS`; ENOENT no es error, como `borrarModelo`).
- Helper de test: `mp4Falso(opciones: { ancho: number; alto: number; duracionS: number; moovAlFinal?: boolean; version1?: boolean; marca?: string }): Buffer`.

**Algoritmo del lector** (cajas: tamaño uint32 BE + tipo de 4 caracteres; tamaño 1 → `largesize` uint64 a continuación; tamaño 0 → hasta el final):
- `mvhd` v0: `timescale` uint32 en el byte 12 del contenido y `duration` uint32 en el 16; v1: `timescale` en el 20 y `duration` uint64 en el 24. `duracionS = duration / timescale`.
- `tkhd` (dentro de cada `trak`): ancho y alto en punto fijo 16.16, en los bytes 76 y 80 del contenido (v0) u 88 y 92 (v1). Se toma la primera pista con ancho y alto mayores que 0.

- [ ] **Step 1:** tests de `mp4.test.ts`: `lee duración y resolución de un mp4 v0` (1920×1080, 42 s → `{ ancho: 1920, alto: 1080, duracionS: 42 }`); `lee mvhd y tkhd v1`; `encuentra moov después de mdat`; `soporta largesize`; `rechaza un archivo sin ftyp`; `rechaza un mp4 truncado`; `formatoVideo distingue mov de mp4`.
- [ ] **Step 2:** desde `apps/api`, correr `npx jest src/lib/mp4.test.ts`. Esperado: FAIL (módulo inexistente).
- [ ] **Step 3:** implementar `mp4.ts` y el helper `mp4-falso.ts`.
- [ ] **Step 4:** tests de `archivos-video.test.ts` sobre una carpeta temporal: guardar y leer; borrar dos veces no falla; `borrarVideo` ignora rutas fuera de `CARPETA_VIDEOS`. Implementar `archivos-video.ts`.
- [ ] **Step 5:** correr los dos archivos. Esperado: PASS.
- [ ] **Step 6:** commit `Leer duración y resolución de videos MP4 y guardar los videos del escaneo`.

### Task 4: Verificación de calidad (shared)

**Agente:** implementador · **Crítica:** no

**Files:**
- Create: `packages/shared/src/calidad-video.ts`; Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/lib/calidad-video.test.ts` (los tests de shared viven en la API, como `services/apertura-esquemas.test.ts`)

**Interfaces — Produces** (todo exportado desde `@pgim/shared`):
```ts
export type NivelCalidad = 'OK' | 'ADVERTENCIA' | 'RECHAZO';
export type CriterioId = 'FORMATO' | 'NITIDEZ' | 'EXPOSICION' | 'BRILLOS' | 'RECORRIDO';
export interface MuestraCuadro { ancho: number; alto: number; luminancia: Uint8Array }
export interface MetadatosVideo { ancho: number; alto: number; duracionS: number }
export interface UmbralesCalidad {
  ladoMenorMinPx: number; ladoMenorMaxPx: number; duracionMinS: number; duracionMaxS: number;
  nitidezMin: number; nitidezAdvertenciaPct: number; nitidezRechazoPct: number;
  luminanciaMin: number; luminanciaMax: number;
  recortadosAdvertenciaPct: number; recortadosRechazoPct: number;
  brillosAdvertenciaPct: number;
  diferenciaMin: number; recorridoAdvertenciaMin: number; saltoMin: number; saltosRechazoPct: number;
}
export const UMBRALES_POR_DEFECTO: UmbralesCalidad; // valores abajo
export interface ResultadoCriterio { criterio: CriterioId; nivel: NivelCalidad; valor: number; mensaje: string | null }
export interface InformeCalidad { version: 1; nivelGlobal: NivelCalidad; metadatos: MetadatosVideo; criterios: ResultadoCriterio[] }
export interface CriterioCalidad { id: CriterioId; evaluar(muestras: MuestraCuadro[], metadatos: MetadatosVideo, umbrales: UmbralesCalidad): ResultadoCriterio }
export const CRITERIOS: CriterioCalidad[]; // Formato, Nitidez, Exposición, Brillos, Recorrido
export function aLuminancia(rgba: Uint8ClampedArray, ancho: number, alto: number): MuestraCuadro;
export function varianzaLaplaciano(c: MuestraCuadro): number;
export function exposicion(c: MuestraCuadro): { media: number; quemadosPct: number; negrosPct: number };
export function brillosCentrales(c: MuestraCuadro): number;
export function diferenciaEntreCuadros(a: MuestraCuadro, b: MuestraCuadro): number;
export function evaluarCalidad(muestras: MuestraCuadro[], metadatos: MetadatosVideo, umbrales: UmbralesCalidad): InformeCalidad;
export const informeCalidadSchema: z.ZodType<InformeCalidad>;
export function escalaPorDiametro(diametroCm: number, anchoM: number, profundidadM: number): number;
export function diametroPorEscala(escala: number, anchoM: number, profundidadM: number): number;
```

**Valores iniciales de `UMBRALES_POR_DEFECTO`:** `ladoMenorMinPx 720`, `ladoMenorMaxPx 2160`, `duracionMinS 10`, `duracionMaxS 180`, `nitidezMin 100`, `nitidezAdvertenciaPct 0.2`, `nitidezRechazoPct 0.5`, `luminanciaMin 40`, `luminanciaMax 220`, `recortadosAdvertenciaPct 0.1`, `recortadosRechazoPct 0.3`, `brillosAdvertenciaPct 0.15`, `diferenciaMin 0.02`, `recorridoAdvertenciaMin 0.04`, `saltoMin 0.25`, `saltosRechazoPct 0.2`.

**Definiciones que las firmas no fijan:**
- `aLuminancia`: `round(0.299 R + 0.587 G + 0.114 B)` por píxel.
- `varianzaLaplaciano`: núcleo `[0,1,0; 1,-4,1; 0,1,0]` sobre los píxeles interiores; varianza de las respuestas.
- `exposicion`: quemados = luminancia ≥ 250, negros ≤ 5, en proporción (0–1).
- `brillosCentrales`: proporción de píxeles ≥ 240 en el rectángulo central `[ancho/4, 3·ancho/4) × [alto/4, 3·alto/4)`.
- `diferenciaEntreCuadros`: media de `|a − b|` dividida por 255.
- **Formato:** lado menor y lado mayor (independiente de la orientación). RECHAZO si `duracionS` fuera de `[duracionMinS, duracionMaxS]` o el lado menor fuera de `[ladoMenorMinPx, ladoMenorMaxPx]`. `valor` = duración.
- **Nitidez:** proporción de cuadros con varianza < `nitidezMin`; > `nitidezRechazoPct` RECHAZO, > `nitidezAdvertenciaPct` ADVERTENCIA.
- **Exposición:** media de las medias y media de `quemadosPct + negrosPct`. RECHAZO si la media está fuera de `[luminanciaMin, luminanciaMax]` o recortados > `recortadosRechazoPct`; ADVERTENCIA si recortados > `recortadosAdvertenciaPct`. El mensaje es el de "poca luz" si dominan los negros o la media es baja, y el de "demasiada luz" si no.
- **Brillos:** media de `brillosCentrales`; > `brillosAdvertenciaPct` ADVERTENCIA (nunca rechaza).
- **Recorrido:** diferencias entre cuadros consecutivos. RECHAZO si la media < `diferenciaMin` o la proporción de diferencias > `saltoMin` supera `saltosRechazoPct`; ADVERTENCIA si la media < `recorridoAdvertenciaMin`.
- `evaluarCalidad`: aplica los 5 criterios en el orden de `CRITERIOS`; `nivelGlobal` es el peor (RECHAZO > ADVERTENCIA > OK).
- `escalaPorDiametro`: `(diametroCm / 100) / max(anchoM, profundidadM)`; `diametroPorEscala` es la inversa, redondeada a 1 decimal.

**Mensajes (copia exacta; `mensaje` es null cuando el nivel es OK):**
- Formato, duración: `El video tiene que durar entre 10 segundos y 3 minutos` (armado con los umbrales: segundos para el mínimo y minutos para el máximo).
- Formato, resolución baja: `La resolución es baja: grabá en 720p o más`; alta: `La resolución es muy alta: grabá en 2160p como máximo` (con `ladoMenorMaxPx`).
- Nitidez: `El video está movido: grabá más despacio`.
- Exposición: `Hay poca luz: grabá con luz pareja, sin flash` / `Hay demasiada luz: evitá el sol o el flash directo`.
- Brillos: `Hay muchos reflejos: evitá la luz directa sobre el plato`.
- Recorrido, quieto o corto: `Da una vuelta lenta y completa alrededor del plato`; con saltos: `El video tiene cortes o sacudidas: grabá de un tirón y sin apuro`.

- [ ] **Step 1:** tests con imágenes sintéticas de 64×64 armadas en el test: `tablero nítido supera nitidezMin y uno uniforme no`; `exposicion de una imagen blanca da quemadosPct 1`; `brillosCentrales mira solo el centro` (centro blanco y bordes negros → 1); `diferencia de cuadros iguales es 0 y de negro contra blanco es 1`; `aLuminancia de rojo puro da 76`; un test por criterio en sus tres niveles; `formato acepta 1080×1920 vertical`; `evaluarCalidad toma el peor nivel`; `informeCalidadSchema rechaza nivelGlobal desconocido y acepta un informe de evaluarCalidad`; `escalaPorDiametro(26, 0.13, 0.1) es 2` y `diametroPorEscala` es su inversa.
- [ ] **Step 2:** correr `npx jest src/lib/calidad-video.test.ts` en `apps/api`. Esperado: FAIL.
- [ ] **Step 3:** implementar `calidad-video.ts` y exportarlo; `npm run build -w @pgim/shared`.
- [ ] **Step 4:** correr el test. Esperado: PASS.
- [ ] **Step 5:** commit `Agregar la verificación de calidad del video del escaneo`.

### Task 5: Dominio del escaneo (State)

**Agente:** implementador · **Crítica:** sí

**Files:**
- Create: `apps/api/src/domain/escaneo.ts`, `apps/api/src/domain/escaneo.test.ts`

**Interfaces — Produces** (mismo estilo que `domain/pedido.ts`: el estado decide la transición y el servicio persiste):
```ts
export interface EstadoDeEscaneo {
  readonly nombre: EstadoEscaneo;
  enviar(): EstadoEscaneo;     // PENDIENTE → PROCESANDO
  completar(): EstadoEscaneo;  // PROCESANDO → EN_REVISION
  fallar(): EstadoEscaneo;     // PENDIENTE | PROCESANDO → FALLIDO
  publicar(): EstadoEscaneo;   // EN_REVISION → PUBLICADO
  descartar(): EstadoEscaneo;  // EN_REVISION → DESCARTADO
}
export const ESTADOS_ESCANEO_ACTIVOS: EstadoEscaneo[]; // PENDIENTE, PROCESANDO, EN_REVISION
export function estadoDeEscaneo(estado: EstadoEscaneo): EstadoDeEscaneo;
```
Una transición inválida lanza `AppError(409, …)` con el estado en palabras: `El escaneo ya está publicado`, `… descartado`, `… fallido`, `… en revisión`, `… en proceso`, `… pendiente`.

- [ ] **Step 1:** tests: cada transición válida de la spec §2 y, para cada estado, que las demás lanzan 409 (tabla de casos con `it.each`).
- [ ] **Step 2:** correr y ver FAIL.
- [ ] **Step 3:** implementar con una clase base abstracta y 6 clases concretas.
- [ ] **Step 4:** correr y ver PASS.
- [ ] **Step 5:** commit `Agregar los estados del escaneo con el patrón State`.

### Task 6: Proveedores 3D y simulado

**Agente:** implementador · **Crítica:** no

**Files:**
- Create: `apps/api/src/escaneo/proveedor-3d.ts`, `apps/api/src/escaneo/proveedor-simulado.ts`, `apps/api/src/escaneo/proveedor-simulado.test.ts`, `apps/api/src/escaneo/registro.ts`, `apps/api/src/escaneo/registro.test.ts`
- Modify: `apps/api/src/config/env.ts`, `apps/api/.env.example`

**Interfaces — Produces:**
```ts
export type ResultadoEscaneo =
  | { estado: 'EN_PROCESO' }
  | { estado: 'LISTO'; glb: Buffer; usdz?: Buffer }
  | { estado: 'FALLIDO'; motivo: string };
export interface Proveedor3D {
  readonly nombre: string;
  requisitos(): UmbralesCalidad;
  iniciar(video: Buffer, formato: FormatoVideo): Promise<string>;
  consultar(tareaId: string): Promise<ResultadoEscaneo>;
}
export class ProveedorSimulado implements Proveedor3D {
  constructor(opciones?: { demoraMs?: number; fallar?: boolean; ahora?: () => number; carpetaModelos?: string });
}
export interface RegistroProveedores { activo(): Proveedor3D; buscar(nombre: string): Proveedor3D }
export function crearRegistro(proveedores: Proveedor3D[], activo: string): RegistroProveedores;
export const registroProveedores: RegistroProveedores; // con ProveedorSimulado según env
```
- `ProveedorSimulado`: `nombre = 'simulado'`, `requisitos()` devuelve `UMBRALES_POR_DEFECTO`, `iniciar` devuelve `sim-<ahora()>`. `consultar` → `EN_PROCESO` si `ahora() − t < demoraMs`; si no, `FALLIDO` con `No pudimos armar el modelo con este video` cuando `fallar`, o `LISTO` con `flan.glb` o `bife.glb` de `prisma/modelos-demo` (elegido por la paridad de `t`), sin `usdz`. Un id que no empieza con `sim-` da `FALLIDO`.
- `crearRegistro` lanza un `Error` al crearse si `activo` no está registrado, y `buscar` lanza `AppError(500, …)` para un nombre desconocido.

- [ ] **Step 1:** tests del simulado con `ahora` inyectado: en proceso antes de la demora; listo después, con un `.glb` que pasa `validarGlb`; falla forzada; id ajeno. Tests del registro: activo, buscar y nombre desconocido.
- [ ] **Step 2:** correr y ver FAIL.
- [ ] **Step 3:** implementar y sumar las variables de entorno (Global Constraints) a `env.ts` y a `.env.example`.
- [ ] **Step 4:** correr y ver PASS.
- [ ] **Step 5:** commit `Agregar la interfaz de proveedores 3D y el proveedor simulado`.

### Task 7: Repositorio y servicio del escaneo (crear, consultar, publicar, descartar)

**Agente:** implementador · **Crítica:** sí

**Files:**
- Create: `apps/api/src/repositories/escaneo.repository.ts`, `apps/api/src/repositories/escaneo.repository.db.test.ts`
- Create: `apps/api/src/services/escaneo.service.ts`, `apps/api/src/services/escaneo.service.test.ts`

**Interfaces — Consumes:** tareas 2 a 6. **Produces:**
```ts
export interface FilaEscaneo {
  id: string; restauranteId: string; itemMenuId: string; empleadoId: string;
  estado: EstadoEscaneo; proveedor: string; tareaProveedorId: string | null; rutaVideo: string | null;
  urlModelo: string | null; urlModeloIos: string | null; calidad: InformeCalidad; error: string | null;
  creadoEn: Date; actualizadoEn: Date;
}
export interface CambioEscaneo {
  estado: EstadoEscaneo; tareaProveedorId?: string; rutaVideo?: null;
  urlModelo?: string; urlModeloIos?: string | null; error?: string;
}
export interface EscaneoRepository {
  crear(datos: Pick<FilaEscaneo, 'restauranteId'|'itemMenuId'|'empleadoId'|'proveedor'|'rutaVideo'|'calidad'>): Promise<FilaEscaneo>;
  ultimoDelPlato(restauranteId: string, itemMenuId: string): Promise<FilaEscaneo | null>;
  buscar(restauranteId: string, id: string): Promise<FilaEscaneo | null>;
  // Tarea de sistema: PENDIENTE y PROCESANDO de todos los restaurantes, por creadoEn.
  enCurso(): Promise<FilaEscaneo[]>;
  // updateMany con where { id, restauranteId, estado: desde }; true si cambió una fila.
  cambiarEstado(restauranteId: string, id: string, desde: EstadoEscaneo, cambio: CambioEscaneo): Promise<boolean>;
  // Transacción: EN_REVISION → PUBLICADO y upsert de MODELO_RA con urlModelo, urlModeloIos (null si no tiene),
  // escalaReal y porcionGramos. Devuelve el modelo anterior, o null si el escaneo ya no estaba EN_REVISION.
  publicar(restauranteId: string, id: string, datos: ModeloRaInput): Promise<{ anterior: ModeloRa | null } | null>;
}
export function createEscaneoService(repo: EscaneoRepository, deps: {
  menu: Pick<MenuRepository, 'buscarPlato'>;
  videos: Pick<typeof archivosVideo, 'guardarVideo' | 'leerVideo' | 'borrarVideo'>;
  modelos: Pick<typeof archivosModelo, 'validarGlb' | 'validarUsdz' | 'guardarModelo' | 'borrarModelo'>;
  proveedores: RegistroProveedores;
  ahora: () => Date;
  timeoutMin: number;
}): {
  requisitos(): UmbralesCalidad;
  crear(restauranteId: string, platoId: string, empleadoId: string, video: Buffer, informe: InformeCalidad): Promise<Escaneo>;
  ultimo(restauranteId: string, platoId: string): Promise<Escaneo | null>;
  publicar(restauranteId: string, id: string, datos: ModeloRaInput): Promise<Escaneo>;
  descartar(restauranteId: string, id: string): Promise<Escaneo>;
  procesarEnCurso(): Promise<void>; // tarea 8
};
export const escaneoService; // con las dependencias reales
```
- `crear`, en este orden: plato del restaurante (404 `El plato no existe`); `leerMetadatosMp4`; `informe.nivelGlobal === 'RECHAZO'` → 422 `El video no pasó la revisión de calidad`; el criterio Formato de `CRITERIOS` evaluado con los metadatos reales y `proveedores.activo().requisitos()` da RECHAZO → 422 con su mensaje; la duración difiere en más de 1 s o el lado menor o el mayor en más de 2 px de `informe.metadatos` → 422 `El informe de calidad no corresponde a este video`; `ultimoDelPlato` activo → 409 `Este plato ya tiene un escaneo en curso`; guardar video y `repo.crear`. Si `repo.crear` lanza la violación del índice único (P2002), se borra el video y se responde el mismo 409.
- `publicar`: `estadoDeEscaneo(fila.estado).publicar()` (409 si no corresponde); `repo.publicar`; `null` → 409 `El escaneo ya está publicado o descartado`. **Después del commit**, `borrarModelo` del `urlModelo` y el `urlModeloIos` anteriores, cada uno en su try/catch con `console.error` (no revierte).
- `descartar`: `estadoDeEscaneo(...).descartar()`, `cambiarEstado` a DESCARTADO y, si cambió, borrar `urlModelo` y `urlModeloIos` del borrador.
- `Escaneo` se arma desde la fila con `platoId = itemMenuId` y las fechas en ISO.

- [ ] **Step 1:** tests del repositorio con la base (`*.db.test.ts`, siguiendo `produccion.repository.db.test.ts`): el índice parcial impide un segundo escaneo activo del mismo plato y permite uno nuevo si el anterior es FALLIDO; `buscar` de otro restaurante da null; `cambiarEstado` con `desde` desactualizado devuelve false; `publicar` hace upsert de `MODELO_RA` y devuelve el anterior.
- [ ] **Step 2:** tests del servicio con repositorio, archivos y proveedor falsos: los 6 caminos de `crear`, con `mp4Falso`; crear después de un escaneo FALLIDO, DESCARTADO o PUBLICADO funciona (Review Focus 4); `publicar` borra el `.glb` y el `.usdz` anteriores y deja `urlModeloIos` null cuando el escaneo no trae `.usdz` (Review Focus 3); `publicar` no borra nada si `repo.publicar` lanza; `descartar` borra el borrador; publicar o descartar un escaneo PROCESANDO da 409.
- [ ] **Step 3:** correr `npx jest src/services/escaneo.service.test.ts` y `npm run test:db -w @pgim/api -- escaneo`. Esperado: FAIL.
- [ ] **Step 4:** implementar el repositorio y el servicio (sin `procesarEnCurso`, que se deja lanzando `Error('pendiente')` hasta la tarea 8).
- [ ] **Step 5:** correr y ver PASS.
- [ ] **Step 6:** commit `Agregar el repositorio y el servicio del escaneo de platos`.

### Task 8: Tarea "procesar escaneos"

**Agente:** implementador · **Crítica:** sí

**Files:**
- Modify: `apps/api/src/services/escaneo.service.ts`, `apps/api/src/services/escaneo.service.test.ts`, `apps/api/src/server.ts`

**Interfaces — Consumes:** `procesarEnCurso()` de la tarea 7.

Por cada fila de `repo.enCurso()`, con `proveedor = deps.proveedores.buscar(fila.proveedor)`, y cada una en su try/catch con `console.error` para que un error no corte la vuelta:
- **PENDIENTE:** `leerVideo` → `proveedor.iniciar(video, formato por extensión de rutaVideo)` → `cambiarEstado(..., 'PENDIENTE', { estado: 'PROCESANDO', tareaProveedorId })`. Si `iniciar` lanza: FALLIDO con `No pudimos enviar el video`, `rutaVideo: null`, y `borrarVideo`.
- **PROCESANDO:** `proveedor.consultar(tareaProveedorId)`.
  - `EN_PROCESO`: si `ahora − actualizadoEn > timeoutMin` → FALLIDO `El escaneo tardó demasiado` (y se borra el video); si no, nada. `actualizadoEn` es el momento del envío, porque nada más modifica la fila mientras está PROCESANDO.
  - `LISTO`: `validarGlb` (y `validarUsdz` si vino) → `guardarModelo` → EN_REVISION con las URL y `rutaVideo: null` → `borrarVideo`. Si la validación lanza: FALLIDO con el mensaje del `AppError`. Si `cambiarEstado` devuelve false, borrar los modelos recién guardados.
  - `FALLIDO`: FALLIDO con `motivo` y se borra el video.
- Las transiciones pasan por `estadoDeEscaneo(...)` antes de persistir.
- En `server.ts`: `iniciarTareaPeriodica('procesar escaneos', () => escaneoService.procesarEnCurso(), env.ESCANEO_INTERVALO_MS)`.

- [ ] **Step 1:** tests con proveedor falso controlable: PENDIENTE → PROCESANDO con el id de tarea; error al iniciar → FALLIDO y video borrado; en proceso sin timeout no cambia; timeout → FALLIDO; listo → EN_REVISION, modelo guardado y video borrado; `.glb` inválido → FALLIDO con el mensaje de `validarGlb`; proveedor fallido → FALLIDO con el motivo; si el primer escaneo lanza, el segundo igual se procesa; con el `ProveedorSimulado` real y `ahora` inyectado, un escaneo llega a EN_REVISION después de la demora.
- [ ] **Step 2:** correr y ver FAIL.
- [ ] **Step 3:** implementar `procesarEnCurso` y registrar la tarea en `server.ts`.
- [ ] **Step 4:** correr y ver PASS.
- [ ] **Step 5:** commit `Procesar los escaneos en curso con una tarea periódica`.

### Task 9: Rutas y retiro de la subida manual

**Agente:** implementador · **Crítica:** no

**Files:**
- Create: `apps/api/src/routes/escaneos.ts`, `apps/api/src/routes/escaneos.test.ts`
- Modify: `apps/api/src/routes/menu.ts`, `apps/api/src/app.ts`, `apps/api/src/services/menu.service.ts`, `apps/api/src/services/menu.service.test.ts`
- Delete: `apps/api/src/routes/modelo-ra.test.ts` (los casos que siguen valiendo, `PUT` de datos y `DELETE`, pasan a `escaneos.test.ts` o a un test de menú existente)

**Interfaces — Produces:** las rutas de la spec §5, todas con `requierePermiso('menu.editar')`:
- `escaneosRouter` en `${API_PREFIX}/escaneos`: `GET /requisitos`, `POST /:id/publicar` (`validar(modeloRaInputSchema)`), `POST /:id/descartar`.
- En `platosRouter`: `POST /:id/escaneos` con `express.raw({ type: 'application/octet-stream', limit: \`${LIMITE_VIDEO_MB}mb\` })` y `GET /:id/escaneo` (responde `null` con 200 si no hay).
- El encabezado `X-Calidad-Video` se decodifica con `Buffer.from(valor, 'base64url')`, `JSON.parse` e `informeCalidadSchema`; si falta o cualquier paso falla → 422 `Falta el informe de calidad del video`. Cuerpo vacío → 400 `Falta el video`. El empleado es `req.sesion!.usuario.id`.
- Se quitan `PUT /platos/:id/modelo-ra/:formato`, `archivoModelo`, `modeloParamsSchema`, `modeloQuerySchema` y `menuService.subirModelo` (con sus tests). `ArchivosModelo` del servicio de menú queda en `'borrarModelo'`.

- [ ] **Step 1:** tests con Supertest y `sesion-falsa`: sin permiso `menu.editar` → 403; plato de otro restaurante → 404; alta correcta → 201 con estado PENDIENTE; activo existente → 409; informe con RECHAZO → 422; encabezado faltante, base64 inválido o JSON roto → 422 (Review Focus 5); informe válido con tildes en un mensaje → 201; cuerpo vacío → 400; `GET /platos/:id/escaneo` sin escaneos → `null`; publicar con datos inválidos → 400; descartar → 200; la ruta vieja `PUT /platos/:id/modelo-ra/glb` → 404.
- [ ] **Step 2:** correr y ver FAIL.
- [ ] **Step 3:** implementar las rutas, montar `escaneosRouter` en `app.ts` y retirar la subida manual.
- [ ] **Step 4:** `npm run typecheck` y `npm test`. Esperado: PASS.
- [ ] **Step 5:** commit `Exponer el escaneo de platos en la API y quitar la subida manual del modelo`.

### Task 10: Dirección visual del modal

**Agente:** Opus en línea · **Crítica:** no

- [ ] **Step 1:** `impeccable context --target apps/web/src/pages/panel/ModeloRaModal.tsx` y `/impeccable` con la spec §7: jerarquía de cada vista, cómo se muestra el informe de calidad (ícono y texto por criterio, `DESIGN.md`), el estado "Generando" y el formulario de revisión.
- [ ] **Step 2:** dejar la dirección como una sección "Dirección visual" al final de este plan y commitear `Agregar la dirección visual del modal de escaneo al plan`.

### Task 11: Modal de escaneo en el panel

**Agente:** implementador · **Crítica:** no

**Files:**
- Create: `apps/web/src/lib/muestreo-video.ts`, `apps/web/src/lib/useEscaneo.ts`
- Create: `apps/web/src/pages/panel/EscaneoModal.tsx`, `apps/web/src/pages/panel/InformeCalidad.tsx`
- Modify: `apps/web/src/lib/api.ts`, `apps/web/src/pages/panel/PlatosPage.tsx`
- Delete: `apps/web/src/pages/panel/ModeloRaModal.tsx`

**Interfaces — Consumes:** rutas de la tarea 9; `evaluarCalidad`, `escalaPorDiametro`, `diametroPorEscala`, `aLuminancia` de la tarea 4. **Produces:**
- `muestrearVideo(archivo: File, cantidad = 30, onAvance?: (hechos: number, total: number) => void): Promise<{ metadatos: MetadatosVideo; muestras: MuestraCuadro[] }>`: `<video>` oculto con `URL.createObjectURL`, `muted` y `playsInline`; espera `loadedmetadata`; recorre `cantidad` instantes repartidos entre el 5 % y el 95 % de la duración con `currentTime` y `seeked`; dibuja en un `canvas` de 320 px de ancho (alto proporcional) y aplica `aLuminancia`. Si falla la carga o un `seeked` tarda más de 5 s, lanza `Error('No pudimos leer el video')`. Revoca la URL al terminar.
- `enviarVideo<T>(ruta: string, archivo: Blob, informe: InformeCalidad): Promise<T>` en `api.ts`: `POST` binario con `X-Calidad-Video` = base64url del JSON en UTF-8 (`TextEncoder`, sin `=`).
- `useEscaneo(platoId: string)`: `{ escaneo, recargar }`; consulta `GET /platos/:id/escaneo` y repite cada 5 s mientras el estado es PENDIENTE o PROCESANDO.
- `EscaneoModal({ plato, onCerrar, onCambio })` con las vistas de la spec §7 y la dirección de la tarea 10. El diámetro se convierte con `escalaPorDiametro` a partir de `getDimensions()` del `<model-viewer>` (con `scale` 1); para el modelo publicado, el diámetro inicial sale de `diametroPorEscala`.
- `PlatosPage`: la columna "Modelo" muestra `Generando` (PENDIENTE o PROCESANDO), `Para revisar` (EN_REVISION), `Falló` (FALLIDO y sin modelo publicado), `Con modelo` o `—`; el escaneo en curso tiene prioridad sobre "Con modelo".

- [ ] **Step 1:** implementar `muestreo-video.ts`, `enviarVideo` y `useEscaneo`.
- [ ] **Step 2:** implementar `InformeCalidad.tsx` y `EscaneoModal.tsx`, y conectar `PlatosPage`; borrar `ModeloRaModal.tsx`.
- [ ] **Step 3:** `npm run typecheck` y `npm run build`. Esperado: sin errores.
- [ ] **Step 4:** prueba en el navegador con `npm run dev` y la base del seed: escanear un plato con un MP4 de prueba, ver el informe, enviar, ver "Generando" y, a los ~20 s, "Para revisar"; publicar con diámetro 26 cm y verificar "Ver en mi mesa" en la ficha del comensal; descartar otro; forzar la falla con `SIMULADO_FALLA=true`.
- [ ] **Step 5:** commit `Escanear el plato desde el panel con revisión de calidad y del modelo`.

### Task 12: Cierre

**Agente:** Opus en línea · **Crítica:** no

- [ ] **Step 1:** evaluación `ux-heuristics` del modal y de la lista de Platos, con capturas a 390 y 1440 px.
- [ ] **Step 2:** `revisor-pr` con el rango de commits de la rama, este plan, la spec y el foco: transacción de `publicar`, aislamiento por tenant en `escaneo.repository`, transiciones del State y Review Focus.
- [ ] **Step 3:** presentarle a Gabriel los hallazgos de las dos revisiones, con severidad, antes de arreglarlos.
- [ ] **Step 4:** `verificador` con typecheck, tests, build y `format:check`; push a `claude/ra-module-dishes-expansion-1qovom`.
- [ ] **Step 5:** ofrecer registrar en la wiki las decisiones nuevas: el escaneo reemplaza la subida manual, el proveedor simulado con interfaz `Proveedor3D`, la verificación de calidad en el navegador con la red de seguridad del servidor, y que se conserva `url_modelo_ios`.
