# CLAUDE.md

2인 웹 보드게임 모음("작은 놀이터"). React 19 + Vite 클라이언트, Express 5 + Socket.IO 서버, TypeScript, Node 22.

## 세션 시작할 때 먼저 할 일

1. `git fetch origin main && git merge origin/main` 으로 main을 현재 브랜치에 역머지한다. 충돌 나면 해결하고, 판단이 애매하면 멈추고 사용자에게 알린다.
2. `TODO.md`를 읽고, 체크 안 된 항목 중 맨 위부터 이어서 진행한다.
3. 항목 하나를 끝낼 때마다 `npm test`(+ 가능하면 `npm run build`)를 돌리고, 통과하면 TODO.md에 체크하고 커밋한다.
4. 게임은 하나씩 브랜치를 나눈다: `claude/<game>`(예: `claude/hanamikoji`). 이미 원격에 있으면 그 브랜치를 받아서 이어서 하고, 시작 전에 main을 역머지한다. 게임 하나가 끝나면 PR을 연다. `gh pr create`는 막혀 있으니 `gh api repos/fourjae/toy-game/pulls -f base=main -f head=<branch> -f title=... -f body=...`를 쓴다. 이미 열린 PR이 있으면 새로 열지 않는다.
5. 세션이 끊길 수 있으니 작업은 작게 쪼개서 자주 커밋/푸시한다. 다음 세션이 이어받을 수 있게 TODO.md에 "진행 중 메모"를 남긴다.

## 명령어

```bash
npm install
npm run dev        # 서버(3001) + 웹(5173)
npm test           # node:test 단위 테스트 (tests/*.test.ts)
npm run build      # tsc --noEmit && vite build
npm run test:e2e   # Playwright (처음 한 번 npx playwright install chromium)
```

## 구조

- `shared/` — 규칙 엔진. 순수 함수, 서버와 클라이언트가 같이 씀. 상태는 서버가 소유.
- `server/` — `app.ts`가 Express + Socket.IO를 띄우고 게임별 네임스페이스를 붙임. 방/세션은 메모리에만 있음.
- `src/` — React 화면. `Root.tsx`가 경로 라우팅, `Hub.tsx`가 첫 화면 게임 선반(3x3).
- `tests/` — 엔진/서버 단위 테스트, `tests/e2e/` 브라우저 테스트(데스크톱 + Pixel 7).

## 새 게임 추가하는 법 (로스트 시티가 기준 예시)

| 단계 | 로스트 시티 파일 | 새 게임에서 할 일 |
|---|---|---|
| 규칙 엔진 | `shared/lostCities.ts` | `shared/<game>.ts` — create / applyAction / getView(상대 손패 숨김) 순수 함수 |
| 서버 | `server/lostCities.ts`, `server/app.ts`의 `attachLostCities` | `server/<game>.ts`에 `attach<Game>(io, opts)`로 별도 소켓 네임스페이스 `/<game>` |
| 타입 | `server/types.ts` | 방/뷰 타입 추가 |
| 화면 | `src/LostCities.tsx`, `src/lostCities.css` | `src/<Game>.tsx` + 전용 css, 분위기 있는 배경 |
| 라우팅 | `src/Root.tsx`의 `GameId`, `PATHS` | 경로 `/<game>` 추가 |
| 첫 화면 | `src/Hub.tsx` | 카드 추가, `EMPTY_SLOTS` 줄이기 |
| 테스트 | `tests/lostCities*.test.ts`, `tests/e2e/lost-cities.spec.ts` | 엔진 + 서버 테스트 필수, e2e는 가능하면 |
| 문서 | `README.md` "게임 고르기" | 한 줄 설명 추가 |

### 하나미코지부터는 공용 뼈대를 쓴다

- 서버: `server/duel.ts`의 `attachDuel(io, game, opts)`가 방/세션/초대 코드/재접속/재대전 투표를 다 처리한다. 게임은 `server/games/<game>.ts`에 `DuelGame`(create/cleanAction/apply/view/status/nextRound)만 정의하고 `server/app.ts`의 `duels` 배열에 넣는다. 이벤트: `rooms:options`(방 설정), `game:action`, `game:ready`.
- 엔진 공용: `shared/duel.ts`(RuleError, shuffle, pushLog).
- 화면: `src/duel/DuelShell.tsx`가 첫 화면/대기실/방을 그린다. 게임은 `src/<game>/`에 테마(`DuelTheme`: 문구, Art, Backdrop, Rules, Table)를 넘긴다. 색은 `.theme-<key>`에서 `--d-*` 변수로.
- 테스트: `tests/helpers/duelClient.ts`의 `duelFixture`, `roomLifecycleTests`를 쓴다.
- e2e: 이 환경에선 `pw.local.config.ts`(로컬 전용, git 제외)로 `/opt/pw-browsers/chromium`을 지정해서 돌렸다.

## 규칙

- UI 문구, 주석의 사용자 대상 텍스트, 커밋 메시지는 한국어.
- 게임 규칙은 원작 규칙을 조사해서 구현하고, 게임 안 "게임 방법"에 요약을 넣는다. 상표/원작 아트는 쓰지 않고 그림은 직접 SVG/CSS로 그린다.
- 모바일은 세로 화면 우선. 정말 안 되는 게임만 가로 회전 안내.
- 상대에게 숨겨야 할 정보(손패, 비공개 카드)는 서버의 view 함수에서 걸러서 보낸다. 클라이언트를 믿지 않는다.
- 기존 테스트를 깨지 않는다. 고쳤으면 왜 고쳤는지 커밋 메시지에 적는다.
