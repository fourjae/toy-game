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
