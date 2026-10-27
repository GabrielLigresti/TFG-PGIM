# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Gerente o dueño del restaurante**, en escritorio: administra sucursales, personal, roles, menús, platos, recetas e insumos, sigue las reservas del día y usa el simulador de apertura antes de cada servicio.
- **Cocina y salón (cocineros y mozos)**, en tablet táctil durante el servicio: la cola de pedidos de la cocina y el mapa del salón con las mesas en tiempo real.
- **Comensal**, en su celular: llega por el QR de la mesa o eligiendo la sucursal de una lista; reserva mesa, recorre la carta, ve los platos y pide desde su mesa.

## Product Purpose

Plataforma web de gestión para restaurantes con varias sucursales. Reúne en un solo lugar reservas por franja, salón, pedidos con cola de cocina, stock descontado por receta, pagos, fidelización y un simulador de apertura. Éxito: que cada rol complete su tarea en la superficie pensada para su dispositivo, y que el comensal decida y pida sin ayuda del mozo.

## Positioning

Dos diferenciales:

1. **Simulador de apertura (principal):** convierte el historial de ventas en decisiones previas al servicio (pronóstico por franja, verificación de stock y mesas, planificación de turnos).
2. **Ver en mi mesa:** el comensal ve el plato a tamaño real sobre su mesa, con realidad aumentada en el navegador y sin instalar nada, antes de pedirlo. Evidencia pública: en un experimento de campo, el 41,2 % de los comensales pidió postre al verlo en realidad aumentada, contra el 18 % con un menú de control (Fritz, Hadi y Stephen, 2023).

## Operating Context

- Multi-tenant: cada restaurante ve solo sus datos; el catálogo (menús, platos, categorías, insumos) es del restaurante y lo comparten sus sucursales; cada sucursal elige su menú activo.
- Las categorías del menú las define cada restaurante; el orden de la carta sale de ellas.
- Reservas por franja de servicio de una hora; la mesa se activa cuando llega el titular.
- Solo el titular de la reserva pide y paga desde la app; el pedido queda asociado a su mesa.
- Pedidos: Confirmado → En preparación → Listo → Entregado (o Cancelado).
- Durante el servicio la cocina y el salón trabajan de pie, con la tablet a distancia y con apuro.

## Capabilities and Constraints

- Cada plato tiene nombre, descripción opcional, precio, categoría, foto opcional y modelo 3D opcional con la porción en gramos. Un plato sin foto o sin descripción tiene que verse completo.
- "Ver en mi mesa" solo aparece si el plato tiene modelo 3D. La cámara exige HTTPS.
- Web responsive, sin apps nativas. Tres densidades: compacta en escritorio, táctil (48 px) en cocina y salón, comensal (44 px) en el celular.
- Textos de interfaz en español rioplatense, en el lenguaje del restaurante y sin jerga de desarrollo: "Ver en mi mesa", "Marcar inasistencia"; nunca "RA", "no-show" ni nombres de estados del modelo.
- Tema claro único; el modo oscuro queda como mejora futura.
- Sin decidir: color propio por restaurante (hoy el color es fijo; no hay dónde guardarlo).

## Brand Commitments

- En las pantallas del comensal manda la marca del restaurante: su nombre y la sucursal. "PGIM" es un nombre provisorio y solo aparece en el panel del restaurante.
- Voz: clara, directa y amable, como un buen mozo; sin tecnicismos.

## Evidence on Hand

- Restaurante de demostración "La Parrilla Demo" con sucursales ficticias, platos de demo y fotos de Wikimedia Commons con atribución en `apps/web/public/fotos-demo/LICENCIA.md`; modelos 3D libres para la demo.
- No hay testimonios, clientes, calificaciones de platos, tiempos de preparación ni favoritos: no se inventan ni se muestran.

## Product Principles

1. Cada rol en su dispositivo: la superficie se diseña para el lugar y el apuro de quien la usa.
2. La carta es del restaurante, no de la plataforma.
3. El plato real es la mejor prueba: foto y "Ver en mi mesa" antes que adjetivos.
4. El estado nunca se comunica solo con color.

## Accessibility & Inclusion

- Contraste mínimo AA (4,5:1 en texto, 3:1 en texto grande).
- Objetivos táctiles de 44 px en el comensal y 48 px en cocina y salón.
- Estado siempre con ícono y texto, además del color.
- Foco visible en todos los controles.
