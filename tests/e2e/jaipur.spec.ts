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

test('자이푸르: 한 라운드를 끝까지 하면 결산창에 점수와 인장이 나온다', async ({ browser }) => {
  test.setTimeout(180_000);
  // 움직임 줄이기: 카드·결산 숫자 연출을 건너뛰어 한 라운드를 빨리 끝낸다.
  const host = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  const guest = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await enter(host, '민수', '/jaipur');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, '지수', `/jaipur?room=${code}`);
  await host.getByRole('button', { name: '장사 시작' }).click();
  await expect(host.locator('.jp-slot')).toHaveCount(5);
  const ended = async () => (await host.locator('.jp-result').count()) > 0;
  for (let i = 0; i < 200 && !(await ended()); i++) {
    await expect.poll(async () => (await host.locator('.jp-action.is-mine').count()) + (await guest.locator('.jp-action.is-mine').count()) + (await host.locator('.jp-result').count())).toBeGreaterThan(0);
    if (await ended()) break;
    const mover = (await host.locator('.jp-action.is-mine').count()) ? host : guest;
    const camels = mover.getByRole('button', { name: /낙타 \d+마리 모두/u });
    const hand = (await mover.locator('.jp-hand-card').evaluateAll(els => els.map(el => el.getAttribute('aria-label') ?? '')))
      .map(label => label.replace('손패 ', ''));
    if (await camels.count()) {
      // 시장에 낙타가 있으면 모두 데려온다 (더미가 빨리 줄어든다).
      await camels.click();
    } else if (hand.length < 7) {
      await mover.locator('.jp-slot').first().click();
      await mover.locator('.jp-buttons .duel-button.primary').click();
    } else {
      // 손이 가득 차면 가장 많은 종류를 판다. 7장이면 귀한 물건도 2장 이상인 종류가 반드시 있다.
      const counts = new Map<string, number>();
      for (const kind of hand) counts.set(kind, (counts.get(kind) ?? 0) + 1);
      const kind = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      const cards = mover.getByRole('button', { name: `손패 ${kind}`, exact: true });
      for (let c = 0; c < counts.get(kind)!; c++) await cards.nth(c).click();
      await mover.locator('.jp-buttons .duel-button.primary').click();
    }
    await expect.poll(async () => (await mover.locator('.jp-action.is-mine').count()) === 0 || (await mover.locator('.jp-result').count()) > 0).toBe(true);
  }
  for (const page of [host, guest]) {
    await expect(page.locator('.jp-result')).toBeVisible();
    await expect(page.locator('.jp-result-table tbody tr')).toHaveCount(5);
    await expect(page.getByRole('button', { name: '2라운드 시작' })).toBeVisible();
  }
});
