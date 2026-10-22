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

test('산토리니: 탑을 쌓아 3층에 오르면 두 사람 모두 결과창과 기록표를 본다', async ({ browser }) => {
  // 두 창이 three.js 장면을 소프트웨어 렌더링(GPU 없음)으로 그려서 이 환경에선 한 판에 2분 가까이 걸린다.
  test.setTimeout(240_000);
  const host = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  const guest = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  for (const page of [host, guest]) page.setDefaultTimeout(10_000);
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

  // 먼저 둔 쪽은 맨 윗줄 왼쪽 두 칸을 번갈아 오르내리며 탑을 올리고, 상대는 아랫줄에서 비켜 둔다.
  const climb: [number, number, number, string][] = [[6, 1, 0, '1층'], [1, 0, 1, '1층'], [0, 1, 0, '2층'], [1, 0, 1, '2층'], [0, 1, 0, '3층']];
  const idle: [number, number, number, string][] = [[16, 15, 20, '1층'], [15, 16, 21, '1층'], [16, 15, 20, '2층'], [15, 16, 21, '2층'], [16, 15, 20, '3층']];
  for (let i = 0; i < climb.length; i++) {
    await turn(first, ...climb[i]);
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

  // 결과창을 닫아도 '결과 다시 보기'로 다시 열 수 있다.
  await winDialog.getByRole('button', { name: /닫기/ }).first().click();
  await first.getByRole('button', { name: '결과 다시 보기' }).click();
  await expect(winDialog).toBeVisible();
});
