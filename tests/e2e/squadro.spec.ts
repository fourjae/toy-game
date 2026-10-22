import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page, name: string, path: string) {
  await page.goto(path);
  await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
  await page.getByRole('button', { name: '호숫가로 가기' }).click();
}

test('스쿼드로: 배를 골라 두 번 눌러 출발시키고 차례가 넘어간다', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await enter(host, '민수', '/squadro');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, '지수', `/squadro?room=${code}`);
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '출발 신호' }).click();
  await expect(host.locator('.sq-piece.is-mine')).toHaveCount(5);
  await expect.poll(async () => (await host.locator('.sq-status.is-mine').count()) + (await guest.locator('.sq-status.is-mine').count())).toBe(1);
  const mover = (await host.locator('.sq-status.is-mine').count()) ? host : guest;
  const other = mover === host ? guest : host;
  const boat = mover.locator('.sq-piece.is-movable').nth(1);
  await boat.click();
  await expect(mover.locator('.sq-ghost')).toHaveCount(1);
  await boat.click();
  await expect(other.locator('.sq-status.is-mine')).toBeVisible();
  await expect(mover.locator('.sq-turn')).toContainText('2');
});
