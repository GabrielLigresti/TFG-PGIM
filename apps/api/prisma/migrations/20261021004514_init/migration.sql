-- CreateEnum
CREATE TYPE "tipo_usuario" AS ENUM ('EMPLEADO', 'COMENSAL');

-- CreateEnum
CREATE TYPE "arquetipo" AS ENUM ('MOZO', 'COCINERO', 'OTRO');

-- CreateEnum
CREATE TYPE "franja_servicio" AS ENUM ('ALMUERZO', 'CENA');

-- CreateEnum
CREATE TYPE "modo_asignacion" AS ENUM ('MANUAL', 'AUTOMATICA');

-- CreateEnum
CREATE TYPE "estado_reserva" AS ENUM ('PENDIENTE', 'ACTIVA', 'FINALIZADA', 'CANCELADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "estado_cuenta" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "estado_pedido" AS ENUM ('CONFIRMADO', 'EN_PREPARACION', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "metodo_pago" AS ENUM ('TARJETA', 'BILLETERA_VIRTUAL');

-- CreateEnum
CREATE TYPE "estado_pago" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateEnum
CREATE TYPE "tipo_componente" AS ENUM ('INSUMO', 'INTERMEDIO');

-- CreateEnum
CREATE TYPE "unidad_medida" AS ENUM ('GRAMO', 'KILOGRAMO', 'MILILITRO', 'LITRO', 'UNIDAD');

-- CreateEnum
CREATE TYPE "tipo_movimiento" AS ENUM ('INGRESO', 'CONSUMO_PEDIDO', 'DEVOLUCION_PEDIDO', 'MERMA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "tipo_movimiento_puntos" AS ENUM ('ACREDITACION', 'CANJE', 'AJUSTE');

-- CreateEnum
CREATE TYPE "clase_beneficio" AS ENUM ('RECOMPENSA', 'PROMOCION');

-- CreateEnum
CREATE TYPE "tipo_criterio" AS ENUM ('VISITAS', 'MONTO', 'PUNTOS', 'NUEVO_CLIENTE');

-- CreateEnum
CREATE TYPE "tipo_descuento" AS ENUM ('PORCENTAJE', 'MONTO_FIJO');

-- CreateEnum
CREATE TYPE "estado_planificacion" AS ENUM ('BORRADOR', 'CONFIRMADA');

-- CreateEnum
CREATE TYPE "metodo_pronostico" AS ENUM ('PROMEDIO_MOVIL_PONDERADO', 'NAIVE_ESTACIONAL', 'REGRESION_ESTACIONAL');

-- CreateEnum
CREATE TYPE "tipo_alerta" AS ENUM ('PLATO_SIN_RECETA', 'STOCK_INSUFICIENTE', 'FALTANTE_STOCK_PREVISTO', 'FALTANTE_PERSONAL', 'CAPACIDAD_MESAS');

-- CreateEnum
CREATE TYPE "severidad" AS ENUM ('INFO', 'ADVERTENCIA', 'CRITICA');

-- CreateTable
CREATE TABLE "restaurante" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,

    CONSTRAINT "restaurante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursal" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "horario_apertura" TIME(0) NOT NULL,
    "horario_cierre" TIME(0) NOT NULL,
    "tolerancia_no_show_min" INTEGER NOT NULL,
    "menu_activo_id" UUID,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "tipo" "tipo_usuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credencial_biometrica" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "clave_publica" TEXT NOT NULL,
    "dispositivo" TEXT,
    "contador_firmas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "credencial_biometrica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "empleado" (
    "usuario_id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "foto_url" TEXT,
    "horas_semanales_max" INTEGER NOT NULL,

    CONSTRAINT "empleado_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "comensal" (
    "usuario_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,

    CONSTRAINT "comensal_pkey" PRIMARY KEY ("usuario_id")
);

-- CreateTable
CREATE TABLE "rol" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "predeterminado" BOOLEAN NOT NULL DEFAULT false,
    "arquetipo" "arquetipo" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" TEXT NOT NULL,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "rol_id" UUID NOT NULL,
    "permiso_id" UUID NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "empleado_sucursal" (
    "empleado_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,

    CONSTRAINT "empleado_sucursal_pkey" PRIMARY KEY ("empleado_id","sucursal_id")
);

-- CreateTable
CREATE TABLE "horario_servicio" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "franja" "franja_servicio" NOT NULL,
    "hora_inicio" TIME(0) NOT NULL,
    "hora_fin" TIME(0) NOT NULL,

    CONSTRAINT "horario_servicio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turno" (
    "id" UUID NOT NULL,
    "planificacion_id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "franja" "franja_servicio" NOT NULL,

    CONSTRAINT "turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mesa" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "capacidad" INTEGER NOT NULL,
    "pos_x" DECIMAL(8,2) NOT NULL,
    "pos_y" DECIMAL(8,2) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reserva" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "mesa_id" UUID NOT NULL,
    "comensal_id" UUID NOT NULL,
    "inicio" TIMESTAMPTZ(6) NOT NULL,
    "cantidad_personas" INTEGER NOT NULL,
    "modo_asignacion" "modo_asignacion" NOT NULL,
    "estado" "estado_reserva" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "reserva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuenta_mesa" (
    "id" UUID NOT NULL,
    "reserva_id" UUID NOT NULL,
    "abierta_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerrada_en" TIMESTAMPTZ(6),
    "estado" "estado_cuenta" NOT NULL DEFAULT 'ABIERTA',

    CONSTRAINT "cuenta_mesa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido" (
    "id" UUID NOT NULL,
    "cuenta_mesa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "estado_pedido" NOT NULL DEFAULT 'CONFIRMADO',
    "motivo_cancelacion" TEXT,

    CONSTRAINT "pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linea_pedido" (
    "id" UUID NOT NULL,
    "pedido_id" UUID NOT NULL,
    "item_menu_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "observaciones" TEXT,

    CONSTRAINT "linea_pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago" (
    "id" UUID NOT NULL,
    "cuenta_mesa_id" UUID NOT NULL,
    "comensal_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo" "metodo_pago" NOT NULL,
    "estado" "estado_pago" NOT NULL DEFAULT 'PENDIENTE',
    "referencia_externa" TEXT,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobante" (
    "id" UUID NOT NULL,
    "pago_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha_emision" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medio_pago_guardado" (
    "id" UUID NOT NULL,
    "comensal_id" UUID NOT NULL,
    "token_pasarela" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "ultimos4" CHAR(4) NOT NULL,

    CONSTRAINT "medio_pago_guardado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,

    CONSTRAINT "menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item" (
    "menu_id" UUID NOT NULL,
    "item_menu_id" UUID NOT NULL,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("menu_id","item_menu_id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "requiere_receta" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_menu" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(12,2) NOT NULL,
    "foto_url" TEXT,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "item_menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_ra" (
    "id" UUID NOT NULL,
    "item_menu_id" UUID NOT NULL,
    "url_modelo" TEXT NOT NULL,
    "url_modelo_ios" TEXT,
    "escala_real" DECIMAL(10,4) NOT NULL,
    "porcion_gramos" INTEGER NOT NULL,

    CONSTRAINT "modelo_ra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "componente_inventario" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "tipo" "tipo_componente" NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad_base" "unidad_medida" NOT NULL,
    "costo_compra" DECIMAL(14,4),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "componente_inventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receta" (
    "id" UUID NOT NULL,
    "item_menu_id" UUID,
    "producto_intermedio_id" UUID,
    "rendimiento" DECIMAL(14,3) NOT NULL,
    "instrucciones" TEXT,

    CONSTRAINT "receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linea_receta" (
    "id" UUID NOT NULL,
    "receta_id" UUID NOT NULL,
    "componente_id" UUID NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "unidad" "unidad_medida" NOT NULL,
    "porcentaje_merma" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "linea_receta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "existencia" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "componente_id" UUID NOT NULL,
    "cantidad_actual" DECIMAL(14,3) NOT NULL DEFAULT 0,

    CONSTRAINT "existencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_stock" (
    "id" UUID NOT NULL,
    "existencia_id" UUID NOT NULL,
    "tipo" "tipo_movimiento" NOT NULL,
    "cantidad" DECIMAL(14,3) NOT NULL,
    "costo_unitario" DECIMAL(14,4) NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motivo" TEXT,
    "linea_pedido_id" UUID,
    "empleado_id" UUID,

    CONSTRAINT "movimiento_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programa_fidelidad" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "puntos_por_unidad" DECIMAL(10,4) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "programa_fidelidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuenta_fidelidad" (
    "id" UUID NOT NULL,
    "comensal_id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "puntos" INTEGER NOT NULL DEFAULT 0,
    "cantidad_visitas" INTEGER NOT NULL DEFAULT 0,
    "monto_acumulado" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "cuenta_fidelidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visita" (
    "id" UUID NOT NULL,
    "cuenta_fidelidad_id" UUID NOT NULL,
    "cuenta_mesa_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visita_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimiento_puntos" (
    "id" UUID NOT NULL,
    "cuenta_fidelidad_id" UUID NOT NULL,
    "pago_id" UUID,
    "tipo" "tipo_movimiento_puntos" NOT NULL,
    "puntos" INTEGER NOT NULL,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimiento_puntos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupo_beneficios" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "grupo_beneficios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficio" (
    "id" UUID NOT NULL,
    "restaurante_id" UUID NOT NULL,
    "grupo_id" UUID,
    "nombre" TEXT NOT NULL,
    "clase" "clase_beneficio" NOT NULL,
    "menu_id" UUID,
    "criterio_tipo" "tipo_criterio",
    "criterio_valor" DECIMAL(12,2),
    "tipo_descuento" "tipo_descuento" NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "vigencia_desde" TIMESTAMPTZ(6),
    "vigencia_hasta" TIMESTAMPTZ(6),
    "stock_disponible" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "beneficio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficio_aplicado" (
    "pago_id" UUID NOT NULL,
    "beneficio_id" UUID NOT NULL,
    "monto_descontado" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "beneficio_aplicado_pkey" PRIMARY KEY ("pago_id","beneficio_id")
);

-- CreateTable
CREATE TABLE "configuracion_apertura" (
    "sucursal_id" UUID NOT NULL,
    "semanas_historico_minimo" INTEGER NOT NULL DEFAULT 8,
    "cubiertos_por_mozo" DECIMAL(10,4) NOT NULL,
    "platos_por_cocinero_hora" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "configuracion_apertura_pkey" PRIMARY KEY ("sucursal_id")
);

-- CreateTable
CREATE TABLE "planificacion_turnos" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "semana_desde" DATE NOT NULL,
    "estado" "estado_planificacion" NOT NULL DEFAULT 'BORRADOR',
    "generada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmada_en" TIMESTAMPTZ(6),

    CONSTRAINT "planificacion_turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pronostico" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "fecha_servicio" DATE NOT NULL,
    "franja" "franja_servicio" NOT NULL,
    "cubiertos_estimados" INTEGER NOT NULL,
    "limite_inferior" INTEGER NOT NULL,
    "limite_superior" INTEGER NOT NULL,
    "ingreso_estimado" DECIMAL(12,2) NOT NULL,
    "error_mape" DECIMAL(5,2) NOT NULL,
    "metodo" "metodo_pronostico" NOT NULL,
    "generado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pronostico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demanda_item" (
    "pronostico_id" UUID NOT NULL,
    "item_menu_id" UUID NOT NULL,
    "cantidad_estimada" INTEGER NOT NULL,

    CONSTRAINT "demanda_item_pkey" PRIMARY KEY ("pronostico_id","item_menu_id")
);

-- CreateTable
CREATE TABLE "alerta" (
    "id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "pronostico_id" UUID,
    "planificacion_id" UUID,
    "existencia_id" UUID,
    "item_menu_id" UUID,
    "tipo" "tipo_alerta" NOT NULL,
    "severidad" "severidad" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha_servicio" DATE,
    "franja" "franja_servicio",
    "arquetipo" "arquetipo",
    "cantidad" INTEGER,
    "creada_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelta" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "alerta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "restaurante_cuit_key" ON "restaurante"("cuit");

-- CreateIndex
CREATE INDEX "sucursal_restaurante_id_idx" ON "sucursal"("restaurante_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "credencial_biometrica_credential_id_key" ON "credencial_biometrica"("credential_id");

-- CreateIndex
CREATE INDEX "credencial_biometrica_usuario_id_idx" ON "credencial_biometrica"("usuario_id");

-- CreateIndex
CREATE INDEX "empleado_restaurante_id_idx" ON "empleado"("restaurante_id");

-- CreateIndex
CREATE INDEX "empleado_rol_id_idx" ON "empleado"("rol_id");

-- CreateIndex
CREATE UNIQUE INDEX "rol_restaurante_id_nombre_key" ON "rol"("restaurante_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "permiso_codigo_key" ON "permiso"("codigo");

-- CreateIndex
CREATE INDEX "rol_permiso_permiso_id_idx" ON "rol_permiso"("permiso_id");

-- CreateIndex
CREATE INDEX "empleado_sucursal_sucursal_id_idx" ON "empleado_sucursal"("sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "horario_servicio_sucursal_id_franja_key" ON "horario_servicio"("sucursal_id", "franja");

-- CreateIndex
CREATE INDEX "turno_planificacion_id_idx" ON "turno"("planificacion_id");

-- CreateIndex
CREATE INDEX "turno_sucursal_id_fecha_idx" ON "turno"("sucursal_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "turno_empleado_id_fecha_franja_key" ON "turno"("empleado_id", "fecha", "franja");

-- CreateIndex
CREATE UNIQUE INDEX "mesa_sucursal_id_numero_key" ON "mesa"("sucursal_id", "numero");

-- CreateIndex
CREATE INDEX "reserva_sucursal_id_inicio_idx" ON "reserva"("sucursal_id", "inicio");

-- CreateIndex
CREATE INDEX "reserva_mesa_id_idx" ON "reserva"("mesa_id");

-- CreateIndex
CREATE INDEX "reserva_comensal_id_idx" ON "reserva"("comensal_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_mesa_reserva_id_key" ON "cuenta_mesa"("reserva_id");

-- CreateIndex
CREATE INDEX "pedido_sucursal_id_estado_creado_en_idx" ON "pedido"("sucursal_id", "estado", "creado_en");

-- CreateIndex
CREATE INDEX "pedido_cuenta_mesa_id_idx" ON "pedido"("cuenta_mesa_id");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_sucursal_id_numero_key" ON "pedido"("sucursal_id", "numero");

-- CreateIndex
CREATE INDEX "linea_pedido_pedido_id_idx" ON "linea_pedido"("pedido_id");

-- CreateIndex
CREATE INDEX "linea_pedido_item_menu_id_idx" ON "linea_pedido"("item_menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "pago_referencia_externa_key" ON "pago"("referencia_externa");

-- CreateIndex
CREATE INDEX "pago_cuenta_mesa_id_idx" ON "pago"("cuenta_mesa_id");

-- CreateIndex
CREATE INDEX "pago_comensal_id_idx" ON "pago"("comensal_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_pago_id_key" ON "comprobante"("pago_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobante_numero_key" ON "comprobante"("numero");

-- CreateIndex
CREATE INDEX "medio_pago_guardado_comensal_id_idx" ON "medio_pago_guardado"("comensal_id");

-- CreateIndex
CREATE INDEX "menu_restaurante_id_idx" ON "menu"("restaurante_id");

-- CreateIndex
CREATE INDEX "menu_item_item_menu_id_idx" ON "menu_item"("item_menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_restaurante_id_nombre_key" ON "categoria"("restaurante_id", "nombre");

-- CreateIndex
CREATE INDEX "item_menu_restaurante_id_idx" ON "item_menu"("restaurante_id");

-- CreateIndex
CREATE INDEX "item_menu_categoria_id_idx" ON "item_menu"("categoria_id");

-- CreateIndex
CREATE UNIQUE INDEX "modelo_ra_item_menu_id_key" ON "modelo_ra"("item_menu_id");

-- CreateIndex
CREATE INDEX "componente_inventario_restaurante_id_idx" ON "componente_inventario"("restaurante_id");

-- CreateIndex
CREATE UNIQUE INDEX "receta_item_menu_id_key" ON "receta"("item_menu_id");

-- CreateIndex
CREATE UNIQUE INDEX "receta_producto_intermedio_id_key" ON "receta"("producto_intermedio_id");

-- CreateIndex
CREATE INDEX "linea_receta_componente_id_idx" ON "linea_receta"("componente_id");

-- CreateIndex
CREATE UNIQUE INDEX "linea_receta_receta_id_componente_id_key" ON "linea_receta"("receta_id", "componente_id");

-- CreateIndex
CREATE INDEX "existencia_componente_id_idx" ON "existencia"("componente_id");

-- CreateIndex
CREATE UNIQUE INDEX "existencia_sucursal_id_componente_id_key" ON "existencia"("sucursal_id", "componente_id");

-- CreateIndex
CREATE INDEX "movimiento_stock_existencia_id_fecha_idx" ON "movimiento_stock"("existencia_id", "fecha");

-- CreateIndex
CREATE INDEX "movimiento_stock_linea_pedido_id_idx" ON "movimiento_stock"("linea_pedido_id");

-- CreateIndex
CREATE INDEX "movimiento_stock_empleado_id_idx" ON "movimiento_stock"("empleado_id");

-- CreateIndex
CREATE UNIQUE INDEX "programa_fidelidad_restaurante_id_key" ON "programa_fidelidad"("restaurante_id");

-- CreateIndex
CREATE INDEX "cuenta_fidelidad_restaurante_id_idx" ON "cuenta_fidelidad"("restaurante_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_fidelidad_comensal_id_restaurante_id_key" ON "cuenta_fidelidad"("comensal_id", "restaurante_id");

-- CreateIndex
CREATE INDEX "visita_cuenta_mesa_id_idx" ON "visita"("cuenta_mesa_id");

-- CreateIndex
CREATE UNIQUE INDEX "visita_cuenta_fidelidad_id_cuenta_mesa_id_key" ON "visita"("cuenta_fidelidad_id", "cuenta_mesa_id");

-- CreateIndex
CREATE INDEX "movimiento_puntos_cuenta_fidelidad_id_fecha_idx" ON "movimiento_puntos"("cuenta_fidelidad_id", "fecha");

-- CreateIndex
CREATE INDEX "movimiento_puntos_pago_id_idx" ON "movimiento_puntos"("pago_id");

-- CreateIndex
CREATE INDEX "grupo_beneficios_restaurante_id_idx" ON "grupo_beneficios"("restaurante_id");

-- CreateIndex
CREATE INDEX "beneficio_restaurante_id_idx" ON "beneficio"("restaurante_id");

-- CreateIndex
CREATE INDEX "beneficio_grupo_id_idx" ON "beneficio"("grupo_id");

-- CreateIndex
CREATE INDEX "beneficio_menu_id_idx" ON "beneficio"("menu_id");

-- CreateIndex
CREATE INDEX "beneficio_aplicado_beneficio_id_idx" ON "beneficio_aplicado"("beneficio_id");

-- CreateIndex
CREATE UNIQUE INDEX "planificacion_turnos_sucursal_id_semana_desde_key" ON "planificacion_turnos"("sucursal_id", "semana_desde");

-- CreateIndex
CREATE INDEX "pronostico_sucursal_id_fecha_servicio_franja_idx" ON "pronostico"("sucursal_id", "fecha_servicio", "franja");

-- CreateIndex
CREATE INDEX "demanda_item_item_menu_id_idx" ON "demanda_item"("item_menu_id");

-- CreateIndex
CREATE INDEX "alerta_sucursal_id_resuelta_creada_en_idx" ON "alerta"("sucursal_id", "resuelta", "creada_en");

-- CreateIndex
CREATE INDEX "alerta_pronostico_id_idx" ON "alerta"("pronostico_id");

-- CreateIndex
CREATE INDEX "alerta_planificacion_id_idx" ON "alerta"("planificacion_id");

-- CreateIndex
CREATE INDEX "alerta_existencia_id_idx" ON "alerta"("existencia_id");

-- CreateIndex
CREATE INDEX "alerta_item_menu_id_idx" ON "alerta"("item_menu_id");

-- AddForeignKey
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_menu_activo_id_fkey" FOREIGN KEY ("menu_activo_id") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credencial_biometrica" ADD CONSTRAINT "credencial_biometrica_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comensal" ADD CONSTRAINT "comensal_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol" ADD CONSTRAINT "rol_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permiso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_sucursal" ADD CONSTRAINT "empleado_sucursal_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("usuario_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_sucursal" ADD CONSTRAINT "empleado_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horario_servicio" ADD CONSTRAINT "horario_servicio_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_planificacion_id_fkey" FOREIGN KEY ("planificacion_id") REFERENCES "planificacion_turnos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mesa" ADD CONSTRAINT "mesa_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_mesa_id_fkey" FOREIGN KEY ("mesa_id") REFERENCES "mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_comensal_id_fkey" FOREIGN KEY ("comensal_id") REFERENCES "comensal"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_mesa" ADD CONSTRAINT "cuenta_mesa_reserva_id_fkey" FOREIGN KEY ("reserva_id") REFERENCES "reserva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_cuenta_mesa_id_fkey" FOREIGN KEY ("cuenta_mesa_id") REFERENCES "cuenta_mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido" ADD CONSTRAINT "pedido_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linea_pedido" ADD CONSTRAINT "linea_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linea_pedido" ADD CONSTRAINT "linea_pedido_item_menu_id_fkey" FOREIGN KEY ("item_menu_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_cuenta_mesa_id_fkey" FOREIGN KEY ("cuenta_mesa_id") REFERENCES "cuenta_mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_comensal_id_fkey" FOREIGN KEY ("comensal_id") REFERENCES "comensal"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobante" ADD CONSTRAINT "comprobante_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medio_pago_guardado" ADD CONSTRAINT "medio_pago_guardado_comensal_id_fkey" FOREIGN KEY ("comensal_id") REFERENCES "comensal"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu" ADD CONSTRAINT "menu_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_item_menu_id_fkey" FOREIGN KEY ("item_menu_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categoria" ADD CONSTRAINT "categoria_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_menu" ADD CONSTRAINT "item_menu_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_menu" ADD CONSTRAINT "item_menu_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelo_ra" ADD CONSTRAINT "modelo_ra_item_menu_id_fkey" FOREIGN KEY ("item_menu_id") REFERENCES "item_menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "componente_inventario" ADD CONSTRAINT "componente_inventario_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta" ADD CONSTRAINT "receta_item_menu_id_fkey" FOREIGN KEY ("item_menu_id") REFERENCES "item_menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receta" ADD CONSTRAINT "receta_producto_intermedio_id_fkey" FOREIGN KEY ("producto_intermedio_id") REFERENCES "componente_inventario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linea_receta" ADD CONSTRAINT "linea_receta_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "receta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linea_receta" ADD CONSTRAINT "linea_receta_componente_id_fkey" FOREIGN KEY ("componente_id") REFERENCES "componente_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_componente_id_fkey" FOREIGN KEY ("componente_id") REFERENCES "componente_inventario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_existencia_id_fkey" FOREIGN KEY ("existencia_id") REFERENCES "existencia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_linea_pedido_id_fkey" FOREIGN KEY ("linea_pedido_id") REFERENCES "linea_pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_stock" ADD CONSTRAINT "movimiento_stock_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("usuario_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programa_fidelidad" ADD CONSTRAINT "programa_fidelidad_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_fidelidad" ADD CONSTRAINT "cuenta_fidelidad_comensal_id_fkey" FOREIGN KEY ("comensal_id") REFERENCES "comensal"("usuario_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_fidelidad" ADD CONSTRAINT "cuenta_fidelidad_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visita" ADD CONSTRAINT "visita_cuenta_fidelidad_id_fkey" FOREIGN KEY ("cuenta_fidelidad_id") REFERENCES "cuenta_fidelidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visita" ADD CONSTRAINT "visita_cuenta_mesa_id_fkey" FOREIGN KEY ("cuenta_mesa_id") REFERENCES "cuenta_mesa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_cuenta_fidelidad_id_fkey" FOREIGN KEY ("cuenta_fidelidad_id") REFERENCES "cuenta_fidelidad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimiento_puntos" ADD CONSTRAINT "movimiento_puntos_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupo_beneficios" ADD CONSTRAINT "grupo_beneficios_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_restaurante_id_fkey" FOREIGN KEY ("restaurante_id") REFERENCES "restaurante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupo_beneficios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficio_aplicado" ADD CONSTRAINT "beneficio_aplicado_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficio_aplicado" ADD CONSTRAINT "beneficio_aplicado_beneficio_id_fkey" FOREIGN KEY ("beneficio_id") REFERENCES "beneficio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_apertura" ADD CONSTRAINT "configuracion_apertura_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planificacion_turnos" ADD CONSTRAINT "planificacion_turnos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pronostico" ADD CONSTRAINT "pronostico_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demanda_item" ADD CONSTRAINT "demanda_item_pronostico_id_fkey" FOREIGN KEY ("pronostico_id") REFERENCES "pronostico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demanda_item" ADD CONSTRAINT "demanda_item_item_menu_id_fkey" FOREIGN KEY ("item_menu_id") REFERENCES "item_menu"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_pronostico_id_fkey" FOREIGN KEY ("pronostico_id") REFERENCES "pronostico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_planificacion_id_fkey" FOREIGN KEY ("planificacion_id") REFERENCES "planificacion_turnos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_existencia_id_fkey" FOREIGN KEY ("existencia_id") REFERENCES "existencia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta" ADD CONSTRAINT "alerta_item_menu_id_fkey" FOREIGN KEY ("item_menu_id") REFERENCES "item_menu"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Restricciones que Prisma no expresa (docs/modelos/der/convenciones.md) ───

-- Una reserva vigente por mesa y franja.
CREATE UNIQUE INDEX "reserva_mesa_id_inicio_vigente_key" ON "reserva"("mesa_id", "inicio")
    WHERE "estado" IN ('PENDIENTE', 'ACTIVA');

-- Reserva a la hora en punto.
ALTER TABLE "reserva" ADD CONSTRAINT "reserva_inicio_en_punto_check"
    CHECK (date_trunc('hour', "inicio") = "inicio");

-- La receta pertenece a un ítem o a un intermedio, nunca a los dos.
ALTER TABLE "receta" ADD CONSTRAINT "receta_dueno_exclusivo_check"
    CHECK (("item_menu_id" IS NULL) <> ("producto_intermedio_id" IS NULL));
ALTER TABLE "receta" ADD CONSTRAINT "receta_rendimiento_check"
    CHECK ("rendimiento" > 0);

ALTER TABLE "linea_receta" ADD CONSTRAINT "linea_receta_cantidad_check"
    CHECK ("cantidad" > 0);
ALTER TABLE "linea_receta" ADD CONSTRAINT "linea_receta_porcentaje_merma_check"
    CHECK ("porcentaje_merma" >= 0 AND "porcentaje_merma" < 100);

ALTER TABLE "componente_inventario" ADD CONSTRAINT "componente_inventario_unidad_base_check"
    CHECK ("unidad_base" IN ('GRAMO', 'MILILITRO', 'UNIDAD'));

-- El stock nunca queda negativo.
ALTER TABLE "existencia" ADD CONSTRAINT "existencia_cantidad_actual_check"
    CHECK ("cantidad_actual" >= 0);

ALTER TABLE "cuenta_fidelidad" ADD CONSTRAINT "cuenta_fidelidad_puntos_check"
    CHECK ("puntos" >= 0);

ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_stock_disponible_check"
    CHECK ("stock_disponible" IS NULL OR "stock_disponible" >= 0);
-- menu_id solo y obligatorio en PROMOCION; criterio solo y obligatorio en RECOMPENSA.
ALTER TABLE "beneficio" ADD CONSTRAINT "beneficio_campos_por_clase_check"
    CHECK (
        ("clase" = 'PROMOCION' AND "menu_id" IS NOT NULL
            AND "criterio_tipo" IS NULL AND "criterio_valor" IS NULL)
        OR
        ("clase" = 'RECOMPENSA' AND "menu_id" IS NULL
            AND "criterio_tipo" IS NOT NULL AND "criterio_valor" IS NOT NULL)
    );
