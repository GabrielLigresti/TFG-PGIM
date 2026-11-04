import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';

// Base de la prueba integral: la API, la web y la base de datos van aparte de
// las de desarrollo (puertos y base propios), así que la prueba no pisa nada.

export const RAIZ_API = resolve(__dirname, '../../api');

export const DATABASE_URL = 'postgresql://pgim:pgim@localhost:5432/pgim_e2e?schema=public';
export const PUERTO_API = 3001;
export const PUERTO_WEB = 5174;
export const URL_WEB = `http://localhost:${PUERTO_WEB}`;
// Clave de firma solo para esta prueba (la API pide al menos 32 caracteres).
export const JWT_SECRET_E2E = 'clave-solo-para-la-prueba-e2e-0123456789';

export const PASSWORD_DEMO = 'demo1234';

const entorno = { ...process.env, DATABASE_URL };

export function prisma(...args: string[]) {
  execFileSync('npx', ['prisma', ...args], { cwd: RAIZ_API, env: entorno, stdio: 'inherit' });
}

// SQL directo sobre pgim_e2e (no hay otra forma de mover el reloj de una
// reserva sin tocar las reglas de dominio).
export function ejecutarSql(sql: string) {
  execFileSync('npx', ['prisma', 'db', 'execute', '--stdin'], {
    cwd: RAIZ_API,
    env: entorno,
    input: sql,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

// Centro abre las 24 h, con los dos servicios cubriendo el día: así hay
// franjas de reserva a cualquier hora en la que se corra la prueba. La
// tolerancia sube a 60 min para que, al llevar la reserva a la hora en punto
// más cercana (ver moverReservaAhora), siempre quede dentro de la ventana.
export function abrirCentroTodoElDia() {
  ejecutarSql(`
    UPDATE sucursal SET horario_apertura = '00:00', horario_cierre = '00:00',
        tolerancia_no_show_min = 60
      WHERE nombre = 'Centro';
    UPDATE horario_servicio SET hora_inicio = '00:00', hora_fin = '15:00'
      WHERE franja = 'ALMUERZO'
        AND sucursal_id IN (SELECT id FROM sucursal WHERE nombre = 'Centro');
    UPDATE horario_servicio SET hora_inicio = '15:00', hora_fin = '00:00'
      WHERE franja = 'CENA'
        AND sucursal_id IN (SELECT id FROM sucursal WHERE nombre = 'Centro');
  `);
}

// Una reserva se activa desde 30 minutos antes de su franja hasta el fin de la
// tolerancia, y la base exige que el inicio sea una hora en punto. Se lo lleva
// a la hora en punto más cercana a "ahora" (con 60 min de tolerancia siempre
// cae en la ventana): simula que el comensal llegó a su turno sin cambiar las
// reglas de dominio. La reserva no guarda fin: se deduce del inicio.
export function moverReservaAhora(emailComensal: string) {
  ejecutarSql(`
    UPDATE reserva SET inicio = date_trunc('hour', now() + interval '20 minutes')
      WHERE comensal_id = (SELECT id FROM usuario WHERE email = '${emailComensal}')
        AND estado = 'PENDIENTE';
  `);
}

export async function ingresar(page: Page, email: string, password = PASSWORD_DEMO) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

// Comensal: entra y espera a salir del login (para no cortar la navegación).
export async function ingresarComensal(page: Page, email: string, password = PASSWORD_DEMO) {
  await ingresar(page, email, password);
  await expect(page).not.toHaveURL(/\/login/);
}

// Empleado: entra y, si tiene varias sucursales, elige la de trabajo.
export async function ingresarEmpleado(page: Page, email: string, sucursal = 'Centro') {
  await ingresar(page, email);
  await page.waitForURL(/\/(panel|sucursal)/);
  if (page.url().includes('/sucursal')) {
    await page.getByRole('button', { name: sucursal, exact: true }).click();
  }
  await expect(page).toHaveURL(/\/panel/);
}
