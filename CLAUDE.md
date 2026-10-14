# CLAUDE.md — TFG-PGIM

Plataforma de gestión de restaurantes multi-sucursal (TFG de Ingeniería Informática, UCEMA). "PGIM" es un nombre provisorio.

**Fecha límite:** app 100% funcional el 23/11/2026. Solo lo estético puede quedar pendiente.

---

## 1. Stack

- **Lenguaje:** TypeScript en front y back.
- **Frontend:** React + Vite + Tailwind. Web responsive, sin apps nativas.
- **Backend:** Node.js + Express, API REST.
- **Datos:** PostgreSQL + Prisma.
- **Tiempo real:** Socket.IO, con canales por sucursal y por comensal.
- **Pagos:** Mercado Pago con credenciales de prueba; webhook expuesto mediante un túnel en desarrollo.
- **Realidad aumentada:** en el navegador, sin instalación; modelos `.glb` gratuitos para la demo.
- **Tests:** Jest para servicios y Supertest para rutas.

## 2. Estructura del monorepo

```
apps/web/        ← frontend (pendiente de crear)
apps/api/        ← backend (pendiente de crear)
docs/modelos/    ← modelos UML y DER versionados (fuente de verdad del diseño)
```

## 3. Modelo de datos: fuente de verdad

`docs/modelos/` manda sobre el código. Las versiones vigentes figuran en `docs/modelos/HISTORIAL.md`; hoy son:

| Modelo | Versión vigente |
|---|---|
| Clases unificado | `clases/0-unificado/v2` |
| DER 1 — Organización, salón y consumo | `der/1-organizacion-salon-consumo/v2` |
| DER 2 — Menú, recetas e inventario | `der/2-menu-recetas-inventario/v1` |
| DER 3 — Fidelización, simulador y alertas | `der/3-fidelizacion-simulador-alertas/v3` |
| Estados (reserva, pedido, pago, planificación) | `estado/*/v1` |

- **`schema.prisma` deriva del DER vigente.** Tablas en snake_case con `@@map`; modelos y campos en camelCase, con `@map`.
- **Si al implementar hace falta cambiar el modelo:** no tocar el schema primero. Proponer el cambio a Gabriel y, con su aprobación, actualizar el DER y/o las clases, después `HISTORIAL.md` y recién al final el schema.
- **Versionado de diagramas:**
  - **Cambio mayor** (clase o tabla nueva): carpeta nueva `vN+1`.
  - **Cambio menor** (atributos, tipos, formato): se reemplaza el archivo de la versión vigente.
  - En ambos casos se registra en `HISTORIAL.md` y se regenera la imagen (`.png`; para el diagrama de clases, también `.svg` y `.pdf`).

## 4. Decisiones de diseño que el código respeta

- **Multi-tenant con esquema compartido:** el aislamiento se resuelve en la capa de datos, con un repositorio por tenant que filtra por `restaurante_id` (y por `sucursal_id` en las tablas operativas). Nunca hay una consulta sin ese filtro.
- **Capas:** rutas/controladores → servicios → repositorios. Cadena de middleware: autenticación → tenant → permiso → validación.
- **Operaciones críticas en una sola transacción:** stock, puntos y pagos se resuelven con llamadas directas dentro de la transacción (Unit of Work), no con eventos.
- **Eventos de dominio** (Observer) solo para efectos secundarios, publicados después del commit.
- **Patrón State** en `Reserva`, `Pedido` y `Pago`, según los diagramas de estado.
- **Baja lógica** (`activo`) en entidades referenciadas por el historial.

El porqué de cada decisión está en la wiki (sección 6).

## 5. Repositorio público

- Nunca commitear credenciales: `.env` va en `.gitignore`, y en el repo solo se sube `.env.example`.
- Nunca subir contenido de la wiki ni material privado del TFG: minutas, comentarios del director, registro de horas, trabajos de otros alumnos. Esto incluye comentarios de código, mensajes de commit y documentación.
- Sin datos reales de restaurantes ni de personas. Los seeds usan datos ficticios.

## 6. Contexto: wiki del proyecto (vault privado)

El porqué de las decisiones vive en una wiki privada, fuera de este repo, en `dominios/pgim/` del vault. Si la sesión tiene acceso al vault:

- **Antes de implementar un módulo o tomar una decisión de diseño,** leer `dominios/pgim/index.md` y las páginas del módulo. No cargar la wiki entera.
- **Si la wiki y `docs/modelos/` se contradicen,** prevalece el modelo: avisar a Gabriel.
- **Al cerrar una sesión con decisiones nuevas,** ofrecer registrarlas en la wiki, siguiendo el `CLAUDE.md` del vault.

Si la sesión no tiene acceso al vault, trabajar con `docs/modelos/` y preguntar ante cualquier hueco de contexto.

## 7. Forma de trabajo

- Ante un hueco de contexto o una ambigüedad, preguntar antes de asumir.
- **Idioma del código:** términos del dominio en español, como en los diagramas (`Reserva`, `Pedido`, `CuentaMesa`); términos técnicos en inglés (`ReservaService`, `findById`, `controller`).
- **Commits:** pequeños y descriptivos, con el mensaje en español.
- Comandos de desarrollo: se completan cuando exista el scaffolding de `apps/`.
