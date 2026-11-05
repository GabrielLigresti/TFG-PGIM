# Escaneo de platos para el modelo RA — Diseño

**Fecha:** 05/11/2026 · **Módulo:** Menú y RA (CU-16, CU-10) · **Rama:** `claude/ra-module-dishes-expansion-1qovom`

## 1. Objetivo

El restaurante carga el modelo 3D de un plato **grabando un video** del plato real. PGIM verifica la calidad del video, lo manda a un servicio de generación 3D con IA, deja revisar el resultado y, si el gerente lo acepta, lo publica como modelo RA del plato. El comensal lo ve como hoy, con "Ver en mi mesa".

- El escaneo **reemplaza** la subida manual del `.glb` y del `.usdz`: el panel deja de ofrecer la elección de archivos.
- El proveedor de IA **no está elegido**. Se define la interfaz `Proveedor3D` y, en esta etapa, solo existe un adaptador **simulado** que devuelve un modelo de demostración. Los adaptadores reales (Tripo, KIRI u otro) se agregan después, sin cambiar el resto.
- Cada intento con un proveedor real consume créditos pagos. Por eso un video pasa por una **verificación de calidad** antes de enviarse: un video que seguro va a dar un mal resultado se rechaza sin gastar nada.

### Criterios de éxito

1. Desde el modal del plato, el gerente elige o graba un video, ve el informe de calidad y, si no hay rechazos, lo envía.
2. Con el proveedor simulado, el escaneo pasa solo de PENDIENTE a PROCESANDO y a EN_REVISION en unos segundos, sin intervención.
3. En EN_REVISION, el gerente ve el modelo generado, indica el diámetro del plato y la porción, y lo publica. Desde ese momento el comensal lo ve en "Ver en mi mesa" a escala real.
4. El modelo publicado anterior no cambia hasta que se publica el nuevo. Descartar un borrador no lo toca.
5. Un video rechazado por calidad nunca crea un escaneo ni llega al proveedor, aunque se saltee la verificación del navegador.
6. Typecheck y tests en verde. Jest cubre el dominio, el servicio, la tarea y la verificación de calidad, y Supertest cubre las rutas.

### Fuera de alcance

Adaptadores reales de proveedores; aviso en tiempo real por Socket.IO (la pantalla consulta cada 5 s); postproceso del modelo (reducción de polígonos y texturas); varios escaneos simultáneos por plato; escaneo desde fotos; grabación dentro de la app con `getUserMedia`; videos WebM.

## 2. Cambios de modelo

Se proponen acá y se aplican en el orden de `CLAUDE.md`: primero los diagramas, después `HISTORIAL.md` y por último `schema.prisma`.

### DER 2 — Menú, recetas e inventario: v2 → v3 (cambio mayor)

Tabla nueva `ESCANEO_PLATO`:

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `restaurante_id` | uuid FK | Aislamiento por tenant |
| `item_menu_id` | uuid FK | |
| `empleado_id` | uuid FK | Quién subió el video |
| `estado` | `EstadoEscaneo` | `PENDIENTE \| PROCESANDO \| EN_REVISION \| PUBLICADO \| DESCARTADO \| FALLIDO` |
| `proveedor` | varchar | Adaptador que lo procesa (`simulado`, …) |
| `tarea_proveedor_id` | varchar, null | Id de la tarea en el proveedor; se completa en PROCESANDO |
| `ruta_video` | varchar, null | Archivo privado; null una vez borrado |
| `url_modelo` | varchar, null | `.glb` generado (borrador); se completa en EN_REVISION |
| `url_modelo_ios` | varchar, null | `.usdz` generado, si el proveedor lo devuelve |
| `calidad` | jsonb | Informe de calidad tal como llegó (sección 4) |
| `error` | varchar, null | Motivo de la falla, en lenguaje del restaurante |
| `creado_en` | timestamptz | |
| `actualizado_en` | timestamptz | |

- Relaciones: `ITEM_MENU ||--o{ ESCANEO_PLATO`, `RESTAURANTE ||--o{ ESCANEO_PLATO` y `EMPLEADO ||--o{ ESCANEO_PLATO`.
- **Un solo escaneo activo por plato:** índice único parcial sobre `item_menu_id` donde `estado IN ('PENDIENTE','PROCESANDO','EN_REVISION')`. Se crea con SQL en la migración, porque Prisma no expresa índices parciales.
- `MODELO_RA` **no cambia**: `url_modelo_ios` se mantiene y la completa el adaptador cuando el proveedor devuelve un `.usdz`. Si no lo devuelve, queda null y model-viewer lo genera desde el `.glb`, como hoy.

### Clases — unificado v3 → v4 (cambio mayor)

- `EscaneoPlato`: los atributos de la tabla, con `enviar(tareaId)`, `completar(urlModelo, urlModeloIos)`, `fallar(motivo)`, `publicar()` y `descartar()`, que delegan en su estado.
- **Patrón State:** `EstadoEscaneo` abstracta, con 6 estados concretos (`EscaneoPendiente`, `EscaneoProcesando`, `EscaneoEnRevision`, `EscaneoPublicado`, `EscaneoDescartado`, `EscaneoFallido`).
- «interface» `Proveedor3D`: `nombre`, `requisitos(): UmbralesCalidad`, `iniciar(video): String` y `consultar(tareaId): ResultadoEscaneo`.
- `ProveedorSimulado` implementa `Proveedor3D`.
- `ResultadoEscaneo` («value object»): en proceso; listo con el `.glb` y un `.usdz` opcional; o fallido con su motivo.
- «interface» `CriterioCalidad`: `evaluar(muestras, metadatos, umbrales): ResultadoCriterio`. Cinco implementaciones (Strategy): `CriterioFormato`, `CriterioNitidez`, `CriterioExposicion`, `CriterioBrillos`, `CriterioRecorrido`.
- `InformeCalidad` y `ResultadoCriterio` («value object»). Enum `NivelCalidad` (`OK | ADVERTENCIA | RECHAZO`).
- Relaciones: `ItemMenu "1" -- "*" EscaneoPlato`, `EscaneoPlato --> Empleado`, `EscaneoPlato ..> Proveedor3D`, `EscaneoPlato --> InformeCalidad`.

### Estados — `estado/escaneo-plato/v1` (diagrama nuevo)

```
PENDIENTE ──enviar──▶ PROCESANDO ──completar──▶ EN_REVISION ──publicar──▶ PUBLICADO
    │                     │                          │
    └──fallar──▶ FALLIDO ◀┘──fallar                  └──descartar──▶ DESCARTADO
```

PUBLICADO, DESCARTADO y FALLIDO son finales. Para reintentar se crea un escaneo nuevo. Cualquier otra transición lanza un error de dominio (409).

## 3. Arquitectura

```
Navegador                         API                                     Proveedor
─────────                         ───                                     ─────────
elige video
muestrea ~30 cuadros
evaluarCalidad() ── shared ──┐
informe OK/advertencia       │
POST video + X-Calidad-Video ─▶ valida firma, MP4 y informe
                                guarda video (carpeta privada)
                                ESCANEO_PLATO PENDIENTE
GET escaneo (cada 5 s) ◀──────  tarea "procesar escaneos" (cada 10 s)
                                  PENDIENTE  → iniciar(video) ─────────▶  tarea
                                  PROCESANDO → consultar(tareaId) ◀─────  .glb
                                  validarGlb, guarda en uploads/modelos
                                  EN_REVISION, borra el video
diámetro + porción
POST publicar ────────────────▶ transacción: PUBLICADO + MODELO_RA
                                después del commit: borra el modelo anterior
```

Capas, como el resto de la API: rutas → `EscaneoService` → `EscaneoRepository`, que filtra por `restaurante_id`. Las transiciones viven en el dominio (`domain/escaneo.ts`), igual que en `domain/pedido.ts`.

## 4. Verificación de calidad del video

### Funciones puras (`packages/shared/src/calidad-video/`)

Solo tipos, zod y funciones sin dependencias, utilizables desde la web y desde Jest.

- **Entrada:** `MuestraCuadro { ancho, alto, luminancia: Uint8Array }` (escala de grises, ~320 px de ancho) y `MetadatosVideo { ancho, alto, duracionS }`.
- **Métricas:**
  - `varianzaLaplaciano(cuadro)`: nitidez. Un valor bajo indica un cuadro movido o desenfocado.
  - `exposicion(cuadro)`: luminancia media, % de píxeles quemados (≥ 250) y % de negros (≤ 5).
  - `brillosCentrales(cuadro)`: % de píxeles casi blancos en el 50 % central del cuadro.
  - `diferenciaEntreCuadros(a, b)`: diferencia absoluta media normalizada.
- **Criterios** (`CriterioCalidad`):

| Criterio | Rechazo si… | Advertencia si… | Mensaje al restaurante (ejemplo) |
|---|---|---|---|
| Formato | resolución o duración fuera de los requisitos | — | "El video tiene que durar entre 10 segundos y 3 minutos" |
| Nitidez | > 50 % de cuadros bajo el umbral | > 20 % | "El video está movido: grabá más despacio" |
| Exposición | luminancia media fuera de rango o > 30 % quemados o negros | > 10 % | "Hay poca luz: grabá con luz pareja, sin flash" |
| Brillos | — | > 15 % de brillos centrales | "Hay muchos reflejos: evitá la luz directa sobre el plato" |
| Recorrido | diferencia media casi nula (cámara quieta) o > 20 % de saltos bruscos | recorrido corto | "Da una vuelta lenta y completa alrededor del plato" |

- `evaluarCalidad(muestras, metadatos, umbrales)` devuelve `InformeCalidad { version, nivelGlobal, metadatos, criterios: ResultadoCriterio[] }`. `nivelGlobal` es el peor nivel de los criterios, y `version` identifica la versión del algoritmo, para comparar informes de distintas versiones al calibrar.
- `UMBRALES_POR_DEFECTO` en `shared`. **Los valores son iniciales:** se calibran con videos reales cuando haya un proveedor elegido.
- `informeCalidadSchema` (zod) valida el informe en la API.

### Umbrales por proveedor

Cada adaptador declara `requisitos(): UmbralesCalidad` (el simulado usa los de por defecto). `GET /escaneos/requisitos` devuelve los del proveedor activo, así el navegador evalúa con los umbrales del proveedor que va a recibir el video.

### Navegador (`apps/web/src/lib/muestreo-video.ts`)

Carga el archivo en un `<video>` oculto y lee la duración y la resolución. Después salta a ~30 instantes repartidos (evitando el primer y el último 5 %), dibuja cada cuadro en un `canvas` de 320 px de ancho y calcula la luminancia (BT.601). Corre en el hilo principal. Si el navegador no puede decodificar el video, informa "No pudimos leer el video" y no deja enviarlo.

### Servidor (red de seguridad)

En `POST /platos/:id/escaneos`, antes de crear el escaneo:

1. **Firma:** solo MP4/MOV (caja `ftyp` en el byte 4).
2. **Lector de cajas MP4** (`lib/mp4.ts`, sin dependencias): saca la duración de `mvhd` y la resolución del `tkhd` de la pista de video.
3. **Informe:** el encabezado `X-Calidad-Video` (JSON en base64url) se valida con `informeCalidadSchema`.
4. **Rechazo con 422** si falta el informe, si `nivelGlobal` es `RECHAZO`, si la duración o la resolución reales están fuera de los requisitos, o si no coinciden con las del informe (tolerancia: 1 s y 2 px).

El servidor no decodifica cuadros: confía en la nitidez, la exposición y el recorrido que calculó el navegador del propio restaurante, y valida lo que puede leer barato.

## 5. API

Todas las rutas piden `menu.editar` y pasan por autenticación → tenant → permiso → validación.

| Ruta | Respuesta |
|---|---|
| `GET /escaneos/requisitos` | `UmbralesCalidad` del proveedor activo |
| `POST /platos/:id/escaneos` | Cuerpo binario (`application/octet-stream`, hasta `LIMITE_VIDEO_MB` = 100) y encabezado `X-Calidad-Video`. Responde 201 con el escaneo PENDIENTE; 409 si ya hay uno activo; 422 si falla la verificación; 404 si el plato no es del restaurante |
| `GET /platos/:id/escaneo` | Último escaneo del plato, en cualquier estado, o `null` |
| `POST /escaneos/:id/publicar` | Cuerpo `modeloRaInputSchema` (`escalaReal`, `porcionGramos`). En una transacción: el escaneo pasa a PUBLICADO y se crea o reemplaza `MODELO_RA` con sus URL. Después del commit se borran los archivos del modelo anterior. 409 si no está EN_REVISION |
| `POST /escaneos/:id/descartar` | Pasa a DESCARTADO y borra los archivos del borrador. 409 si no está EN_REVISION |

- **Se quitan** `PUT /platos/:id/modelo-ra/:formato`, `ArchivosModelo.validarUsdz` como entrada de usuario y `subirModelo` del servicio de menú.
- **Se quedan** `PUT /platos/:id/modelo-ra` (corregir escala y porción) y `DELETE /platos/:id/modelo-ra`.
- La lista de platos del panel suma `escaneo: { id, estado } | null` (el último escaneo de cada plato).
- **Video:** se guarda en `UPLOADS_DIR/escaneos/<uuid>.mp4|mov`. Esa carpeta **no** se sirve: hoy solo se exponen `uploads/modelos` y `uploads/fotos`.

## 6. Tarea "procesar escaneos"

Usa `iniciarTareaPeriodica` (`tareas/periodica.ts`), cada `ESCANEO_INTERVALO_MS` (10 000 por defecto), y arranca en `server.ts` junto a las de reservas y pagos. Como `vencerPendientes`, recorre todos los restaurantes, y cada escritura filtra por `restaurante_id` e `id`.

1. **PENDIENTE:** lee el video y llama a `proveedor.iniciar(video)`. Si sale bien, `enviar(tareaId)` → PROCESANDO. Si da error, `fallar("No pudimos enviar el video")` → FALLIDO, y se borra el video.
2. **PROCESANDO:** llama a `proveedor.consultar(tareaId)`.
   - *En proceso:* si pasaron más de `ESCANEO_TIMEOUT_MIN` (30) desde el envío, `fallar("El escaneo tardó demasiado")`. Si no, nada.
   - *Listo:* `validarGlb` (y `validarUsdz` si vino), `guardarModelo` en `uploads/modelos`, `completar(urls)` → EN_REVISION, y se borra el video. Si la validación falla: FALLIDO, con el mensaje de la validación.
   - *Fallido:* FALLIDO con el motivo del proveedor, y se borra el video.
3. Un error con un escaneo se registra y no corta la vuelta con los demás.

**Selección de proveedor:** `PROVEEDOR_3D` (env, `simulado` por defecto) elige el adaptador activo para los escaneos nuevos, desde un registro `nombre → Proveedor3D`. La tarea consulta cada escaneo con el adaptador guardado en su columna `proveedor`.

**`ProveedorSimulado`:** no guarda estado. `iniciar` devuelve `sim-<epoch ms>`. `consultar` responde "en proceso" hasta que pasa `SIMULADO_DEMORA_MS` (20 000 por defecto) y después devuelve uno de los `.glb` de `prisma/modelos-demo`, sin `.usdz`. La opción de constructor `fallar: true` (o `SIMULADO_FALLA=true`) hace que devuelva "fallido", para los tests y para mostrar el caso de error.

## 7. Pantalla del panel

El botón "Modelo RA" de la lista de Platos abre un modal que reemplaza a `ModeloRaModal`, y lo que muestra depende del estado:

| Situación | Contenido | Acciones |
|---|---|---|
| Sin escaneo activo (ninguno, o el último fue PUBLICADO, DESCARTADO o FALLIDO) | Vista previa del modelo publicado, si hay; diámetro del plato y porción; motivo, si el último escaneo falló | Guardar (si hay modelo), Quitar modelo, **Escanear plato** |
| Grabar o elegir video | Instrucciones: plato mate, luz pareja sin flash, una vuelta lenta de 30 a 60 s. Selector `accept="video/mp4,video/quicktime"` (sin `capture`: así el celular ofrece grabar o elegir un video ya grabado) | Cancelar |
| Revisando el video | "Revisando el video…" con avance por cuadro | — |
| Informe de calidad | Una fila por criterio con ícono y texto (Bien / Atención / No sirve) y qué corregir | Rechazo: Grabar de nuevo. Advertencias: Grabar de nuevo y Enviar igual. Todo bien: Enviar |
| Generando (PENDIENTE o PROCESANDO) | "Estamos armando el modelo. Puede tardar unos minutos; podés cerrar esta ventana." Consulta cada 5 s | Cerrar |
| Para revisar (EN_REVISION) | Vista previa del borrador, diámetro del plato (cm) y porción | **Publicar**, Descartar |

- **Escala por diámetro:** la pantalla lee las medidas del modelo con `getDimensions()` de model-viewer y calcula `escalaReal = diámetro (m) / máx(ancho, profundidad)`. El campo "Escala real" desaparece de la interfaz. Para un modelo publicado, el diámetro inicial se deduce de la `escala_real` guardada.
- **Columna "Modelo" de la tabla:** *Con modelo*, *Generando*, *Para revisar* o *Falló*, según el modelo publicado y el último escaneo. Si un escaneo está en curso, tiene prioridad sobre "Con modelo".
- Textos en el lenguaje del restaurante (`PRODUCT.md`): sin "RA", "glb", "proveedor" ni nombres de estados del modelo.
- **Diseño visual:** pasa por `/impeccable` (con `impeccable context --target` sobre el archivo) antes de implementarlo, y cierra con la evaluación `ux-heuristics` a 390 y 1440 px.

## 8. Errores

| Caso | Dónde | Respuesta |
|---|---|---|
| Video no legible por el navegador | Web | "No pudimos leer el video": no deja enviar |
| Rechazo por calidad | Web y API (422) | Mensajes del criterio |
| Archivo que no es MP4/MOV o sin `mvhd`/`tkhd` | API (400) | "El video tiene que ser MP4 o MOV" |
| Escaneo activo existente | API (409) | "Este plato ya tiene un escaneo en curso" |
| Proveedor caído o con error | Tarea | FALLIDO con el motivo |
| `.glb` generado inválido | Tarea | FALLIDO con el mensaje de `validarGlb` |
| Transición inválida (publicar dos veces, etc.) | Dominio (409) | Mensaje del estado |
| Falla al borrar archivos después del commit | Servicio | Se registra en el log; no revierte la operación |

## 9. Pruebas

- **Shared (Jest):** cada métrica con imágenes sintéticas (tablero nítido contra uno borroneado, imagen saturada, imagen oscura, dos cuadros iguales contra dos distintos); cada criterio en sus tres niveles; `evaluarCalidad` toma el peor nivel; el esquema rechaza informes mal formados.
- **Dominio:** todas las transiciones válidas e inválidas de `EscaneoPlato`.
- **`lib/mp4`:** duración y resolución de un MP4 armado en el test; error en archivos truncados y que no son MP4.
- **`EscaneoService`:** crear (activo existente, informe con rechazo, metadatos que no coinciden), publicar (reemplaza `MODELO_RA` y borra el modelo anterior después del commit; no toca el anterior si falla) y descartar. Con repositorio, proveedor y archivos falsos inyectados, como en `menu.service`.
- **Tarea:** PENDIENTE → PROCESANDO, PROCESANDO → EN_REVISION, error del proveedor, `.glb` inválido, timeout, un escaneo con error no frena a los demás.
- **`ProveedorSimulado`:** demora, resultado y falla forzada.
- **Rutas (Supertest):** permisos, aislamiento por tenant (un plato de otro restaurante da 404), 201, 409 y 422.
- **Repositorio (base real, `*.db.test.ts`):** el índice único parcial impide dos escaneos activos para el mismo plato.

## 10. Riesgos

- **Umbrales sin calibrar:** con el proveedor simulado no se puede medir cuánto predice el informe el resultado real. Por eso se guarda el informe y su versión.
- **El modelo puede diferir del plato servido:** la IA inventa lo que no ve. La revisión humana antes de publicar lo mitiga.
- **El video queda en la nube de un tercero** cuando haya un proveedor real. Se borra de PGIM apenas termina el procesamiento.
- **Videos grandes:** 100 MB por cuerpo binario en una sola petición. Alcanza para 30–60 s en 1080p; si no, se puede bajar la resolución de grabación.
