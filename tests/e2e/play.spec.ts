import { expect, test, type Page } from '@playwright/test';

async function enter(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
  await page.getByRole('button', { name: '놀러 가기' }).click();
  await expect(page.getByRole('heading', { name: `반가워요, ${name}님.` })).toBeVisible();
}

// 브라우저 컨텍스트가 다르면 sessionStorage도 다르므로, 두 페이지가 서로 다른 플레이어가 된다.
test('두 사람이 방을 만들고 들어와 첫 수를 둔다', async ({ browser }, testInfo) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  await enter(host, '민수');
  await enter(guest, '지수');

  await host.getByRole('button', { name: '방 만들기' }).first().click();
  const createDialog = host.getByRole('dialog');
  await createDialog.getByLabel('방 이름').fill('테스트 한 판');
  await createDialog.getByRole('button', { name: '방 만들기' }).click();
  await expect(host.getByRole('heading', { name: '테스트 한 판' })).toBeVisible();
  const code = (await host.locator('.invite-box strong').innerText()).trim();
  expect(code).toMatch(/^[A-F0-9]{6}$/u);

  await guest.getByRole('button', { name: '코드로 입장' }).click();
  await guest.getByLabel('초대 코드').fill(code);
  await guest.getByRole('button', { name: '방 들어가기' }).click();
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await expect(host.getByRole('button', { name: '게임 시작' })).toBeEnabled();
  await expect(guest.getByRole('button', { name: '방장이 시작하기를 기다리는 중' })).toBeDisabled();

  await host.getByRole('button', { name: '게임 시작' }).click();
  await expect(host.locator('.turn-bar:visible')).toBeVisible();
  await expect(guest.locator('.turn-bar:visible')).toBeVisible();

  // 선공은 무작위. 내 차례인 쪽이 손패를 골라 빛나는 거점에 놓으면 상대 화면에도 보여야 한다.
  const hostFirst = (await host.locator('.turn-bar:visible').innerText()).includes('내 차례');
  const mover = hostFirst ? host : guest;
  const watcher = hostFirst ? guest : host;
  await expect(watcher.locator('.turn-bar:visible')).toContainText('상대 차례');
  await expect(mover.locator('.troop-card')).toHaveCount(3);
  await expect(watcher.locator('.troop-card')).toHaveCount(4);

  await mover.getByRole('button', { name: '게임판 전체 보기' }).click();
  await mover.locator('.troop-card').first().click();
  // 첫 수는 본부 옆 두 관문에 놓을 수 있고, 코코 선장이라면 어느 거점이든 가능하다.
  const legal = mover.locator('.board-base.is-legal');
  await expect(legal.first()).toBeVisible();
  expect(await legal.count()).toBeGreaterThanOrEqual(2);
  await mover.screenshot({ path: testInfo.outputPath('before-move.png') });
  await legal.first().click();

  await expect(watcher.locator('.game-log')).toContainText('놓았습니다');
  await expect(watcher.locator('.board-base.is-occupied')).toHaveCount(1);
  await expect(mover.locator('.board-base.is-occupied')).toHaveCount(1);
  await watcher.screenshot({ path: testInfo.outputPath('after-move.png') });
});
test('방장이 대기실에서 지정 맵으로 바꾸고 양쪽에 같은 전장을 보여 준다', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  await enter(host, '전장왕');
  await enter(guest, '탐험가');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').locator('.map-picker select').selectOption('random');
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.invite-box strong').innerText()).trim();
  await guest.getByRole('button', { name: '코드로 입장' }).click();
  await guest.getByLabel('초대 코드').fill(code);
  await guest.getByRole('button', { name: '방 들어가기' }).click();
  await expect(guest.locator('.map-picker select')).toBeDisabled();
  await host.locator('.waiting-panel .map-picker select').selectOption('cursed-cemetery');
  await expect(guest.locator('.waiting-panel .map-picker select')).toHaveValue('cursed-cemetery');
  await host.getByRole('button', { name: '게임 시작' }).click();
  await expect(host.locator('.board-heading')).toContainText('저주받은 묘지');
  await expect(guest.locator('.board-heading')).toContainText('저주받은 묘지');
  await expect(host.locator('.board-theme--cemetery')).toBeVisible();
});
