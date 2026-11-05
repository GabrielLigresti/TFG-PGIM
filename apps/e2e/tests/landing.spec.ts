import { expect, test } from '@playwright/test';

// Landing y carta públicas: todo sin sesión.
test('buscar un plato, filtrar por barrio y ver la carta sin ingresar', async ({ page }) => {
  const noAutorizadas: string[] = [];
  page.on('response', (r) => {
    // La consulta de sesión da 401 sin sesión: es la forma de saber que no hay una.
    if (r.status() === 401 && !r.url().endsWith('/api/auth/sesion')) noAutorizadas.push(r.url());
  });

  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('milanesa');

  const tarjetas = page.getByRole('listitem').filter({ hasText: 'Coincide:' });
  await expect(tarjetas).toHaveCount(2);
  await expect(tarjetas.filter({ hasText: 'Centro' })).toContainText('Milanesa con puré');
  await expect(tarjetas.filter({ hasText: 'Palermo' })).toContainText('Milanesa con puré');
  await expect(page.getByText('2 sucursales')).toBeVisible();

  await page.getByLabel('Barrio').selectOption({ label: 'Palermo' });
  await expect(page.getByText('1 sucursal en Palermo')).toBeVisible();
  await expect(tarjetas).toHaveCount(1);

  await tarjetas.getByRole('link', { name: 'Ver carta' }).click();
  await expect(page).toHaveURL(/\/s\/[^/]+\/menu$/);
  await expect(page.getByRole('heading', { name: 'Palermo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ingresar' })).toBeVisible();

  await page
    .getByRole('link', { name: /Milanesa con puré/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/platos\//);
  await expect(page.getByRole('heading', { name: 'Milanesa con puré' })).toBeVisible();

  expect(noAutorizadas).toEqual([]);
});
