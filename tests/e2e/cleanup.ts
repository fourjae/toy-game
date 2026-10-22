import type { test as base } from '@playwright/test';

/**
 * `browser.newPage()`로 연 창은 테스트가 끝나도 브라우저가 닫힐 때까지 남는다. 일꾼이 하나라 창이
 * 테스트마다 쌓이고(소켓 연결·애니메이션 포함), 뒤쪽 테스트가 점점 느려져 시간 제한에 걸렸다.
 * 테스트가 끝나면 기본 `page` 말고 직접 연 창을 모두 닫는다.
 */
export function closeExtraPagesAfterEach(test: typeof base) {
  test.afterEach(async ({ browser, context }) => {
    await Promise.all(browser.contexts().filter(other => other !== context).map(other => other.close()));
  });
}
