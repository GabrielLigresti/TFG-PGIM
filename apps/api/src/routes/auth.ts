import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  loginRequestSchema,
  seleccionarSucursalSchema,
  type LoginRequest,
  type SeleccionarSucursalRequest,
} from '@pgim/shared';
import { COOKIE_SESION, opcionesCookie } from '../lib/jwt';
import { autenticar, validar } from '../middleware/auth';
import { authService } from '../services/auth.service';

export const authRouter = Router();

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});

authRouter.post('/login', limiteLogin, validar(loginRequestSchema), async (req, res) => {
  const { email, password } = req.body as LoginRequest;
  const { token, sesion } = await authService.iniciarSesion(email, password);
  res.cookie(COOKIE_SESION, token, opcionesCookie).json(sesion);
});

authRouter.post('/sucursal', autenticar, validar(seleccionarSucursalSchema), async (req, res) => {
  const { sucursalId } = req.body as SeleccionarSucursalRequest;
  const { token, sesion } = await authService.seleccionarSucursal(
    req.sesion!.usuario.id,
    sucursalId,
  );
  res.cookie(COOKIE_SESION, token, opcionesCookie).json(sesion);
});

authRouter.get('/sesion', autenticar, (req, res) => {
  res.json(req.sesion);
});

authRouter.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...opciones } = opcionesCookie;
  res.clearCookie(COOKIE_SESION, opciones).status(204).end();
});
