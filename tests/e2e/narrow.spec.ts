import { expect, test } from '@playwright/test';
import { expectButtonsFitLandscape } from './fit';

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

// 가로로 눕힌 폰(640×320): 예전엔 자이푸르 손패가 화면 밖에 있었고, 세로용 배치 그대로라 스쿼드로 호수는 100px 남짓, 산토리니 평면 판은 60px까지 줄었다.
// 토이 배틀은 손패 독이 화면을 덮어 판이 안 보였다 → 로스트 시티·하나미코지처럼 세로로 돌리라는 안내.
const LANDSCAPE = { viewport: { width: 640, height: 320 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' as const };
const BOARDS: [string, string, string, number][] = [
  ['/squadro', '출발 신호', '.sq-board', 260],
  ['/santorini', '섬에서 시작', '.st-grid-fallback', 180],
  // 자이푸르는 세로 배치 그대로면 손패가 화면 아래로 사라졌다 → 왼쪽 시장·손패, 오른쪽 기둥.
  ['/jaipur', '장사 시작', '.jp-hand', 70],
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

// 하나미코지를 가로 폰에서 '이대로 할게요'로 하면: 예전엔 게이샤 줄이 판을 다 차지해 양쪽에 놓인 카드 자리가 0px,
// 차례 안내가 게이샤 뒤로 숨었다 → 왼쪽 판, 오른쪽 손패 기둥. 선물 고르기 창도 화면 높이 안에 들어와야 한다.
test('가로 폰 /hanamikoji: 이대로 할게요 뒤에도 놓인 카드 자리와 손패, 선물 고르기가 화면 안에 있다', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '크기를 직접 정하므로 한 번만 돌린다');
  const host = await (await browser.newContext(LANDSCAPE)).newPage();
  const guest = await (await browser.newContext(LANDSCAPE)).newPage();
  const enter = async (page: typeof host, url: string, name: string) => {
    await page.goto(url);
    await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
    await page.locator('form button[type="submit"]').first().click();
  };
  await enter(host, '/hanamikoji', '가나다라마바');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, `/hanamikoji?room=${code}`, '하나둘셋넷');
  await host.getByRole('button', { name: '꽃길 걷기 시작' }).click();
  const inside = async (page: typeof host, selector: string) => {
    for (const box of await page.locator(selector).evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()))) {
      expect(box.top, `${selector} 위`).toBeGreaterThanOrEqual(0);
      expect(box.bottom, `${selector} 아래`).toBeLessThanOrEqual(320);
      expect(box.right, `${selector} 오른쪽`).toBeLessThanOrEqual(640);
    }
  };
  for (const page of [host, guest]) {
    const keep = page.getByRole('button', { name: '이대로 할게요' });
    await expect(keep).toBeVisible();
    await keep.click();
    await expect(page.locator('.hm-geisha')).toHaveCount(7);
    const stack = (await page.locator('.hm-stack.is-mine').first().boundingBox())!;
    expect(stack.height, '내 쪽 카드 자리 높이').toBeGreaterThanOrEqual(40);
    await inside(page, '.hm-status');
  }
  const mover = (await host.locator('.hm-status.is-mine').count()) ? host : guest;
  const other = mover === host ? guest : host;
  await expect(mover.locator('.hm-hand-card')).toHaveCount(7);
  await inside(mover, '.hm-hand-card');
  await mover.getByRole('button', { name: /^선물/ }).click();
  for (let i = 0; i < 3; i++) await mover.locator('.hm-hand-card').nth(i).click();
  await inside(mover, '.hm-status-actions .duel-button');
  await mover.locator('.hm-status-actions .duel-button').click();
  await expect(other.locator('.hm-offer.is-choosing')).toBeVisible();
  await inside(other, '.hm-offer-option');
  await other.locator('.hm-offer-option').first().click();
  await expect(other.locator('.hm-stack.is-mine .hm-card')).toHaveCount(1);
  // 나가기 창의 '계속 있을게요'가 밤거리용 어두운 칸 색을 그대로 써서 어두운 글자와 겹쳐 안 보였다.
  await host.getByRole('button', { name: '방 나가기' }).click();
  const stay = host.getByRole('dialog').getByRole('button', { name: '계속 있을게요' });
  const light = await stay.evaluate(el => {
    const lum = (c: string) => { const [r, g, b] = c.match(/[\d.]+/g)!.map(Number); return (0.299 * r! + 0.587 * g! + 0.114 * b!) / 255; };
    const st = getComputedStyle(el);
    return [lum(st.backgroundColor), lum(st.color)];
  });
  expect(Math.abs(light[0]! - light[1]!), '단추 바탕과 글자 밝기 차이').toBeGreaterThan(0.4);
  await host.context().close();
  await guest.context().close();
});

// 로스트 시티도 가로 폰에서 '이대로 할게요'를 누르면 손패 여덟 장이 양옆·아래로 잘리고 탐험로가 40px로 눌렸다.
test('가로 폰 /lost-cities: 이대로 할게요 뒤에도 손패 여덟 장과 탐험로가 화면 안에 있고, 한 수 둘 수 있다', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '크기를 직접 정하므로 한 번만 돌린다');
  const host = await (await browser.newContext(LANDSCAPE)).newPage();
  const guest = await (await browser.newContext(LANDSCAPE)).newPage();
  const enter = async (page: typeof host, url: string, name: string) => {
    await page.goto(url);
    await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
    await page.getByRole('button', { name: '떠나 보기' }).click();
  };
  await enter(host, '/lost-cities', '민수');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.lc-invite strong').innerText()).trim();
  await enter(guest, `/lost-cities?room=${code}`, '지수');
  await host.getByRole('button', { name: '탐험 시작' }).click();
  for (const page of [host, guest]) {
    await page.getByRole('button', { name: '이대로 할게요' }).click();
    await expect(page.locator('.lc-hand-card')).toHaveCount(8);
    for (const box of await page.locator('.lc-hand-card').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()))) {
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(640);
      expect(box.bottom).toBeLessThanOrEqual(320);
    }
    const half = (await page.locator('.lc-half').first().boundingBox())!;
    expect(half.height, '탐험로 반쪽 높이').toBeGreaterThanOrEqual(60);
  }
  await expect.poll(async () => (await host.locator('.lc-status.is-mine').count()) + (await guest.locator('.lc-status.is-mine').count())).toBeGreaterThan(0);
  const mover = (await host.locator('.lc-status.is-mine').count()) ? host : guest;
  const live = mover.locator('.lc-hand-card:not(.is-dead)');
  if (await live.count()) {
    await live.first().click();
    await mover.locator('.lc-half.is-target').first().click();
  } else {
    await mover.locator('.lc-hand-card').first().click();
    await mover.locator('.lc-pile.is-discard-target').click();
  }
  await mover.locator('.lc-deck.is-draw-target').click();
  await expect(mover.locator('.lc-status.is-mine')).toHaveCount(0);
  await host.context().close();
  await guest.context().close();
});

// 자이푸르 가로 폰: 판 토큰이 쌓이면 가판대가 두세 줄로 커져 오른쪽 기둥이 화면 높이를 넘었고,
// 격자 줄이 내용보다 작아지며 '내 차례' 칸이 이름줄 밑에 깔려 '낙타 모두' 단추가 눌리지 않았다(한 라운드 중반쯤).
// 한 라운드를 끝까지 두며 매 차례 두 칸이 겹치지 않는지, 결산창의 다음 라운드 단추에 닿는지 본다.
test('가로 폰 /jaipur: 한 라운드 내내 차례 칸과 이름줄이 겹치지 않고, 결산창 단추에 닿는다', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '크기를 직접 정하므로 한 번만 돌린다');
  test.setTimeout(180_000);
  const host = await (await browser.newContext(LANDSCAPE)).newPage();
  const guest = await (await browser.newContext(LANDSCAPE)).newPage();
  host.setDefaultTimeout(8_000);
  guest.setDefaultTimeout(8_000);
  const enter = async (page: typeof host, url: string, name: string) => {
    await page.goto(url);
    await page.getByLabel('어떤 이름으로 불러드릴까요?').fill(name);
    await page.getByRole('button', { name: '시장 들어가기' }).click();
  };
  await enter(host, '/jaipur', '민수');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = (await host.locator('.duel-invite strong').innerText()).trim();
  await enter(guest, `/jaipur?room=${code}`, '지수');
  await host.getByRole('button', { name: '장사 시작' }).click();
  const ended = async () => (await host.locator('.jp-result').count()) > 0;
  for (let i = 0; i < 200 && !(await ended()); i++) {
    await expect.poll(async () => (await host.locator('.jp-action.is-mine').count()) + (await guest.locator('.jp-action.is-mine').count()) + (await host.locator('.jp-result').count())).toBeGreaterThan(0);
    if (await ended()) break;
    const mover = (await host.locator('.jp-action.is-mine').count()) ? host : guest;
    const action = (await mover.locator('.jp-action').boundingBox())!;
    const me = (await mover.locator('.jp-me').boundingBox())!;
    expect(action.y + action.height, `${i}번째 차례: 차례 칸 아래가 이름줄 위보다 위`).toBeLessThanOrEqual(me.y + 1);
    // 토큰이 한 줄을 넘쳐도 방금 판 토큰(오른쪽 끝)이 보여야 한다.
    const hidden = await mover.locator('.jp-stall-coins').evaluateAll(els => els.map(el => el.scrollWidth - el.clientWidth - el.scrollLeft));
    for (const gap of hidden) expect(gap, `${i}번째 차례: 가판대 끝 토큰이 가려짐`).toBeLessThanOrEqual(2);
    const camels = mover.getByRole('button', { name: /낙타 \d+마리 모두/u });
    const hand = (await mover.locator('.jp-hand-card').evaluateAll(els => els.map(el => el.getAttribute('aria-label') ?? '')))
      .map(label => label.replace('손패 ', ''));
    if (await camels.count()) {
      await camels.click();
    } else if (hand.length < 7) {
      await mover.locator('.jp-slot').first().click();
      await mover.locator('.jp-buttons .duel-button.primary').click();
    } else {
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
    // 결산창은 왼쪽 문구·단추, 오른쪽 점수표로 나뉘어 스크롤 없이 단추까지 보인다(예전엔 창 높이의 1.6배).
    await expectButtonsFitLandscape(page, /2라운드 시작/u);
    await expect(page.locator('.jp-result-table tr').last()).toBeInViewport({ ratio: 1 });
    await page.getByRole('button', { name: '2라운드 시작' }).click();
  }
  await expect(host.locator('.jp-result')).toHaveCount(0);
  await host.context().close();
  await guest.context().close();
});

// 토이 배틀은 한 판이 길고 항복도 없어 e2e로 결과창까지 가는 길이 없었다. 서버가 보내는 'state' 패킷을 브라우저 쪽에서
// '이번 판이 끝남'으로 바꿔 결과창만 띄워 보고, 320px 폰과 가로 폰에서 '한 판 더 하기'·'대기실로 나가기'가 화면 안인지 본다.
/** Socket.IO 패킷 하나('42["state",{...}]', 네임스페이스·ack 번호가 붙을 수 있음)의 방 상태를 끝난 판으로 바꾼다. */
function finishStatePacket(packet: string): string {
  const match = /^42((?:\/[^,]*,)?\d*)(\[.*\])$/su.exec(packet);
  if (!match) return packet;
  const data = JSON.parse(match[2]!) as [string, { me?: { id: string }; room?: { game?: Record<string, unknown> } }];
  const game = data[0] === 'state' ? data[1].room?.game : undefined;
  if (!game || !data[1].me) return packet;
  Object.assign(game, { status: 'finished', winnerId: data[1].me.id, winReason: 'medals', pending: null });
  return `42${match[1]}${JSON.stringify(data)}`;
}

test('토이 배틀 결과창: 320px 폰과 가로 폰에서 두 단추가 화면 안에 있다', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '크기를 직접 정하므로 한 번만 돌린다');
  const opts = { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' as const };
  const host = await (await browser.newContext(opts)).newPage();
  const guest = await (await browser.newContext(opts)).newPage();
  let finish = false;
  const patch = (text: string) => finish ? text.split('\x1e').map(finishStatePacket).join('\x1e') : text;
  // 처음엔 롱 폴링, 곧 웹소켓으로 올라가므로 두 길 모두 고친다.
  await host.route('**/socket.io/**', async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, body: patch(await response.text()) });
  });
  await host.routeWebSocket('**/socket.io/**', ws => {
    const server = ws.connectToServer();
    server.onMessage(message => ws.send(typeof message === 'string' ? patch(message) : message));
  });
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
  await expect(host.locator('.turn-bar:visible')).toBeVisible();
  finish = true;
  // 상태를 한 번 더 받게 차례인 쪽이 병정을 뽑는다.
  const mover = (await host.locator('.turn-bar:visible').innerText()).includes('내 차례') ? host : guest;
  await mover.getByRole('button', { name: /병정 \d개 뽑기/u }).click();
  const dialog = host.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '가나다라마바님의 승리' })).toBeVisible();
  for (const name of [/한 판 더 하기/u, /대기실로 나가기/u]) {
    const box = (await dialog.getByRole('button', { name }).boundingBox())!;
    expect(box.x + box.width, `${name} 오른쪽`).toBeLessThanOrEqual(320);
    expect(box.y + box.height, `${name} 아래`).toBeLessThanOrEqual(640);
  }
  // 가로로 눕히면 '세로로 돌려 주세요' 안내가 결과창을 덮지 않아야 한다(안내를 닫지 않아도 결과는 보여야 함).
  await expectButtonsFitLandscape(host);
  const leave = dialog.getByRole('button', { name: /대기실로 나가기/u });
  const top = await leave.evaluate(button => {
    const r = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  expect(top, '가로 폰에서 결과창 단추가 맨 위에 있어 눌린다').toBe(true);
  await host.context().close();
  await guest.context().close();
});
