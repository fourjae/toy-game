import { expect, test, type Page } from '@playwright/test';
import { closeExtraPagesAfterEach } from './cleanup';
import { expectButtonsFitLandscape } from './fit';

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

test('산토리니: 탑을 쌓아 3층에 오르면 두 사람 모두 결과창과 기록표를 본다', async ({ browser }) => {
  // 3D 장면은 GPU 없는 환경에서 소프트웨어 렌더링이라 한 판에 2분 가까이 걸려서, 평면 보기로 둔다(규칙·결과창은 같다).
  test.setTimeout(90_000);
  const host = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  const guest = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  for (const page of [host, guest]) {
    page.setDefaultTimeout(10_000);
    await page.addInitScript(() => window.localStorage.setItem('santorini.flat', '1'));
  }
  await enter(host, '민수', '/santorini');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, '지수', `/santorini?room=${code}`);
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '섬에서 시작' }).click();
  await expect.poll(async () => (await host.locator('.st-status.is-mine').count()) + (await guest.locator('.st-status.is-mine').count()), { timeout: 20_000 }).toBe(1);
  const first = (await host.locator('.st-status.is-mine').count()) ? host : guest;
  const second = first === host ? guest : host;
  const cell = (page: Page, n: number) => page.locator(`[data-cell="${n}"]`);
  const click = async (page: Page, n: number, expected: RegExp) => {
    await cell(page, n).dispatchEvent('click');
    await expect(cell(page, n)).toHaveAttribute('aria-label', expected);
  };
  // 한 번의 차례: 일꾼 고르기 → 옮길 칸 → 지을 칸. 지은 칸의 층이 바뀌면 상대 차례로 넘어간다.
  const turn = async (page: Page, from: number, to: number, build: number, level: string) => {
    await expect(page.locator('.st-status.is-mine')).toBeVisible();
    await cell(page, from).dispatchEvent('click');
    await expect(cell(page, to)).toHaveClass(/is-move/);
    await cell(page, to).dispatchEvent('click');
    await expect(cell(page, build)).toHaveClass(/is-build/);
    await click(page, build, new RegExp(level));
  };
  await click(first, 6, /일꾼/);
  await click(first, 8, /일꾼/);
  await expect(second.locator('.st-status.is-mine')).toBeVisible();
  await click(second, 16, /일꾼/);
  await click(second, 18, /일꾼/);
  // 평면 판도 3D 카메라처럼 각자 자기 쪽이 아래로 오게 돈다: 먼저 둔 쪽과 나중 둔 쪽의 첫 칸이 서로 반대.
  const corners = [await first.locator('.st-grid-fallback button').first().getAttribute('data-cell'), await second.locator('.st-grid-fallback button').first().getAttribute('data-cell')];
  expect(corners.sort()).toEqual(['0', '24']);
  // 일꾼은 칸 위에 따로 얹혀 있다(옮길 때 미끄러지도록).
  for (const page of [first, second]) await expect(page.locator('.st-pawns .st-pawn')).toHaveCount(4);
  if (process.env.SHOT_DIR) for (const [i, page] of [first, second].entries()) await page.screenshot({ path: `${process.env.SHOT_DIR}/st-flat-${i}.png` });

  // 먼저 둔 쪽은 맨 윗줄 왼쪽 두 칸을 번갈아 오르내리며 탑을 올리고, 상대는 아랫줄에서 비켜 둔다.
  const climb: [number, number, number, string][] = [[6, 1, 0, '1층'], [1, 0, 1, '1층'], [0, 1, 0, '2층'], [1, 0, 1, '2층'], [0, 1, 0, '3층']];
  const idle: [number, number, number, string][] = [[16, 15, 20, '1층'], [15, 16, 21, '1층'], [16, 15, 20, '2층'], [15, 16, 21, '2층'], [16, 15, 20, '3층']];
  for (let i = 0; i < climb.length; i++) {
    await turn(first, ...climb[i]);
    // 방금 지은 칸은 맨 윗블록만 '떨어지는' 블록으로 표시된다(두 사람 화면 모두).
    if (i === 2) for (const page of [first, second]) {
      await expect(cell(page, 0).locator('.st-tier')).toHaveCount(2);
      await expect(cell(page, 0).locator('.st-tier.is-dropping')).toHaveClass(/t2/);
      await expect(page.locator('.st-tier.is-dropping')).toHaveCount(1);
    }
    await turn(second, ...idle[i]);
  }
  // 2층에서 3층으로 올라서면 바로 이긴다.
  await expect(first.locator('.st-status.is-mine')).toBeVisible();
  await cell(first, 1).dispatchEvent('click');
  await expect(cell(first, 0)).toHaveClass(/is-move/);
  await cell(first, 0).dispatchEvent('click');

  const winDialog = first.getByRole('dialog', { name: '섬 꼭대기에 섰어요!' });
  const loseDialog = second.getByRole('dialog', { name: '아쉬운 한 판' });
  await expect(winDialog).toBeVisible();
  await expect(loseDialog).toBeVisible();
  for (const dialog of [winDialog, loseDialog]) {
    await expect(dialog.locator('.duel-trophy')).toBeVisible();
    await expect(dialog.locator('.duel-stats tbody tr')).toHaveCount(3);
  }
  // 기록표: 둘 다 블록 5개, 가장 높이 오른 층은 이긴 쪽 3층이 앞선다.
  const winnerRows = winDialog.locator('.duel-stats tbody tr');
  await expect(winnerRows.nth(0).locator('td')).toHaveText(['5', '5']);
  await expect(winnerRows.nth(2).locator('td')).toHaveText(['3', '0']);
  await expect(winnerRows.nth(2).locator('td').first()).toHaveClass(/is-lead/);
  await expect(loseDialog.locator('.duel-stats tbody tr').nth(2).locator('td').last()).toHaveClass(/is-lead/);

  // 가로로 눕힌 폰 높이(640×320)에서도 기록표 아래 두 단추가 스크롤 없이 보인다(예전엔 '한 판 더 하기'가 반쯤 잘렸다).
  await expectButtonsFitLandscape(first);
  await expectButtonsFitLandscape(second);
  await first.setViewportSize({ width: 1280, height: 720 });

  // 결과창을 닫아도 '결과 다시 보기'로 다시 열 수 있다.
  await winDialog.getByRole('button', { name: /닫기/ }).first().click();
  await first.getByRole('button', { name: '결과 다시 보기' }).click();
  await expect(winDialog).toBeVisible();
});

test('산토리니: 평면으로 보기로 바꾸면 3D 장면 대신 격자 판이 나오고, 다시 3D로 돌아간다', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  for (const page of [host, guest]) page.setDefaultTimeout(10_000);
  await enter(host, '민수', '/santorini');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, '지수', `/santorini?room=${code}`);
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '섬에서 시작' }).click();
  await expect(host.locator('.st-canvas canvas')).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: '평면으로 보기' }).click();
  await expect(host.locator('.st-canvas')).toHaveCount(0);
  await expect(host.locator('.st-grid-fallback button')).toHaveCount(25);
  await expect(host.locator('.st-grid-fallback button').first()).toBeVisible();
  // 고른 보기는 기기에 남아서 새로 열어도 평면이다.
  await host.reload();
  await expect(host.locator('.st-grid-fallback button')).toHaveCount(25, { timeout: 20_000 });
  await expect(host.locator('.st-canvas')).toHaveCount(0);
  await host.getByRole('button', { name: '3D로 보기' }).click();
  await expect(host.locator('.st-canvas canvas')).toBeVisible({ timeout: 20_000 });
});
