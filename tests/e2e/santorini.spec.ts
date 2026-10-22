import { expect, test, type Page } from '@playwright/test';
import { closeExtraPagesAfterEach } from './cleanup';

closeExtraPagesAfterEach(test);

async function enter(page: Page, name: string, path: string) {
  await page.goto(path);
  await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
  await page.getByRole('button', { name: '섬에 내리기' }).click();
}

test('산토리니: 일꾼을 놓고 한 번 움직여 짓는다', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  host.setDefaultTimeout(10_000);
  guest.setDefaultTimeout(10_000);
  await enter(host, '민수', '/santorini');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, '지수', `/santorini?room=${code}`);
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '섬에서 시작' }).click();
  await expect(host.locator('.st-canvas canvas')).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await host.locator('.st-status.is-mine').count()) + (await guest.locator('.st-status.is-mine').count()), { timeout: 20_000 }).toBe(1);
  const first = (await host.locator('.st-status.is-mine').count()) ? host : guest;
  const second = first === host ? guest : host;
  const cell = (page: Page, n: number) => page.locator(`[data-cell="${n}"]`);
  const place = async (page: Page, n: number) => {
    await cell(page, n).dispatchEvent('click');
    await expect(cell(page, n)).toHaveAttribute('aria-label', /일꾼/);
  };
  await place(first, 6);
  await place(first, 8);
  await expect(second.locator('.st-status.is-mine')).toBeVisible();
  await place(second, 16);
  await place(second, 18);
  await expect(first.locator('.st-status.is-mine')).toBeVisible();
  await cell(first, 6).dispatchEvent('click');
  await expect(cell(first, 1)).toHaveClass(/is-move/);
  await cell(first, 1).dispatchEvent('click');
  await expect(cell(first, 2)).toHaveClass(/is-build/);
  await cell(first, 2).dispatchEvent('click');
  await expect(cell(second, 2)).toHaveAttribute('aria-label', /1층/);
  await expect(second.locator('.st-status.is-mine')).toBeVisible();
});
