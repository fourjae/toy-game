import { expect, test } from '@playwright/test';
import { closeExtraPagesAfterEach } from './cleanup';

closeExtraPagesAfterEach(test);

test('하나미코지: 방을 만들고 초대 링크로 들어와 선물 한 번을 주고받는다', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await host.goto('/hanamikoji');
  await host.getByLabel('어떤 이름으로 불러드릴까요?').fill('민수');
  await host.getByRole('button', { name: '찻집 들어가기' }).click();
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await guest.goto(`/hanamikoji?room=${code}`);
  await guest.getByLabel('어떤 이름으로 불러드릴까요?').fill('지수');
  await guest.getByRole('button', { name: '찻집 들어가기' }).click();
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '꽃길 걷기 시작' }).click();
  await expect(host.locator('.hm-geisha')).toHaveCount(7);
  await expect(guest.locator('.hm-geisha')).toHaveCount(7);
  const mover = (await host.locator('.hm-status.is-mine').count()) ? host : guest;
  const other = mover === host ? guest : host;
  await expect(mover.locator('.hm-hand-card')).toHaveCount(7);
  await mover.getByRole('button', { name: /^선물/ }).click();
  for (let i = 0; i < 3; i++) await mover.locator('.hm-hand-card').nth(i).click();
  await mover.locator('.hm-status-actions .duel-button').click();
  await expect(other.locator('.hm-offer.is-choosing')).toBeVisible();
  await other.locator('.hm-offer-option').first().click();
  await expect(other.locator('.hm-offer')).toHaveCount(0);
  await expect(other.locator('.hm-stack.is-mine .hm-card')).toHaveCount(1);
  await expect(mover.locator('.hm-stack.is-mine .hm-card')).toHaveCount(2);
  await expect(other.locator('.hm-status.is-mine')).toBeVisible();
});

test('하나미코지: 한 라운드를 끝까지 두면 결산창이 나오고, 라운드 사이 나가기는 한 번 더 묻는다', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  const guest = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  for (const page of [host, guest]) page.setDefaultTimeout(10_000);
  await host.goto('/hanamikoji');
  await host.getByLabel('어떤 이름으로 불러드릴까요?').fill('민수');
  await host.getByRole('button', { name: '찻집 들어가기' }).click();
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await guest.goto(`/hanamikoji?room=${code}`);
  await guest.getByLabel('어떤 이름으로 불러드릴까요?').fill('지수');
  await guest.getByRole('button', { name: '찻집 들어가기' }).click();
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '꽃길 걷기 시작' }).click();
  await expect(host.locator('.hm-geisha')).toHaveCount(7);

  // 두 사람이 번갈아 비밀 → 포기 → 선물 → 경쟁을 한 번씩 쓰면 라운드가 끝난다.
  const order = [['비밀', 1], ['포기', 2], ['선물', 3], ['경쟁', 4]] as const;
  for (let turn = 0; turn < 8; turn++) {
    await expect.poll(async () => (await host.locator('.hm-status.is-mine').count()) + (await guest.locator('.hm-status.is-mine').count())).toBeGreaterThan(0);
    const mover = (await host.locator('.hm-status.is-mine').count()) ? host : guest;
    const other = mover === host ? guest : host;
    const [name, cards] = order[Math.floor(turn / 2)]!;
    await mover.getByRole('button', { name: `${name} ${cards}장`, exact: true }).click();
    for (let i = 0; i < cards; i++) await mover.locator('.hm-hand-card').nth(i).click();
    await mover.locator('.hm-status-actions .duel-button').click();
    if (name === '선물' || name === '경쟁') {
      await expect(other.locator('.hm-offer.is-choosing')).toBeVisible();
      await other.locator('.hm-offer-option').first().click();
      await expect(other.locator('.hm-offer')).toHaveCount(0);
    }
    if (turn < 7) await expect(mover.locator('.hm-status.is-mine')).toHaveCount(0);
  }

  for (const page of [host, guest]) await expect(page.locator('.hm-result-geisha')).toHaveCount(7);
  // 결산창을 닫아 판을 들여다봐도 '결과 다시 보기'로 다시 연다.
  await guest.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
  await expect(guest.locator('.hm-result-geisha')).toHaveCount(0);
  await guest.getByRole('button', { name: '결과 다시 보기' }).click();
  await expect(guest.locator('.hm-result-geisha')).toHaveCount(7);
  const finished = await host.getByRole('button', { name: /한 판 더/ }).count();
  const leave = host.getByRole('button', { name: /대기실로 나가기|매치를 끝내고 나가기/ });
  if (!finished) {
    await expect(host.getByRole('button', { name: '2라운드 시작' })).toBeVisible();
    await leave.click();
    await expect(host.getByRole('button', { name: /매치를 끝내고 나가기/ })).toBeVisible();
    await expect(host.locator('.hm-result-geisha')).toHaveCount(7);
  }
  await leave.click();
  await expect(host.getByText('플레이어 대기실')).toBeVisible();
  await expect(guest.getByText('민수 님이 나갔어요')).toBeVisible();
});
