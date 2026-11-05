import { expect, test, type Page } from '@playwright/test';
import { ingresarEmpleado, moverReservaAhora } from '../lib/base';

// Camino principal: reserva → activación → pedido → cocina y salón → pago →
// cierre de mesa → puntos. El comensal y el personal van en contextos
// distintos, así que también se prueba la sincronización por Socket.IO.
test('del alta del comensal a su primera visita, con el personal en otra sesión', async ({
  browser,
}) => {
  const corrida = Date.now();
  const email = `e2e-${corrida}@demo.pgim.test`;
  const nombre = `Ema ${corrida}`;

  const comensal = await (await browser.newContext()).newPage();

  // 1. Desde la carta de Centro, reservar sin sesión lleva a registrarse y vuelve a reservar.
  await comensal.goto('/');
  await comensal.getByRole('searchbox', { name: 'Buscar' }).fill('milanesa');
  const centro = comensal.getByRole('listitem').filter({ hasText: 'Centro' });
  await centro.getByRole('link', { name: 'Ver carta' }).click();
  await comensal.getByRole('link', { name: 'Reservar mesa' }).click();
  await expect(comensal).toHaveURL(/\/login$/);
  await comensal.getByRole('link', { name: 'Registrate' }).click();
  await comensal.getByLabel('Nombre').fill(nombre);
  await comensal.getByLabel('Email').fill(email);
  await comensal.getByLabel('Contraseña').fill('clave-e2e-1234');
  await comensal.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(comensal).toHaveURL(/\/s\/[^/]+\/reservar$/);

  // 2. Primera franja disponible de hoy (si ya no queda ninguna, la de mañana) para 2.
  await comensal.getByLabel('Personas').selectOption('2');
  const franjas = comensal
    .getByRole('button', { pressed: false })
    .filter({ hasText: /^\d{2}:\d{2}$/ });
  try {
    await franjas.first().waitFor({ timeout: 5_000 });
  } catch {
    const manana = new Date(Date.now() + 27 * 3_600_000).toLocaleDateString('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    await comensal.getByLabel('Fecha').fill(manana);
  }
  await franjas.first().click();
  await comensal.getByRole('button', { name: 'Asignarme una mesa' }).click();
  await expect(comensal.getByRole('heading', { name: '¡Reserva confirmada!' })).toBeVisible();

  // La reserva es de una franja en punto: se la lleva a "ahora" para entrar en
  // la ventana de activación (30 min antes del inicio) sin tocar el dominio.
  moverReservaAhora(email);

  // 3. El comensal espera en "Mi mesa"; el gerente activa y la pantalla cambia sola.
  await comensal.goto('/mesa');
  await expect(comensal.getByText('No tenés una mesa activa')).toBeVisible();

  const gerente = await (await browser.newContext()).newPage();
  await ingresarEmpleado(gerente, 'gerente@demo.pgim.test');
  await gerente.goto('/panel/reservas');
  const filaReserva = gerente.getByRole('row').filter({ hasText: nombre });
  await filaReserva.getByRole('button', { name: 'Activar mesa' }).click();
  await expect(comensal.getByRole('heading', { name: /^Mesa \d+$/ })).toBeVisible();

  // 4. Pide la milanesa desde la carta.
  await comensal.getByRole('link', { name: 'Pedir más' }).click();
  await comensal.getByRole('button', { name: 'Agregar Milanesa con puré' }).click();
  await comensal.getByRole('link', { name: /^Ver pedido/ }).click();
  await comensal.getByRole('button', { name: /^Confirmar pedido/ }).click();
  await expect(comensal).toHaveURL(/\/mesa$/);
  await expectPedido(comensal, 'Recibido');

  // El número de pedido identifica la comanda de esta corrida en la cocina.
  const numeroPedido = (
    await comensal
      .getByText(/Pedido #\d+/)
      .first()
      .innerText()
  ).match(/#(\d+)/)![1];
  const comanda = (page: Page) =>
    page.getByRole('article').filter({ hasText: `Pedido #${numeroPedido}` });

  // 5. Cocina lo prepara, y el mozo lo entrega; el comensal ve cada estado.
  const cocina = await (await browser.newContext()).newPage();
  await ingresarEmpleado(cocina, 'cocina@demo.pgim.test');
  await cocina.goto('/panel/cocina');
  await comanda(cocina).getByRole('button', { name: 'Empezar' }).click();
  await expectPedido(comensal, 'En preparación');
  await comanda(cocina).getByRole('button', { name: 'Marcar listo' }).click();
  await expectPedido(comensal, 'Listo');

  const mozo = await (await browser.newContext()).newPage();
  await ingresarEmpleado(mozo, 'mozo@demo.pgim.test');
  await mozo.goto('/panel/cocina');
  await comanda(mozo).getByRole('button', { name: 'Entregar' }).click();
  await expectPedido(comensal, 'Entregado');

  // 6. Paga el total: la pasarela de prueba aprueba al instante.
  await comensal.getByRole('button', { name: /^Pagar \$/ }).click();
  await expect(comensal.getByText('Pago aprobado')).toBeVisible();
  await expect(comensal.getByText('Comprobante', { exact: true })).toBeVisible();

  // 7. El gerente cierra la mesa.
  await gerente.reload();
  await filaReserva.getByRole('button', { name: 'Cerrar mesa' }).click();
  const confirmar = gerente.getByRole('dialog').getByRole('button', { name: /Cerrar mesa/ });
  if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
  await expect(filaReserva.getByRole('button', { name: 'Cerrar mesa' })).toHaveCount(0);

  // 8. Cuenta la visita en "Mis puntos".
  await comensal.goto('/puntos');
  await expect(comensal.getByText('Visitas', { exact: true }).locator('..')).toHaveText(
    /^Visitas1$/,
  );
});

async function expectPedido(comensal: Page, estado: string) {
  await expect(comensal.getByRole('listitem').filter({ hasText: /Pedido #\d+/ })).toContainText(
    estado,
  );
}
