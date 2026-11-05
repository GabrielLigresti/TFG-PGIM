import express, { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  cambiarContrasenaSchema,
  cuentaComensalSchema,
  cuentaEmpleadoSchema,
  type CambiarContrasenaInput,
  type CuentaComensalInput,
  type CuentaEmpleadoInput,
} from '@pgim/shared';
import { autenticar, soloTipo, tenant, validar } from '../middleware/auth';
import { cuentaService } from '../services/cuenta.service';

// CU-20: autenticación sin permiso especial. El usuarioId sale siempre de la
// sesión (req.sesion), nunca del body ni de la URL.
export const cuentaRouter = Router();

cuentaRouter.use(autenticar);

// Intentos fallidos de cambio de contraseña, por usuario (como el login).
const limiteContrasena = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.sesion!.usuario.id,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});

// El empleado pasa por tenant; el comensal no pertenece a un restaurante.
const tenantSiEmpleado: RequestHandler = (req, res, next) =>
  req.sesion!.usuario.tipo === 'EMPLEADO' ? tenant(req, res, next) : next();

// El esquema se elige por el tipo de la sesión: un body con campos del otro
// tipo de usuario no pasa la validación.
const validarSegunTipo: RequestHandler = (req, res, next) =>
  validar(req.sesion!.usuario.tipo === 'COMENSAL' ? cuentaComensalSchema : cuentaEmpleadoSchema)(
    req,
    res,
    next,
  );

cuentaRouter.get('/', tenantSiEmpleado, async (req, res) => {
  res.json(await cuentaService.obtener(req.sesion!.usuario.id, req.tenant?.restauranteId ?? null));
});

cuentaRouter.put('/', tenantSiEmpleado, validarSegunTipo, async (req, res) => {
  const usuarioId = req.sesion!.usuario.id;
  if (req.tenant) {
    res.json(
      await cuentaService.actualizarEmpleado(
        usuarioId,
        req.tenant.restauranteId,
        req.body as CuentaEmpleadoInput,
      ),
    );
    return;
  }
  res.json(await cuentaService.actualizarComensal(usuarioId, req.body as CuentaComensalInput));
});

// Foto propia, hasta 5 MB y como cuerpo binario (sin multipart).
const archivoFoto = express.raw({ type: 'application/octet-stream', limit: '5mb' });

cuentaRouter.put('/foto', soloTipo('EMPLEADO'), tenant, archivoFoto, async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    res.status(400).json({ error: 'Falta la foto' });
    return;
  }
  res.json(
    await cuentaService.subirFoto(req.sesion!.usuario.id, req.tenant!.restauranteId, req.body),
  );
});

cuentaRouter.put(
  '/contrasena',
  // La validación va antes: un pedido mal formado no gasta intentos.
  validar(cambiarContrasenaSchema),
  limiteContrasena,
  async (req, res) => {
    const { actual, nueva } = req.body as CambiarContrasenaInput;
    await cuentaService.cambiarContrasena(req.sesion!.usuario.id, actual, nueva);
    res.status(204).end();
  },
);
