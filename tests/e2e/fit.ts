import { expect, type Page } from '@playwright/test';

/** 결과창을 640×320으로 눕혀 보고, 한 판 더 하기·대기실로 나가기가 창을 스크롤하지 않아도 화면 안에 있는지 본다. */
export async function expectButtonsFitLandscape(page: Page) {
  await page.setViewportSize({ width: 640, height: 320 });
  const dialog = page.getByRole('dialog');
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/fit-${Date.now()}.png` });
  for (const name of [/한 판 더 하기|좋아요, 한 판 더/u, /대기실로 나가기/u]) {
    const box = (await dialog.getByRole('button', { name }).boundingBox())!;
    expect(box.y + box.height, `${name} 단추 아래가 화면 안`).toBeLessThanOrEqual(320);
  }
  expect(await dialog.evaluate(el => el.scrollTop)).toBe(0);
}
