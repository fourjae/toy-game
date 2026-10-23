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
