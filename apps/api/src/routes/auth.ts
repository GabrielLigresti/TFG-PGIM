import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  loginRequestSchema,
  registroComensalSchema,
  seleccionarSucursalSchema,
  type LoginRequest,
  type RegistroComensal,
  type SeleccionarSucursalRequest,
} from '@pgim/shared';
import { COOKIE_SESION, opcionesCookie } from '../lib/jwt';
import { autenticar, validar } from '../middleware/auth';
import { authService } from '../services/auth.service';

export const authRouter = Router();

// Cuentan solo los intentos fallidos: frena la fuerza bruta sin bloquear a
// quien entra y sale varias veces (por ejemplo, al probar distintos roles).
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});

// El registro cuenta también las altas que salen bien: sin verificación de
// email, frena que un script cree cuentas en masa (y esquive la regla de una
// reserva por comensal y hora).
const limiteRegistro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados registros desde esta conexión. Probá de nuevo más tarde.' },
});

authRouter.post('/login', limiteLogin, validar(loginRequestSchema), async (req, res) => {
  const { email, password } = req.body as LoginRequest;
  const { token, sesion } = await authService.iniciarSesion(email, password);
  res.cookie(COOKIE_SESION, token, opcionesCookie(req)).json(sesion);
});

authRouter.post('/registro', limiteRegistro, validar(registroComensalSchema), async (req, res) => {
  const { token, sesion } = await authService.registrarComensal(req.body as RegistroComensal);
  res.cookie(COOKIE_SESION, token, opcionesCookie(req)).status(201).json(sesion);
});

authRouter.post('/sucursal', autenticar, validar(seleccionarSucursalSchema), async (req, res) => {
  const { sucursalId } = req.body as SeleccionarSucursalRequest;
  const { token, sesion } = await authService.seleccionarSucursal(
    req.sesion!.usuario.id,
    sucursalId,
  );
  res.cookie(COOKIE_SESION, token, opcionesCookie(req)).json(sesion);
});

authRouter.get('/sesion', autenticar, (req, res) => {
  res.json(req.sesion);
});

authRouter.post('/logout', (req, res) => {
  const { maxAge: _maxAge, ...opciones } = opcionesCookie(req);
  res.clearCookie(COOKIE_SESION, opciones).status(204).end();
});
