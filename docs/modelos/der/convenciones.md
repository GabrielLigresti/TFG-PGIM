# Convenciones de implementación del DER

Reglas que valen para los tres DER vigentes y que el diagrama no puede expresar (Mermaid no admite precisión en los tipos ni restricciones `CHECK`). `schema.prisma` y las migraciones las respetan.

## Nulabilidad

Toda columna es obligatoria (`NOT NULL`) salvo que su comentario diga:

- `null si …` o `null en …`: admite nulo en ese caso.
- `solo X`: obligatoria cuando el registro es de la clase o el tipo X y nula en los demás.
- `exclusivo con …`: una de las dos columnas tiene valor y la otra es nula.

## Texto

Las columnas `varchar` del DER no fijan longitud, así que se implementan como `text` (en PostgreSQL son equivalentes). `char` conserva su longitud (`medio_pago_guardado.ultimos4` es `char(4)`).

## Tipos enumerados

Las columnas cuyo tipo es un nombre en PascalCase (`EstadoReserva`, `FranjaServicio`, etc.) son tipos `ENUM` de PostgreSQL. El nombre y los valores coinciden con la enumeración del diagrama de clases. Los cuatro enumerados que no están en el diagrama de clases son discriminadores de herencia o de estrategia:

| Tipo | Valores | Columna |
|---|---|---|
| `TipoUsuario` | EMPLEADO, COMENSAL | `usuario.tipo` |
| `TipoComponente` | INSUMO, INTERMEDIO | `componente_inventario.tipo` |
| `ClaseBeneficio` | RECOMPENSA, PROMOCION | `beneficio.clase` |
| `TipoCriterio` | VISITAS, MONTO, PUNTOS, NUEVO_CLIENTE | `beneficio.criterio_tipo` |

`EstadoReserva`, `EstadoPedido` y `EstadoPago` guardan el `nombre()` del estado del patrón State. `UnidadMedida` es una sola enumeración: `componente_inventario.unidad_base` admite solo GRAMO, MILILITRO y UNIDAD (restricción `CHECK`).

## Precisión de los `numeric`

| Uso | Tipo | Columnas |
|---|---|---|
| Dinero | `numeric(12,2)` | `item_menu.precio`, `linea_pedido.precio_unitario`, `pago.monto`, `comprobante.total`, `beneficio_aplicado.monto_descontado`, `cuenta_fidelidad.monto_acumulado`, `pronostico.ingreso_estimado`, `beneficio.valor` (monto o porcentaje), `beneficio.criterio_valor` |
| Costo por unidad base | `numeric(14,4)` | `componente_inventario.costo_compra_vigente`, `movimiento_stock.costo_unitario` |
| Cantidad en unidad base | `numeric(14,3)` | `existencia.cantidad_actual`, `movimiento_stock.cantidad`, `movimiento_stock.cantidad_teorica`, `linea_receta.cantidad`, `receta.rendimiento`, `tanda_produccion.cantidad_esperada`, `tanda_produccion.cantidad_obtenida` |
| Porcentaje | `numeric(5,2)` | `linea_receta.porcentaje_merma`, `pronostico.error_mape` |
| Coeficiente | `numeric(10,4)` | `programa_fidelidad.puntos_por_unidad`, `configuracion_apertura.cubiertos_por_mozo`, `configuracion_apertura.platos_por_cocinero_hora`, `modelo_ra.escala_real` |
| Posición en el plano del salón | `numeric(8,2)` | `mesa.pos_x`, `mesa.pos_y` |

## Restricciones en la base

Se agregan a mano en la migración porque Prisma no las genera:

- Índice único parcial en `reserva (mesa_id, inicio)` cuando el estado es PENDIENTE o ACTIVA.
- `reserva.inicio` a la hora en punto.
- `receta`: exactamente una de `item_menu_id` y `producto_intermedio_id` tiene valor.
- `existencia.cantidad_actual >= 0`, `cuenta_fidelidad.puntos >= 0` y `beneficio.stock_disponible >= 0`.
- `linea_receta.porcentaje_merma` entre 0 y menos de 100; `linea_receta.cantidad > 0` y `receta.rendimiento > 0`.
- `beneficio`: `menu_id` obligatorio solo en PROMOCION; `criterio_tipo` y `criterio_valor` obligatorios solo en RECOMPENSA.
- `componente_inventario.unidad_base` en GRAMO, MILILITRO o UNIDAD.
- `beneficio`: `vigencia_hasta > vigencia_desde`; `stock_inicial > 0`; `stock_inicial` y `stock_disponible` ambos nulos o ambos con valor; `stock_disponible <= stock_inicial`.
- `componente_inventario.lleva_stock` solo puede ser verdadero en un INTERMEDIO.
- `movimiento_stock`: `motivo_merma` con valor si y solo si el tipo es MERMA; `tanda_id` con valor si y solo si el tipo es PRODUCCION o CONSUMO_PRODUCCION; `cantidad_teorica` con valor si y solo si el tipo es CONSUMO_PRODUCCION.
- `tanda_produccion.cantidad_esperada > 0` y `cantidad_obtenida > 0`.

## Otras reglas

- **Zona horaria:** los `timestamptz` se guardan en UTC. Las horas en punto de las reservas, los `time` de horarios y los `date` (turnos, pronósticos, alertas) se interpretan en America/Argentina/Buenos_Aires.
- **Aislamiento por tenant:** las tablas que no tienen `restaurante_id` ni `sucursal_id` (por ejemplo `pago`, `linea_pedido` o `movimiento_stock`) se filtran a través de la relación con su tabla padre.
- **Stock:** `movimiento_stock.cantidad` lleva signo y `existencia.cantidad_actual` es la suma de los movimientos. Tienen existencia los insumos y los intermedios con `lleva_stock`; la explosión de una receta se detiene en ellos.
