import { expect, test } from '@playwright/test';
import { PASSWORD_DEMO, ingresar, ingresarComensal, ingresarEmpleado } from '../lib/base';

const NUEVA = 'nueva-clave-e2e-5678';

test('el comensal cambia su teléfono y su contraseña', async ({ page }) => {
  const email = 'comensal@demo.pgim.test';
  await ingresarComensal(page, email);
  await page.goto('/cuenta');

  // Teléfono: persiste al recargar.
  await page.getByLabel('Teléfono (opcional)').fill('11 5555 0000');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Datos guardados')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Teléfono (opcional)')).toHaveValue('11 5555 0000');

  try {
    // Contraseña: sale y entra con la nueva; con la vieja, error.
    await page.getByLabel('Contraseña actual').fill(PASSWORD_DEMO);
    await page.getByLabel('Contraseña nueva', { exact: true }).fill(NUEVA);
    await page.getByLabel('Repetir contraseña nueva').fill(NUEVA);
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(page.getByText('Contraseña actualizada')).toBeVisible();

    await page.getByRole('button', { name: 'Salir' }).click();
    await ingresar(page, email, PASSWORD_DEMO);
    await expect(page.getByRole('alert')).toBeVisible();
    await ingresarComensal(page, email, NUEVA);
  } finally {
    // Repetible: la contraseña vuelve a la del seed aunque el spec falle antes.
    await restaurarContrasena(page, email);
  }
});

async function restaurarContrasena(page: import('@playwright/test').Page, email: string) {
  await page.context().clearCookies();
  await ingresar(page, email, NUEVA);
  // Si la contraseña nunca se cambió, la nueva no entra y no hay nada que restaurar.
  const entro = await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 5_000 })
    .then(
      () => true,
      () => false,
    );
  if (!entro) return;
  await page.goto('/cuenta');
  await page.getByLabel('Contraseña actual').fill(NUEVA);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(PASSWORD_DEMO);
  await page.getByLabel('Repetir contraseña nueva').fill(PASSWORD_DEMO);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.getByText('Contraseña actualizada')).toBeVisible();
}

test('el mozo edita su nombre y ve el rol sin poder cambiarlo', async ({ page }) => {
  await ingresarEmpleado(page, 'mozo@demo.pgim.test');
  await page.goto('/panel/mi-cuenta');

  await page.getByLabel('Nombre completo').fill('Mario Mozo E2E');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Datos guardados')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nombre completo')).toHaveValue('Mario Mozo E2E');

  await expect(page.getByText('Rol', { exact: true })).toBeVisible();
  await expect(page.getByText('Mozo', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Rol')).toHaveCount(0);

  // Repetible: el nombre vuelve al del seed.
  await page.getByLabel('Nombre completo').fill('Mario Mozo');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Datos guardados')).toBeVisible();
});
