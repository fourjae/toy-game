import { expect, test, type Page } from '@playwright/test';
import { closeExtraPagesAfterEach } from './cleanup';

closeExtraPagesAfterEach(test);

const COLUMNS = 'ABCDEFGHIJKLMNO';
const cell = (page: Page, x: number, y: number) => page.getByRole('button', { name: new RegExp(`^${COLUMNS[x]}${y + 1}, `) });

async function enter(page: Page, name: string, path: string) {
  await page.goto(path);
  await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
  await page.getByRole('button', { name: '사랑방으로 가기' }).click();
}

/** Host opens a room (optionally with the forbidden-point rule), the guest joins by code, host starts. */
async function startRoom(host: Page, guest: Page, renju: boolean) {
  await enter(host, '민수', '/omok');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  const dialog = host.getByRole('dialog');
  if (renju) await dialog.getByRole('button', { name: '금수 있음' }).click();
  await dialog.getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, '지수', `/omok?room=${code}`);
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '대국 시작' }).click();
  await expect(host.locator('.om-board')).toBeVisible();
  await expect(guest.locator('.om-board')).toBeVisible();
}

/** Which of the two pages has the move; waits for exactly one. */
async function mover(host: Page, guest: Page) {
  await expect.poll(async () => (await host.locator('.om-status.is-mine').count()) + (await guest.locator('.om-status.is-mine').count())).toBe(1);
  return (await host.locator('.om-status.is-mine').count()) ? { mine: host, other: guest } : { mine: guest, other: host };
}

/** Two taps: the first shows the faint stone, the second puts it down. Waits until the turn has passed. */
async function play(mine: Page, other: Page, x: number, y: number) {
  const count = Number.parseInt(await mine.locator('.om-turn').innerText(), 10);
  await cell(mine, x, y).click();
  await expect(mine.locator('.om-stone.ghost')).toHaveCount(1);
  await cell(mine, x, y).click();
  await expect.poll(async () => Number.parseInt(await mine.locator('.om-turn').innerText(), 10)).toBe(count + 1);
  await expect(other.locator('.om-turn')).toContainText(String(count + 1));
}

test('오목: 한 번 눌러 미리 보고 한 번 더 눌러 두면 차례가 넘어간다', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await startRoom(host, guest, false);
  const { mine, other } = await mover(host, guest);
  await expect(mine.locator('.om-board')).toHaveAttribute('role', 'group');
  // 누른 자리에 연한 돌만 놓이고, 취소하면 사라진다.
  await cell(mine, 7, 7).click();
  await expect(mine.locator('.om-stone.ghost')).toHaveCount(1);
  await mine.getByRole('button', { name: '선택 취소' }).click();
  await expect(mine.locator('.om-stone.ghost')).toHaveCount(0);
  // '여기에 두기' 버튼으로도 둘 수 있다.
  await cell(mine, 7, 7).click();
  await mine.getByRole('button', { name: '여기에 두기' }).click();
  await expect(other.locator('.om-status.is-mine')).toBeVisible();
  await expect(other.locator('.om-stone.black.is-last')).toHaveCount(1);
  await expect(cell(other, 7, 7)).toHaveAttribute('aria-label', 'H8, 흑돌');
  // 상대 차례에 눌러도 아무 일이 없다.
  await cell(mine, 8, 8).click();
  await expect(mine.locator('.om-stone.ghost')).toHaveCount(0);
});

test('오목: 금수가 켜진 방에서는 흑에게만 빨간 ×가 보이고 그 자리에는 둘 수 없다', async ({ browser }) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await startRoom(host, guest, true);
  await expect(host.locator('.om-rule-chip')).toBeVisible();
  // 흑이 열린 3 두 개가 H8에서 만나도록 놓고, 백은 맨 윗줄에 흩어 둔다.
  const black = [[5, 7], [6, 7], [7, 5], [7, 6]] as const;
  const white = [[0, 0], [2, 0], [4, 0], [6, 0]] as const;
  for (let i = 0; i < 4; i++) {
    const [bx, by] = black[i]!;
    const [wx, wy] = white[i]!;
    const a = await mover(host, guest);
    await play(a.mine, a.other, bx, by);
    const b = await mover(host, guest);
    await play(b.mine, b.other, wx, wy);
  }
  const { mine: blackPage, other: whitePage } = await mover(host, guest);
  await expect(blackPage.locator('.om-x')).not.toHaveCount(0);
  await expect(whitePage.locator('.om-x')).toHaveCount(0);
  const forbidden = cell(blackPage, 7, 7);
  await expect(forbidden).toHaveAttribute('aria-label', /금수 3-3/);
  await forbidden.click();
  await expect(blackPage.locator('.om-stone.ghost')).toHaveCount(0);
  await expect(blackPage.getByText(/금수 자리예요/)).toBeVisible();
});

test('오목: 끝까지 두면 다섯 알이 빛나고 결과창이 뜬다', async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  const guest = await (await browser.newContext({ reducedMotion: 'reduce' })).newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await startRoom(host, guest, false);
  let winner: Page | null = null;
  for (let i = 0; i < 5; i++) {
    const a = await mover(host, guest);
    if (i === 0) winner = a.mine;
    if (i < 4) await play(a.mine, a.other, 3 + i, 7);
    else {
      await cell(a.mine, 3 + i, 7).click();
      await cell(a.mine, 3 + i, 7).click();
    }
    if (i < 4) {
      const b = await mover(host, guest);
      await play(b.mine, b.other, i * 2, 0);
    }
  }
  for (const page of [host, guest]) {
    await expect(page.locator('.om-result')).toBeVisible();
    await expect(page.locator('.om-stone.is-win')).toHaveCount(5);
  }
  await expect(winner!.getByRole('dialog')).toContainText('오목 완성!');
  const loser = winner === host ? guest : host;
  await expect(loser.getByRole('dialog')).toContainText('아깝게 졌어요');
  await expect(winner!.locator('.om-result')).toContainText('9');
});
