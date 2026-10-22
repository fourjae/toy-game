import { expect, test, type Page } from '@playwright/test';
import { closeExtraPagesAfterEach } from './cleanup';

closeExtraPagesAfterEach(test);

async function enter(page: Page, name: string, path: string) {
  await page.goto(path);
  await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
  await page.getByRole('button', { name: '시장 들어가기' }).click();
}

test('자이푸르: 시장의 낙타를 모두 데려오고 차례가 넘어간다', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await enter(host, '민수', '/jaipur');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, '지수', `/jaipur?room=${code}`);
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '장사 시작' }).click();
  await expect(host.locator('.jp-slot')).toHaveCount(5);
  await expect(host.locator('.jp-stall')).toHaveCount(2);
  await expect(host.locator('.jp-stall.is-mine')).toContainText('아직 판 물건이 없어요');
  await expect.poll(async () => (await host.locator('.jp-action.is-mine').count()) + (await guest.locator('.jp-action.is-mine').count())).toBe(1);
  const mover = (await host.locator('.jp-action.is-mine').count()) ? host : guest;
  const other = mover === host ? guest : host;
  const herdBefore = Number((await mover.locator('.jp-herd span').first().innerText()).replace(/\D/gu, ''));
  await mover.getByRole('button', { name: /낙타 \d마리 모두/u }).click();
  await expect(other.locator('.jp-action.is-mine')).toBeVisible();
  await expect(mover.locator('.jp-herd span').first()).not.toHaveText(`낙타 ${herdBefore}`);
  await expect(mover.locator('.jp-slot')).toHaveCount(5);
});
