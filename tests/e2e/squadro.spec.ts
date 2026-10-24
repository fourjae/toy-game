import { expect, test, type Page } from '@playwright/test';
import { closeExtraPagesAfterEach } from './cleanup';
import { expectButtonsFitLandscape } from './fit';

closeExtraPagesAfterEach(test);

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

test('스쿼드로: 끝까지 두면 결과창에 귀환한 배와 되돌려 보낸 배가 나온다', async ({ browser }) => {
  test.setTimeout(150_000);
  // 움직임 줄이기: 배 이동·결과창 숫자 연출을 건너뛰어 한 판을 빨리 끝낸다.
  const host = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  const guest = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await enter(host, '민수', '/squadro');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, '지수', `/squadro?room=${code}`);
  await host.getByRole('button', { name: '출발 신호' }).click();
  await expect(host.locator('.sq-piece.is-mine')).toHaveCount(5);
  for (let i = 0; i < 300 && !(await host.locator('.sq-result').count()); i++) {
    await expect.poll(async () => (await host.locator('.sq-status.is-mine').count()) + (await guest.locator('.sq-status.is-mine').count()) + (await host.locator('.sq-result').count())).toBeGreaterThan(0);
    if (await host.locator('.sq-result').count()) break;
    const mover = (await host.locator('.sq-status.is-mine').count()) ? host : guest;
    const turn = await mover.locator('.sq-turn').innerText();
    // 차례마다 다른 배를 고르도록 돌아가며 누른다.
    const boats = mover.locator('.sq-piece.is-movable');
    const boat = boats.nth(i % (await boats.count()));
    await boat.click();
    await boat.click();
    await expect.poll(async () => (await mover.locator('.sq-turn').innerText()) !== turn || (await mover.locator('.sq-result').count()) > 0).toBe(true);
  }
  for (const page of [host, guest]) {
    await expect(page.locator('.sq-result')).toBeVisible();
    await expect(page.locator('.sq-result .duel-stats tbody tr')).toHaveCount(2);
    await expect(page.locator('.sq-result .duel-stats td.is-lead').first()).toBeVisible();
  }
  // 이긴 쪽 칸에는 귀환한 배 네 척이 모두 찬다.
  await expect(host.locator('.sq-result .is-lead .is-home')).toHaveCount(4);
  // 가로로 눕힌 폰 높이(640×320)에서도 두 단추가 스크롤 없이 보인다(예전엔 '한 판 더 하기'가 반쯤 잘렸다).
  await expectButtonsFitLandscape(host);
  await expectButtonsFitLandscape(guest);
  // 결과창을 닫아 판을 둘러본 뒤 '결과 다시 보기'로 다시 연다.
  await guest.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  await expect(guest.locator('.sq-result')).toHaveCount(0);
  await guest.getByRole('button', { name: '결과 다시 보기' }).click();
  await expect(guest.locator('.sq-result .duel-stats tbody tr')).toHaveCount(2);  // 상대가 한 판 더를 누르면 알림 한 줄이 더 붙어도 가로 폰에서 두 단추가 첫 화면에 있다.
  await guest.getByRole('button', { name: '한 판 더 하기' }).click();
  await expect(host.locator('.duel-ready-hint')).toBeVisible();
  await expectButtonsFitLandscape(host, /좋아요, 한 판 더/u);
});
