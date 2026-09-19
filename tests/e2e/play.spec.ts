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

  // A landscape preference saved elsewhere must never override the phone's portrait board.
  await host.evaluate(() => localStorage.setItem('little-battle.orientation', 'landscape'));
  await guest.evaluate(() => localStorage.setItem('little-battle.orientation', 'landscape'));
  await host.getByRole('button', { name: '게임 시작' }).click();
  await expect(host.locator('.turn-bar:visible')).toBeVisible();
  await expect(guest.locator('.turn-bar:visible')).toBeVisible();
  if (await host.evaluate(() => matchMedia('(max-width: 640px)').matches)) {
    // Keep the main flow honest on the narrower phones where the status bar has the least room.
    await host.setViewportSize({ width: 360, height: 800 });
    await guest.setViewportSize({ width: 360, height: 800 });
    await expect(host.locator('.board-shell')).toHaveClass(/board-shell--portrait/u);
    await expect(guest.locator('.board-shell')).toHaveClass(/board-shell--portrait/u);
    await expect(host.getByRole('button', { name: '가로로 보기' })).toBeHidden();
  }

  // 선공은 무작위. 내 차례인 쪽이 손패를 골라 빛나는 거점에 놓으면 상대 화면에도 보여야 한다.
  const hostFirst = (await host.locator('.turn-bar:visible').innerText()).includes('내 차례');
  const mover = hostFirst ? host : guest;
  const watcher = hostFirst ? guest : host;
  await expect(watcher.locator('.turn-bar:visible')).toContainText('상대 차례');
  await expect(mover.locator('.troop-card')).toHaveCount(3);
  await expect(watcher.locator('.troop-card')).toHaveCount(4);
  const visibleSupplyPiles = mover.locator('.supply-pile:visible');
  await expect(visibleSupplyPiles).toHaveCount(2);
  const supplyLabels = await visibleSupplyPiles.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label') ?? ''));
  expect(supplyLabels.some(label => label.endsWith('21장 남음'))).toBe(true);
  expect(supplyLabels.some(label => label.endsWith('20장 남음'))).toBe(true);
  await expect(mover.getByLabel('공용 버림 더미 0장')).toBeVisible();
  await expect(mover.locator('.board-shell [aria-label^="공용 버림 더미"]')).toHaveCount(0);
  await expect(mover.locator('.opponent-card')).toHaveCount(4);
  await expect(watcher.locator('.opponent-card')).toHaveCount(3);
  await expect(mover.locator('.opponent-hand button')).toHaveCount(0);

  if (await mover.evaluate(() => matchMedia('(max-width: 640px)').matches)) {
    const topbarLayout = await mover.locator('.game-topbar').evaluate(element => {
      const rect = (item: Element) => { const box = item.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width }; };
      const scoreItems = [...element.querySelectorAll<HTMLElement>('.topbar-score > *')].map(rect).filter(item => item.width > 0);
      const sides = [...element.querySelectorAll<HTMLElement>('.topbar-side')].map(side => {
        const bounds = side.getBoundingClientRect();
        const children = [...side.children].map(rect).filter(child => child.width > 0);
        return { bounds: rect(side), children, fits: children.every(child => child.left >= bounds.left - 1 && child.right <= bounds.right + 1)
          && children.every((child, index) => index === 0 || child.left >= children[index - 1]!.right - 1) };
      });
      const fits = element.scrollWidth <= element.clientWidth + 1
        && scoreItems.every((item, index) => index === 0 || item.left >= scoreItems[index - 1]!.right - 1)
        && sides.every(side => side.fits);
      return { fits, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, scoreItems, sides };
    });
    expect(topbarLayout.fits, JSON.stringify(topbarLayout)).toBe(true);

    // 휴대폰에서는 보드를 처음부터 잘라내지 않고 전부 보여 주며, 손패는 크게 접고 펼칠 수 있다.
    const boardBounds = await mover.locator('.board-viewport').evaluate(element => {
      const viewport = element.getBoundingClientRect();
      const board = element.querySelector('.game-board')!.getBoundingClientRect();
      return {
        viewport: { left: viewport.left, top: viewport.top, right: viewport.right, bottom: viewport.bottom },
        board: { left: board.left, top: board.top, right: board.right, bottom: board.bottom },
      };
    });
    expect(boardBounds.board.left).toBeGreaterThanOrEqual(boardBounds.viewport.left - 2);
    expect(boardBounds.board.top).toBeGreaterThanOrEqual(boardBounds.viewport.top - 2);
    expect(boardBounds.board.right).toBeLessThanOrEqual(boardBounds.viewport.right + 2);
    expect(boardBounds.board.bottom).toBeLessThanOrEqual(boardBounds.viewport.bottom + 2);

    const tuckedCard = await mover.locator('.opponent-card').first().evaluate(element => {
      const card = element.getBoundingClientRect();
      const rack = element.parentElement!.getBoundingClientRect();
      return { cardBottom: card.bottom, rackBottom: rack.bottom };
    });
    expect(tuckedCard.cardBottom).toBeGreaterThan(tuckedCard.rackBottom);

    const mobileHandToggle = mover.locator('.hand-mobile-toggle');
    await expect(mobileHandToggle).toHaveAccessibleName('패 접기');
    await mobileHandToggle.click();
    await expect(mover.locator('.hand-dock')).toHaveClass(/is-collapsed/u);
    await expect(mover.locator('.troop-card').first()).toBeHidden();
    await expect(mobileHandToggle).toHaveAccessibleName(/^패 펼치기, \d+장$/u);
    await mobileHandToggle.click();
    await expect(mover.locator('.hand-dock')).not.toHaveClass(/is-collapsed/u);
    await expect(mover.locator('.troop-card').first()).toBeVisible();
  }

  await mover.getByRole('button', { name: '게임판 전체 보기' }).click();
  await mover.locator('.troop-card').first().click();
  const optionalAbility = mover.getByLabel('능력 사용');
  if (await optionalAbility.count()) await optionalAbility.uncheck();
  // 첫 수는 본부 옆 두 관문에 놓을 수 있고, 코코 선장이라면 어느 거점이든 가능하다.
  const legal = mover.locator('.board-base.is-legal');
  await expect(legal.first()).toBeVisible();
  expect(await legal.count()).toBeGreaterThanOrEqual(2);
  await mover.screenshot({ path: testInfo.outputPath('before-move.png') });
  await legal.first().click();

  await expect(watcher.locator('.game-log')).toContainText('놓았습니다');
  await expect(watcher.locator('.board-base.is-occupied')).toHaveCount(1);
  await expect(mover.locator('.board-base.is-occupied')).toHaveCount(1);
  await expect(watcher.locator('[data-recent-opponent="true"]')).toHaveCount(1);
  await expect(watcher.locator('.board-recent-opponent-ring')).toHaveCount(1);
  await expect(mover.locator('[data-recent-opponent="true"]')).toHaveCount(0);
  await watcher.screenshot({ path: testInfo.outputPath('after-move.png') });
  await watcher.getByRole('button', { name: /병정 2개 뽑기/ }).click();
  await expect(watcher.locator('[data-recent-opponent="true"]')).toHaveCount(0);
  await expect(mover.locator('[data-recent-opponent="true"]')).toHaveCount(0);
});
test('참호에서 전장 위 상대 뒷면을 직접 고르면 그 카드만 다음 차례에 봉쇄된다', async ({ browser }, testInfo) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  await enter(host, '참호방장');
  await enter(guest, '참호손님');
  await host.getByRole('button', { name: '방 만들기' }).first().click();
  await host.getByRole('dialog').locator('.map-picker select').selectOption('battlefield');
  await host.getByRole('dialog').getByRole('button', { name: '방 만들기' }).click();
  const code = await host.locator('.invite-box strong').innerText();
  await guest.getByRole('button', { name: '코드로 입장' }).click();
  await guest.getByLabel('초대 코드').fill(code.trim());
  await guest.getByRole('button', { name: '방 들어가기' }).click();
  await host.getByRole('button', { name: '게임 시작' }).click();
  await expect(host.locator('.turn-bar:visible')).toBeVisible();
  await expect(guest.locator('.turn-bar:visible')).toBeVisible();
  const hostFirst = (await host.locator('.turn-bar:visible').innerText()).includes('내 차례');
  const attacker = hostFirst ? host : guest;
  const defender = hostFirst ? guest : host;
  const blue = await attacker.locator('.troop-card').first().evaluate(el => el.classList.contains('blue-card'));
  async function placeWithoutAbility(nodeId: string) {
    await attacker.getByRole('button', { name: '게임판 전체 보기' }).click();
    await attacker.locator('.troop-card:not([disabled])').first().click();
    const ability = attacker.getByLabel('능력 사용');
    if (await ability.count()) await ability.uncheck();
    await attacker.locator(`[data-node-id="${nodeId}"][data-legal="true"]`).click();
  }
  await placeWithoutAbility(blue ? 'line-w-top' : 'line-e-top');
  await expect(defender.locator('.turn-bar:visible')).toContainText('내 차례');
  await defender.getByRole('button', { name: /병정 2개 뽑기/ }).click();
  await expect(attacker.locator('.turn-bar:visible')).toContainText('내 차례');
  await placeWithoutAbility(blue ? 'trench-nw' : 'trench-ne');
  await expect(attacker.locator('.opponent-hand.is-choosing')).toBeVisible();
  await expect(attacker.getByRole('dialog')).toHaveCount(0);
  await attacker.screenshot({ path: testInfo.outputPath('trench-selection.png') });
  await attacker.getByRole('button', { name: '상대 2번째 손패, 뒷면, 선택하기' }).click();
  await expect(defender.locator('.troop-card.is-frozen')).toHaveCount(1);
  await expect(defender.locator('.troop-card').nth(1)).toBeDisabled();
  await expect(attacker.locator('.opponent-card.is-frozen')).toHaveCount(1);
  await expect(attacker.locator('.opponent-card').nth(1)).toHaveAttribute('aria-label', /봉쇄됨/);
  await defender.getByRole('button', { name: /병정 2개 뽑기/ }).click();
  await expect(attacker.locator('.opponent-card')).toHaveCount(8);
  await expect(attacker.locator('.opponent-card.is-frozen')).toHaveCount(0);
  await expect(defender.locator('.troop-card.is-frozen')).toHaveCount(0);
  await attacker.screenshot({ path: testInfo.outputPath('opponent-hand-full.png') });
  await host.close();
  await guest.close();
});
test('방장이 대기실에서 맵과 차례 시간을 바꾸면 양쪽에 바로 동기화된다', async ({ browser }, testInfo) => {
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
  await expect(guest.getByLabel('한 차례 제한 시간')).toBeDisabled();

  await host.locator('.waiting-panel .map-picker select').selectOption('tropical-pool');
  await expect(guest.locator('.waiting-panel .map-picker select')).toHaveValue('tropical-pool');
  await expect(guest.locator('.preview-copy')).toContainText('숫자가 적힌 섬 거점');
  await expect(guest.locator('.preview-copy')).toContainText('승리 조건 · 훈장 6개 또는 상대 본부 점령');
  const powerOneIsland = guest.locator('[data-node-id="island-1"]');
  await expect(powerOneIsland).toHaveAttribute('data-troop-power', '1');
  await expect(powerOneIsland).toHaveAttribute('data-troop-type', 'skeleton');
  await expect(powerOneIsland.locator('g[filter] text').first()).toHaveText('1');

  await host.getByLabel('한 차례 제한 시간').evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '65';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await expect(guest.getByLabel('한 차례 제한 시간')).toHaveValue('65');
  await expect(guest.locator('.turn-time-heading')).toContainText('한 차례 65초');
  await host.screenshot({ path: testInfo.outputPath('room-settings.png'), fullPage: true });

  await host.locator('.waiting-panel .map-picker select').selectOption('cursed-cemetery');
  await expect(guest.locator('.waiting-panel .map-picker select')).toHaveValue('cursed-cemetery');
  await host.getByRole('button', { name: '게임 시작' }).click();
  await expect(host.locator('.board-heading')).toContainText('저주받은 묘지');
  await expect(host.locator('.board-heading')).toContainText('훈장 6개');
  await expect(guest.locator('.board-heading')).toContainText('저주받은 묘지');
  await expect(host.locator('.board-theme--cemetery')).toBeVisible();
});
