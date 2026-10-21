import { expect, test, type Browser, type Page } from '@playwright/test';

// 초대 링크로 들어오면 대기실을 건너뛰고 곧장 방으로 들어간다.
async function enter(page: Page, name: string, path = '/lost-cities') {
  await page.goto(path);
  await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
  await page.getByRole('button', { name: '떠나 보기' }).click();
  await expect(path.includes('room=') ? page.getByText('오늘의 탐험가') : page.getByRole('heading', { name: `반가워요, ${name}님.` })).toBeVisible();
}

async function startGame(browser: Browser, rounds: '1판 승부' | '3라운드 합산' = '1판 승부') {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  await enter(host, '민수');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: rounds }).click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  await expect(host.getByText('오늘의 탐험가')).toBeVisible();
  const code = (await host.locator('.lc-invite strong').innerText()).trim();
  expect(code).toMatch(/^[A-F0-9]{6}$/u);
  await enter(guest, '지수', `/lost-cities?room=${code}`);
  await expect(guest.getByText('둘 다 모였네요')).toBeVisible();
  await host.getByRole('button', { name: '탐험 시작' }).click();
  await expect(host.locator('.lc-hand-card')).toHaveCount(8);
  await expect(guest.locator('.lc-hand-card')).toHaveCount(8);
  return { host, guest };
}

const isMine = (page: Page) => page.locator('.lc-status.is-mine').count().then(n => n > 0);

/** 내 차례인 쪽을 돌려준다. */
async function whoseTurn(host: Page, guest: Page) {
  await expect.poll(async () => (await isMine(host)) || (await isMine(guest))).toBe(true);
  return (await isMine(host)) ? { mover: host, watcher: guest } : { mover: guest, watcher: host };
}

async function playCard(page: Page) {
  const live = page.locator('.lc-hand-card:not(.is-dead)');
  if (await live.count()) {
    await live.first().click();
    await page.locator('.lc-half.is-target').first().click();
  } else {
    await page.locator('.lc-hand-card').first().click();
    await page.locator('.lc-pile.is-discard-target').click();
  }
}

async function takeTurn(page: Page) {
  if (!(await isMine(page))) return;
  // 상대 화면이 아직 갱신 전이라 뽑기 단계가 남아 있을 수도 있다.
  if (!(await page.locator('.lc-deck.is-draw-target').count())) await playCard(page);
  await page.locator('.lc-deck.is-draw-target').click();
}

async function playRound(host: Page, guest: Page) {
  for (let i = 0; i < 160 && !(await host.locator('.lc-result').count()); i++) {
    await takeTurn(host);
    await takeTurn(guest);
    await host.waitForTimeout(30);
  }
  await expect(host.locator('.lc-result')).toBeVisible();
  await expect(guest.locator('.lc-result')).toBeVisible();
}

test('첫 화면의 3x3 선반에서 두 게임을 고를 수 있다', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hub-card')).toHaveCount(9);
  await expect(page.getByRole('button', { name: /토이 배틀/ })).toBeVisible();
  await page.getByRole('button', { name: /토이 배틀/ }).click();
  await expect(page).toHaveURL(/\/toy-battle$/u);
  await expect(page.getByRole('heading', { name: /한 판/u })).toBeVisible();
  await page.getByRole('button', { name: '게임 선택' }).click();
  await page.getByRole('button', { name: /로스트 시티/ }).click();
  await expect(page).toHaveURL(/\/lost-cities$/u);
  await expect(page.getByRole('heading', { name: /탐험 한 판/u })).toBeVisible();
});

test('예전 토이 배틀 초대 링크(/?room=)는 토이 배틀로 연결된다', async ({ page }) => {
  await page.goto('/?room=ABC123');
  await expect(page.getByRole('heading', { name: /한 판/u })).toBeVisible();
  await expect(page.getByText('초대받은 방 ABC123')).toBeVisible();
});

test('로스트 시티 규칙 창에 점수 계산과 예시가 있다', async ({ page }) => {
  await page.goto('/lost-cities');
  await page.getByRole('button', { name: '게임 방법' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('탐험을 시작하면 비용 20점');
  await expect(dialog).toContainText('악수 카드');
  await expect(dialog).toContainText('−8점');
  await expect(dialog).toContainText('60점');
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(dialog).toBeHidden();
});

test('로스트 시티: 방을 만들고 들어와 1판을 끝까지 둔다', async ({ browser }) => {
  // 한 판을 끝까지 두는 데 느린 환경에서는 1분 가까이 걸린다.
  test.setTimeout(120_000);
  const { host, guest } = await startGame(browser);
  await expect(host.locator('.lc-deck b')).toHaveText('44');
  await playRound(host, guest);
  await expect(host.locator('.lc-result-table tbody tr')).toHaveCount(6);
  await expect(host.getByRole('button', { name: '한 판 더 하기' })).toBeEnabled();
});

test('로스트 시티: 카드를 내면 날아가서 내 탐험에 놓이고, 상대 화면에도 보인다', async ({ browser }) => {
  const { host, guest } = await startGame(browser);
  const { mover, watcher } = await whoseTurn(host, guest);
  await expect(mover.locator('.lc-status')).toContainText('내 차례');
  await expect(watcher.locator('.lc-status')).toContainText('상대 차례');
  // 아직 아무것도 고르지 않았으면 놓을 곳이 표시되지 않는다.
  await expect(mover.locator('.lc-half.is-target')).toHaveCount(0);
  const live = mover.locator('.lc-hand-card:not(.is-dead)');
  const dead = mover.locator('.lc-hand-card.is-dead');
  expect(await live.count() + await dead.count()).toBe(8);
  await live.first().click();
  await expect(mover.locator('.lc-hand-card.selected')).toHaveCount(1);
  await expect(mover.locator('.lc-half.is-target')).toHaveCount(1);
  await expect(mover.locator('.lc-pile.is-discard-target')).toHaveCount(1);
  await mover.locator('.lc-half.is-target').click();
  // 날아가는 카드(유령 요소)가 잠깐 떠 있다가 사라진다.
  await expect(mover.locator('.lc-ghost').first()).toBeVisible();
  await expect(mover.locator('.lc-ghost')).toHaveCount(0);
  await expect(mover.locator('.lc-half--mine .lc-card--hand')).toHaveCount(1);
  await expect(mover.locator('.lc-hand-card')).toHaveCount(7);
  await expect(mover.locator('.lc-deck.is-draw-target')).toBeVisible();
  await mover.locator('.lc-deck.is-draw-target').click();
  await expect(mover.locator('.lc-hand-card')).toHaveCount(8);
  await expect(mover.locator('.lc-deck b')).toHaveText('43');
  // 상대는 내가 낸 카드를 위쪽(상대 기둥)에서 보고, 방금 낸 카드는 표시된다.
  await expect(watcher.locator('.lc-half--opp .lc-card--hand')).toHaveCount(1);
  await expect(watcher.locator('.lc-half--opp .lc-card--hand.is-recent')).toHaveCount(1);
  await expect(watcher.locator('.lc-status')).toContainText('내 차례');
});

test('로스트 시티: 카드를 버리고, 상대는 버린 더미에서 가져올 수 있지만 방금 버린 더미는 안 된다', async ({ browser }) => {
  const { host, guest } = await startGame(browser);
  const { mover, watcher } = await whoseTurn(host, guest);
  await mover.locator('.lc-hand-card').first().click();
  const site = await mover.locator('.lc-hand-card.selected .lc-card-name').innerText();
  await mover.locator('.lc-pile.is-discard-target').click();
  await expect(mover.locator('.lc-pile .lc-card--hand')).toHaveCount(1);
  // 버린 더미 맨 위 카드를 바로 도로 뽑는 건 막혀 있다: 뽑기 표시가 카드 더미에만 있다.
  await expect(mover.locator('.lc-pile.is-draw-target')).toHaveCount(0);
  await expect(mover.locator('.lc-deck.is-draw-target')).toBeVisible();
  await mover.locator('.lc-deck.is-draw-target').click();
  await expect(watcher.locator('.lc-status')).toContainText('내 차례');
  // 상대(이제 내 차례)는 같은 카드를 낸 뒤 그 더미에서 뽑을 수 있다. 낸 다음엔 버린 더미 맨 위 카드가 뽑기 대상이다.
  await playCard(watcher);
  const target = watcher.locator('.lc-pile.is-draw-target');
  await expect(target.first()).toBeVisible();
  const pileLabels = await target.evaluateAll(els => els.map(el => el.getAttribute('aria-label') ?? ''));
  expect(pileLabels.some(label => label.includes(site.trim()))).toBe(true);
  const handBefore = await watcher.locator('.lc-hand-card').count();
  await target.first().click();
  await expect(watcher.locator('.lc-hand-card')).toHaveCount(handBefore + 1);
  await expect(mover.locator('.lc-status')).toContainText('내 차례');
});

test('로스트 시티: 기둥을 누르면 양쪽 탐험과 버린 더미를 크게 볼 수 있다', async ({ browser }) => {
  const { host, guest } = await startGame(browser);
  const { mover } = await whoseTurn(host, guest);
  await mover.locator('.lc-hand-card').first().click();
  await mover.locator('.lc-pile.is-discard-target').click();
  await mover.locator('.lc-deck.is-draw-target').click();
  await expect(mover.locator('.lc-status')).toContainText('상대 차례');
  // 아무 카드도 고르지 않은 채 가운데 더미를 누르면 한눈에 보기가 열린다.
  await mover.locator('.lc-pile:has(.lc-card--hand)').click();
  const dialog = mover.getByRole('dialog');
  await expect(dialog).toContainText('한눈에 보기');
  await expect(dialog).toContainText('버린 더미');
  await expect(dialog.locator('.lc-inspect-row').last().locator('.lc-card--hand')).toHaveCount(1);
  await dialog.getByRole('button', { name: '닫기' }).click();
  await expect(dialog).toBeHidden();
});

test('로스트 시티: 3라운드는 라운드마다 둘 다 눌러야 넘어가고 합계가 이어진다', async ({ browser }) => {
  // 한 라운드를 끝까지 두는 데만 50초 넘게 걸려 기본 60초 제한에 자주 걸린다.
  test.setTimeout(150_000);
  const { host, guest } = await startGame(browser, '3라운드 합산');
  await expect(host.locator('.lc-round')).toContainText('1 / 3');
  await playRound(host, guest);
  await expect(host.getByRole('dialog')).toContainText('1라운드 끝');
  await expect(host.locator('.lc-result-table .match')).toBeVisible();
  await host.getByRole('button', { name: '2라운드 시작' }).click();
  await expect(host.getByRole('button', { name: '친구의 답을 기다리는 중' })).toBeDisabled();
  await expect(host.locator('.lc-result')).toBeVisible();
  await guest.getByRole('button', { name: '2라운드 시작' }).click();
  await expect(host.locator('.lc-round')).toContainText('2 / 3');
  await expect(host.locator('.lc-deck b')).toHaveText('44');
  await expect(host.locator('.lc-half--mine .lc-card--hand')).toHaveCount(0);
});

test('로스트 시티: 나가면 상대는 대기실로 돌아간다', async ({ browser }) => {
  const { host, guest } = await startGame(browser);
  await guest.getByRole('button', { name: '방 나가기' }).click();
  await guest.getByRole('dialog').getByRole('button', { name: '나가기' }).click();
  await expect(guest.getByRole('heading', { name: /반가워요/u })).toBeVisible();
  await expect(host.getByText('님이 나갔어요')).toBeVisible();
  await expect(host.getByRole('button', { name: '친구가 오면 시작할 수 있어요' })).toBeDisabled();
});

test('로스트 시티: 세로 화면에서도 손패 8장과 다섯 기둥이 화면 안에 들어온다', async ({ browser }) => {
  const host = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await enter(host, '민수');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.lc-invite strong').innerText()).trim();
  await enter(guest, '지수', `/lost-cities?room=${code}`);
  await host.getByRole('button', { name: '탐험 시작' }).click();
  await expect(host.locator('.lc-hand-card')).toHaveCount(8);
  const fits = await host.evaluate(() => {
    const view = { width: window.innerWidth, height: window.innerHeight };
    const inside = (el: Element) => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= view.width + 1 && r.top >= -1 && r.bottom <= view.height + 1; };
    return {
      hand: [...document.querySelectorAll('.lc-hand-card')].every(inside),
      columns: document.querySelectorAll('.lc-col').length,
      columnsInside: [...document.querySelectorAll('.lc-col')].every(inside),
      scrolls: document.documentElement.scrollWidth > view.width + 1 || document.documentElement.scrollHeight > view.height + 1,
    };
  });
  expect(fits).toEqual({ hand: true, columns: 5, columnsInside: true, scrolls: false });
  // 판은 가운데 줄에 버린 더미 다섯 개가 있고, 손패는 맨 아래에 있다.
  const order = await host.evaluate(() => {
    const y = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
    return { opp: y('.lc-half--opp'), pile: y('.lc-pile'), mine: y('.lc-half--mine'), hand: y('.lc-hand-card') };
  });
  expect(order.opp).toBeLessThan(order.pile);
  expect(order.pile).toBeLessThan(order.mine);
  expect(order.mine).toBeLessThan(order.hand);
  await expect(host.locator('.lc-rotate')).toBeHidden();
});

test('로스트 시티: 폰을 눕히면 세로로 돌려 달라고 안내하고, 그대로 해도 된다', async ({ browser }) => {
  const host = await browser.newPage({ viewport: { width: 844, height: 390 } });
  const guest = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await enter(host, '민수');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.lc-invite strong').innerText()).trim();
  await enter(guest, '지수', `/lost-cities?room=${code}`);
  await host.getByRole('button', { name: '탐험 시작' }).click();
  await expect(host.locator('.lc-rotate')).toBeVisible();
  await expect(host.locator('.lc-rotate')).toContainText('세로로 돌려');
  await host.getByRole('button', { name: '이대로 할게요' }).click();
  await expect(host.locator('.lc-rotate')).toBeHidden();
  await expect(host.locator('.lc-hand-card')).toHaveCount(8);
});
