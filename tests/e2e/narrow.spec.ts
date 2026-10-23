import { expect, test } from '@playwright/test';

// 320px 폭 폰(작은 안드로이드, 1세대 SE)에서도 첫 화면의 이름 입력 버튼과 대기실 머리줄이 화면 안에 들어와야 한다.
// 예전엔 첫 화면 그림 칸이 1fr 격자를 밀어내 '입장' 버튼이 오른쪽으로 잘렸다.
test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });

const GAMES = ['/toy-battle', '/lost-cities', '/hanamikoji', '/santorini', '/squadro', '/jaipur'];

for (const path of GAMES) {
  test(`좁은 폰 ${path}: 이름 입력 버튼과 대기실 머리줄이 화면 안에 있다`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '폭을 직접 정하므로 한 번만 돌린다');
    await page.goto(path);
    const input = page.getByLabel('어떤 이름으로 불러드릴까요?');
    await input.fill('가나다라마바');
    const submit = page.locator('form button[type="submit"]').first();
    await expect(submit).toBeVisible();
    const box = await submit.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await submit.click();
    await expect(page.getByRole('heading', { name: /반가워요/ })).toBeVisible();
    // 머리줄 게임 이름이 한 줄(세로로 쪼개지지 않음)이고, 방 만들기 버튼도 화면 안.
    const brand = page.locator('header [class$="brand"], header .brand').first();
    expect((await brand.boundingBox())!.height).toBeLessThan(60);
    const create = page.getByRole('button', { name: '방 만들기' }).first();
    const cb = await create.boundingBox();
    expect(cb!.x + cb!.width).toBeLessThanOrEqual(320);
  });
}

// 방 안 화면도 320px에 들어와야 한다. 예전엔 하나미코지 판 격자 열이 내용 폭(394px)만큼 늘어나
// 일곱째 게이샤와 '경쟁' 토큰이 잘렸고, 자이푸르 시장 다섯째 카드가 오른쪽으로 삐져나갔다.
// [카드, 그 카드가 들어 있어야 하는 틀] — 틀은 화면 안, 카드는 틀 안.
const ROOMS: [string, string, [string, string][]][] = [
  ['/hanamikoji', '꽃길 걷기 시작', [['.hm-geisha', '.hm-board'], ['.hm-tokens.is-mine .hm-token', '.hm-strip.is-mine'], ['.hm-hand-card', '.hm-hand']]],
  ['/jaipur', '장사 시작', [['.jp-slot', '.jp-market'], ['.jp-deck', '.jp-market'], ['.jp-hand-card', '.jp-hand']]],
];

for (const [path, start, selectors] of ROOMS) {
  test(`좁은 폰 ${path}: 게임 판이 화면 안에 들어온다`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '폭을 직접 정하므로 한 번만 돌린다');
    const opts = { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' as const };
    const host = await (await browser.newContext(opts)).newPage();
    const guest = await (await browser.newContext(opts)).newPage();
    const enter = async (page: typeof host, url: string, name: string) => {
      await page.goto(url);
      await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
      await page.locator('form button[type="submit"]').first().click();
    };
    await enter(host, path, '가나다라마바');
    await host.getByRole('button', { name: '방 만들기' }).first().click();
    await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
    const code = (await host.locator('.duel-invite strong').innerText()).trim();
    await enter(guest, `${path}?room=${code}`, '하나둘셋넷');
    await host.getByRole('button', { name: start }).click();
    for (const page of [host, guest]) {
      for (const [sel, frame] of selectors) {
        await expect(page.locator(sel).first()).toBeVisible();
        const box = (await page.locator(frame).first().boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(320);
        const rights = await page.locator(sel).evaluateAll(els => els.map(el => el.getBoundingClientRect().right));
        expect(Math.max(...rights), `${sel}가 ${frame} 밖으로 나감`).toBeLessThanOrEqual(box.x + box.width);
      }
    }
    await host.context().close();
    await guest.context().close();
  });
}

// 로스트 시티 방 안: 예전엔 머리줄 이름이 '하…' 한 글자로 잘리고 '아틀란티스' 이름표가 두 줄로 꺾였다.
test('좁은 폰 /lost-cities: 머리줄 이름이 읽히고 유적지 이름표가 한 줄이다', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '폭을 직접 정하므로 한 번만 돌린다');
  const opts = { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' as const };
  const host = await (await browser.newContext(opts)).newPage();
  const guest = await (await browser.newContext(opts)).newPage();
  const enter = async (page: typeof host, url: string, name: string) => {
    await page.goto(url);
    await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
    await page.locator('form button[type="submit"]').first().click();
  };
  await enter(host, '/lost-cities', '가나다라마바');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.lc-invite strong').innerText()).trim();
  await enter(guest, `/lost-cities?room=${code}`, '하나둘셋넷');
  await host.getByRole('button', { name: '탐험 시작' }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('.lc-hand-card')).toHaveCount(8);
    // 이름 칸이 세 글자 이상 들어갈 폭(약 30px)은 있어야 한다.
    const widths = await page.locator('.lc-player strong').evaluateAll(els => els.map(el => el.getBoundingClientRect().width));
    for (const w of widths) expect(w).toBeGreaterThan(30);
    // 내 이름(여섯 글자)도 '가나다…'로 잘리지 않는다 — 기록 단추를 차례 안내 줄로 옮겼다.
    const cut = await page.locator('.lc-player.is-me strong').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(cut).toBeLessThanOrEqual(1);
    const heights = await page.locator('.lc-pile-label').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
    for (const h of heights) expect(h).toBeLessThanOrEqual(18);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await page.getByRole('button', { name: '지난 차례 기록' }).click();
    await expect(page.getByRole('dialog', { name: '지난 차례' })).toBeVisible();
    await page.keyboard.press('Escape');
  }
  await host.context().close();
  await guest.context().close();
});

// 토이 배틀 방 안: 예전엔 가로로 늘어선 확대 단추 묶음이 판 오른쪽 아래를 가렸다. 이제 판 칸과 겹치지 않는다.
test('좁은 폰 /toy-battle: 확대 단추가 판의 칸을 가리지 않는다', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '폭을 직접 정하므로 한 번만 돌린다');
  const opts = { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' as const };
  const host = await (await browser.newContext(opts)).newPage();
  const guest = await (await browser.newContext(opts)).newPage();
  const enter = async (page: typeof host, name: string) => {
    await page.goto('/toy-battle');
    await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
    await page.getByRole('button', { name: '놀러 가기' }).click();
  };
  await enter(host, '가나다라마바');
  await enter(guest, '하나둘셋넷');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.invite-box strong').innerText()).trim();
  await guest.getByRole('button', { name: '코드로 입장' }).click();
  await guest.getByLabel('초대 코드').fill(code);
  await guest.getByRole('button', { name: '방 들어가기' }).click();
  await host.getByRole('button', { name: '게임 시작' }).click();
  for (const page of [host, guest]) {
    await expect(page.locator('.board-controls')).toBeVisible();
    await expect(page.locator('.board-base').first()).toBeVisible();
    const hits = await page.evaluate(() => {
      const c = document.querySelector('.board-controls')!.getBoundingClientRect();
      return [...document.querySelectorAll('.board-base')].filter(node => {
        const r = node.getBoundingClientRect();
        return r.right > c.left && r.left < c.right && r.bottom > c.top && r.top < c.bottom;
      }).length;
    });
    expect(hits).toBe(0);
  }
  await host.context().close();
  await guest.context().close();
});

// 가로로 눕힌 폰(640×320): 예전엔 세로용 배치 그대로라 스쿼드로 호수는 100px 남짓, 산토리니 평면 판은 60px까지 줄었다.
// 토이 배틀은 손패 독이 화면을 덮어 판이 안 보였다 → 로스트 시티·하나미코지처럼 세로로 돌리라는 안내.
const LANDSCAPE = { viewport: { width: 640, height: 320 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' as const };
const BOARDS: [string, string, string, number][] = [
  ['/squadro', '출발 신호', '.sq-board', 260],
  ['/santorini', '섬에서 시작', '.st-grid-fallback', 180],
];

for (const [path, start, board, min] of BOARDS) {
  test(`가로 폰 ${path}: 판이 화면 높이를 넉넉히 쓴다`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '크기를 직접 정하므로 한 번만 돌린다');
    const host = await (await browser.newContext(LANDSCAPE)).newPage();
    const guest = await (await browser.newContext(LANDSCAPE)).newPage();
    for (const page of [host, guest]) await page.addInitScript(() => window.localStorage.setItem('santorini.flat', '1'));
    const enter = async (page: typeof host, url: string, name: string) => {
      await page.goto(url);
      await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
      await page.locator('form button[type="submit"]').first().click();
    };
    await enter(host, path, '가나다라마바');
    await host.getByRole('button', { name: '방 만들기' }).first().click();
    await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
    const code = (await host.locator('.duel-invite strong').innerText()).trim();
    await enter(guest, `${path}?room=${code}`, '하나둘셋넷');
    await host.getByRole('button', { name: start }).click();
    for (const page of [host, guest]) {
      await expect(page.locator(board)).toBeVisible();
      const box = (await page.locator(board).boundingBox())!;
      expect(box.height, `${board} 높이`).toBeGreaterThanOrEqual(min);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(320);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(640);
    }
    await host.context().close();
    await guest.context().close();
  });
}

test('가로 폰 /toy-battle: 세로로 돌리라는 안내가 뜨고, 이대로 할게요로 닫힌다', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '크기를 직접 정하므로 한 번만 돌린다');
  const host = await (await browser.newContext(LANDSCAPE)).newPage();
  const guest = await (await browser.newContext(LANDSCAPE)).newPage();
  const enter = async (page: typeof host, name: string) => {
    await page.goto('/toy-battle');
    await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
    await page.getByRole('button', { name: '놀러 가기' }).click();
  };
  await enter(host, '가나다라마바');
  await enter(guest, '하나둘셋넷');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.invite-box strong').innerText()).trim();
  await guest.getByRole('button', { name: '코드로 입장' }).click();
  await guest.getByLabel('초대 코드').fill(code);
  await guest.getByRole('button', { name: '방 들어가기' }).click();
  await host.getByRole('button', { name: '게임 시작' }).click();
  const hint = host.locator('.game-rotate');
  await expect(hint.getByText('폰을 세로로 돌려 주세요')).toBeVisible();
  await hint.getByRole('button', { name: '이대로 할게요' }).click();
  await expect(hint).toBeHidden();
  await expect(host.locator('.board-shell').first()).toBeVisible();
  // 세로로 세우면(같은 창 크기를 돌림) 안내가 나오지 않는다.
  await guest.setViewportSize({ width: 320, height: 640 });
  await expect(guest.locator('.game-rotate')).toBeHidden();
  await host.context().close();
  await guest.context().close();
});
