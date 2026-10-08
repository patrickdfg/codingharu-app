# 작업 규칙

이 저장소를 맡은 사람(또는 AI 도구)이 먼저 읽는 문서다.
Codex(ChatGPT)는 `AGENTS.md`, Claude Code 는 `CLAUDE.md` 를 자동으로 읽는데,
규칙이 갈라지지 않도록 **내용은 이 파일 하나에 둔다**(`CLAUDE.md` 는 여기를 가리킨다).
규칙을 고칠 일이 있으면 이 파일만 고친다.

## 도구를 번갈아 쓴다 (Claude ↔ ChatGPT)

같은 저장소를 두 도구가 번갈아 건드리므로 **서로의 변경을 덮어쓰지 않도록** 지킨다.

- **시작할 때 먼저 `git pull --rebase origin main`.** 파일을 읽거나 고치기 전에 받는다.
  특히 이 저장소는 **봇(`교안 동기화`)도 main 에 커밋**하므로 로컬이 금방 뒤처진다.
- **끝낼 때 커밋하고 `git push origin main`.** 푸시하지 않고 두면 다음 도구가 옛 상태에서 시작한다.
- 푸시가 거부되면 억지로 밀지 말고(`--force` 금지) `git pull --rebase` 로 합친 뒤 다시 올린다.
- 작업을 마칠 때 **한 일·남은 일·확인 못 한 것**을 이 파일 아래 '진행 메모' 에 두세 줄로 남긴다.
  다음 도구가 대화 기록 없이도 이어받을 수 있어야 한다.
- 실제로 시험하지 않은 것을 "됐다"고 적지 않는다. (태블릿 실기 시험은 사람이 한다)

## 이 저장소가 하는 일

안드로이드 태블릿 약 10대용 PWA. 학생은 비밀번호를 **기기에서 처음 한 번만** 입력한다.
교안 원본은 비공개 저장소 `patrickdfg/class` 에 있고, 이 공개 저장소(GitHub Pages)에는
**비밀번호로 잠근 `.enc` 파일만** 올라간다. 서버는 없다.

- 주소: <https://patrickdfg.github.io/codingharu-app/>
- 흐름: `class` main(+ 공개 `patrickdfg/roblox`) → GitHub Actions `교안 동기화`(15분마다·수동)
  → `tools/build.mjs` 가 잠가서 `content/` 에 커밋 → Pages 배포 → 태블릿 브라우저가 풀어서 표시.
- 교안 수정·저장은 **이 저장소가 아니라** 기존 Apps Script 편집기가 `class` main 에 커밋한다.
  이 저장소에서 교안 HTML 을 직접 고치지 않는다(다음 동기화 때 덮어써진다).

| 파일 | 역할 |
| --- | --- |
| `index.html` | 처음 화면. 수업 기록이 꺼져 있으면 비밀번호 확인 → 열쇠 저장 → `v/index.html`. 켜져 있으면 로그인/가입하기 탭(학생 이름+4자리, 선생님 구글)·관리자 메뉴(학생 현황) |
| `core.js` | 열쇠 만들기·풀기·IndexedDB 보관. 화면·서비스워커·시험이 같이 쓴다 |
| `sw.js` | `/v/` 아래 주소를 잠긴 파일에서 풀어 돌려준다. 교안은 저장하지 않는다 |
| `inject.js` | 교안 화면마다 끼워 넣는 스크립트: 새 교안 알림, 글자 −/+ 막대, 파일 내려받기, 설치 단추 |
| `tools/build.mjs` | 교안을 잠가 `content/`·`check.enc`·`crypt.json`·`version.json` 생성 |
| `.github/workflows/sync.yml` | 받기 → 잠그기 → 바뀐 것만 커밋 |
| `test/interop.test.mjs` | 잠금·풀기 호환 시험 (`node test/interop.test.mjs`) |
| `SETUP.md` | 처음 설정 순서(비밀값 넣는 법 등) |
| `record.js` · `login.html` · `record-config.json` | 수업 기록: 기기 등록 열쇠·로그인 상태 보관, 기록 서버 호출. 로그인·가입·관리자 메뉴는 `index.html` 에 있고 `login.html` 은 옛 주소를 index 로 넘기는 껍데기 |
| `server/record.gs` | 수업 기록 서버(구글 시트에 붙인 Apps Script). 이 저장소에서는 배포되지 않는다 — 시트의 Apps Script 에 붙여 넣는다 |

`content/`·`crypt.json`·`check.enc`·`version.json` 은 **봇이 만드는 파일**이다. 손으로 고치지 않는다.

## 지켜야 할 것 (보안)

- **비밀번호·토큰을 채팅·코드·로그·커밋에 적지 않는다.** 저장소 비밀값 `SITE_PASS`(학생 비밀번호, 10자 이상),
  `CLASS_READ_TOKEN`(`class` 읽기 전용 fine-grained 토큰)은 사용자가 GitHub 화면에서 직접 넣는다.
- 평문 교안을 이 저장소에 올리지 않는다. `admin/` 은 빌드에서 `admin/apps-script-url.json` 한 개만 잠가 넣는다.
- `crypt.json` 의 소금은 한 번 만들면 유지한다(바뀌면 모든 기기가 로그아웃).
- 비밀번호를 바꾸면 모든 기기가 로그아웃된다 = 기기 접속 해제. 기기를 하나씩만 끊는 기능은 없다.
- `sw.js` 의 `lesson()` 은 열쇠가 없으면 401/로그인으로 보낸다. 이 검사를 약하게 만들지 않는다.

## 손볼 때 알아 둘 것

- **교안은 `/v/` 가상 경로로 서빙된다.** 교안 안의 상대 링크가 그대로 동작한다.
  교안이 스스로 쓰는 `sw.js`·`assets/install.js`·manifest 는 앱 것으로 대체된다(`sw.js` `lesson()` 참고).
- **안드로이드 크롬은 `download` 링크를 서비스워커 밖에서 다시 요청해 실패한다.** 그래서 `inject.js` 가
  `.ent`/`.rbxl` 링크를 가로채 앱 안에서 받아 blob 으로 저장시킨다. 이 부분을 지우지 않는다.
- **글자 −/+**: 교안에 `[data-font-step]` 이 있으면 그것을 쓰고, 없는 페이지(워크북 `.page`, `algorithm/dsm-final`)에는
  `inject.js` 가 막대를 붙인다(CSS `zoom`, 워크북은 A4 쪽을 긴 페이지로 풀어 줌).
- **로블록스 워크북**은 공개 저장소 `patrickdfg/roblox` 에서 받아 `roblox/treasure/` 로 잠근다.
  `build.mjs` 의 `REWRITE` 가 `class` 의 `roblox/index.html` 속 외부 링크를 앱 안 주소로 바꾼다.
- 앱 껍데기 파일(`sw.js`·`inject.js` 등)을 고쳤는데 태블릿에 안 보이면 앱을 한 번 닫았다 연다.
  `sw.js` 의 `SHELL_CACHE` 이름은 껍데기 파일 **목록**을 바꿀 때만 올린다.
- 큰 파일을 통째로 다시 쓰지 않는다. 부분만 고친다.

## 확인 방법

```bash
node test/interop.test.mjs        # 잠금·풀기 시험 (맨 위 "SITE_PASS 가 없거나..." 한 줄은 정상 출력)
```

로컬에서 브라우저로 보려면(실제 비밀번호 말고 **임시 값**을 쓴다):
`class` 를 clone 해 두고 `SITE_PASS=임시값10자이상 node tools/build.mjs <class폴더> <임시폴더> roblox/treasure=<roblox폴더>`
→ 앱 파일(`index.html core.js sw.js inject.js manifest.webmanifest icons`)을 같은 임시폴더에 복사 →
`/codingharu-app/` 아래로 정적 서빙(서비스워커는 localhost 에서 동작).
임시폴더·임시 비밀번호는 저장소에 커밋하지 않는다.

배포 확인:

```bash
gh run list -R patrickdfg/codingharu-app --limit 3
curl -s https://patrickdfg.github.io/codingharu-app/version.json
```

## 아직 사람이 해야 하는 것 / 열린 일

- 실제 태블릿 설치·주소창 없는 실행·재접속 시 비밀번호 재입력 없음: 사람이 확인(일부 확인됨).
- `algo` 저장소(공개) 비공개 전환, `patrickdfg/roblox` 공개 → 비공개 전환(전환하면 동기화 토큰에 읽기 권한 추가 필요).
- 기존 Apps Script 사이트 정리: **새 앱 검증이 끝나기 전에는 유지**한다.
- `CLASS_READ_TOKEN` 만료일을 확인해 둔다(만료되면 동기화가 멈춘다).

## 진행 메모 (도구가 바뀔 때마다 두세 줄로 갱신)

- 2026-10-03 Claude: 로그인·기기 기억·잠긴 교안·새 교안 알림·글자 −/+·로블록스 워크북 통합·파일 내려받기 구현·배포.
  태블릿 실기에서 로그인·설치는 확인됨. 내려받기 수정은 로컬 시험만 했다.

- 2026-10-03 Codex: class main에 인형맞히기 워크북·시작/원본 파일·미리보기를 추가(5ceb87a). 기존 디자인, 4미션, 좌표 정수 표기 유지. 모바일 배치·답안/체크 저장·검색·시작 파일 자료 보존 검사 통과. 실제 엔트리 실행·태블릿 다운로드는 미확인.
  이전 동기화 실행 재시도에서 오래된 앱 커밋으로 인한 push 충돌을 확인하여 checkout을 main으로 고정하고 워크플로 수정 시 동기화 실행을 추가함.

- 2026-10-06 Claude: class에 특강 카테고리·도서관 6차시 AI 활용 추가, roblox 워크북 섬 만들기 W→R 슬라이더 수정(roblox 698d474). 예약 동기화가 몇 시간 간격으로만 돌아 수동 실행(dispatch)으로 반영함.
  앱 화면에서 바꾼 글자는 원본 저장소에 저장되지 않는다. 로블록스 워크북은 patrickdfg/roblox, 나머지는 class를 고친 뒤 동기화해야 한다.

- 2026-10-06 Codex: class main bf655f5에 COS 2급 모의고사 2회 엔트리 워크북 10개·40미션·시작/완성/원본 30파일·미리보기를 추가. 교안 동기화 #41 성공, 잠긴 자료 수 309→359.
  모바일 배치·기록 저장·검색·다운로드 링크·자료 보존 및 로컬 엔트리 20파일 열기 통과. 정맥 인식 완성본은 클릭 선택으로 보완했고 정답/오답 실행 확인. 실제 태블릿·공식 엔트리 앱 실행은 미확인; 상세는 class/work/cos2-02-verification.md.
- 2026-10-08 Claude: 수업 기록 추가(선생님 구글 로그인 GIS → server/record.gs 가 ID 토큰 확인 후 기기 열쇠 발급, 학생 이름+PIN, 워크북 state 학생별 시트 저장·다른 기기 이어쓰기, 연 교안 기록). class app.js 는 학생별 localStorage 키와 window.CodingHaruWorkbook 을 연다.
  가짜 로그인·가짜 서버로 두 태블릿 이어쓰기·학생 분리·PIN 오류를 시험함. 실제 구글 로그인·Apps Script 배포는 사람이 설정 후 확인해야 한다(SETUP.md 수업 기록). record-config.json 비어 있으면 꺼짐.
- 2026-10-08 Claude: class `python/basic/unit1~17`(파이썬 기초 학습, 정올 문제 실습)에 `window.CodingHaruWorkbook`(id `python-basic-uN`, 코드·정답 체크를 학생별 키로 저장)을 달았다. 생성 스크립트는 class 저장소에 없고 작업 세션 임시 폴더에 있었으므로, 단원 내용을 고칠 때는 class 의 HTML 을 부분 수정한다.
  로블록스 보물섬은 저장하지 않기로 했다(연 기록만). 구글 설정(record-config.json)은 아직 비어 있어 기능이 꺼져 있다. 실제 구글 로그인·시트 연동과 앱 안에서의 파이썬 단원 동작은 확인하지 못했다(로컬에서 연결 고리 계약만 시험).

- 2026-10-08 Claude: 처음 화면을 로그인/가입하기 탭으로 바꿈. 학생은 이름+4자리로 직접 가입·로그인(선생님이 등록한 기기에서만), 선생님은 구글 로그인만(시트 선생님 탭 계정), 들어갈 때마다 로그인(sessionStorage, 교안 화면 inject.js 가 확인), 선생님 관리자 메뉴에 학생 현황(server `admin` 액션). 선생님 가입·마이크로소프트 로그인은 하지 않기로 했다.
  record.gs 가 바뀌어 **Apps Script 에서 새 버전 배포가 필요**하다. 가짜 구글·가짜 서버 Playwright 시험 29개 통과(저장소에는 없음). 실제 구글 로그인·시트·새 서버 코드는 아직 확인하지 못했다.

- 2026-10-08 Claude: 학생 가입을 승인제로 바꿈. 가입하면 학생 탭 F열 `상태`='대기', 승인 전에는 로그인·저장 불가. 관리자 메뉴 맨 위 "가입 승인 대기"에서 승인/거절(server `approve` 액션). 상태가 비어 있는 옛 행은 승인된 것으로 본다. **record.gs 새 버전 재배포 필요.** 문법 검사만 했고 실제 동작은 아직 확인하지 못했다.

- 2026-10-08 Claude: **규칙 — Apps Script(server/record.gs)는 가능하면 더 고치지 않는다.** 고치면 사람이 붙여넣고 새 버전 배포를 해야 한다(자동 배포는 하지 않기로 했다). 새 기능은 화면(index.html·inject.js·record.js)과 시트 구성으로 풀고, 서버를 바꿔야 하면 한 번에 모아서 바꾼다.

- 2026-10-08 Claude: class 저장소 `scratch/junior/`에 스크래치 주니어 수업 틀(5개월 20회차 목록)과 1개월차 1회차(`m1-1/`, 교재 사진에서 오린 그림 포함, 체크리스트 6개를 `window.CodingHaruWorkbook`으로 저장)를 만들었다. 블록 아이콘은 LLK/scratchjr(BSD) 것이고 `scratch/junior/img/`에 라이선스를 두었다. **나중에 할 일**은 1개월차 2~4회차와 2~5개월차이며, 배경·캐릭터 그림은 앱에 내장돼 있어 교재 사진이나 태블릿 화면 캡처가 있어야 넣을 수 있다. 앱에서 직접 해본 확인은 못 했다.

- 2026-10-08 Claude: class 저장소에 엔트리 프로젝트 2권 1~4차시(차시당 작품 2개, 총 8개)를 가볍게 등록했다. 완성(original)·시작(starter) 파일, 저장된 첫 장면 미리보기, `entry/project2-lessonN/` 페이지, 엔트리 목록 카드 4개(전체 82개). 미션·힌트·교사용 발문이 있는 워크북은 아직 없다. 5~8차시는 파일이 오면 `class/work/entry_project2.py` 의 LESSONS 에 추가해 다시 돌린다.

- 2026-10-08 Claude: 학생은 기기 등록 없이 어느 기기에서나 가입·로그인한다. 서버가 로그인 때 HMAC 서명 확인표(sid, 14일)를 주고 load·save·visit 은 그 학생 것인지 확인한다(스크립트 속성 SESSION_SECRET 은 처음 쓸 때 자동 생성). 새 기기에서는 로그인 뒤 수업 비밀번호를 한 번 묻는다. 시간당 가입 신청 30건 제한. **record.gs 재배포 필요**(Apps Script 를 바꾸는 마지막 수정이 되도록 모아서 했다). 가짜 서버 시험과 서명 로직 시험만 했고 실제 구글 서버·시트는 아직 확인하지 못했다.

- 2026-10-08 Claude: class 엔트리 프로젝트 2권 1~4차시를 완전한 워크북(미션 29개, 힌트 3단계, 교사용 발문, 학생별 저장)으로 다시 만들었다(`work/entry_project2*.py`, 내용은 `entry_project2_content.py`·`entry_project2_hint3.py`). 힌트 3은 오브젝트별 카드(이름·그림·블록 순서). 기존 워크북 80쪽 힌트 3에는 `work/entry_hint_objects.py` 로 "이 힌트에 나오는 오브젝트" 그림 줄을 넣었다(오브젝트 그림은 `assets/entry-obj/`). 원본 코드에서 시작 블록과 떨어진 묶음·횟수 세기 오류 등은 교사용 안내에 적었다. 실제 엔트리에서 작품을 열어 확인하는 일은 못 했다.

- 2026-10-08 Claude: 교안을 열었다는 기록(visit)을 없애고, 학생 화면 맨 아래 '완료' 단추로 바꿨다(inject.js). 누르면 기존 `save` 로 `done:<쪽>`(수업별)와 `done-index`(목록) 두 줄이 저장되고, 목록 화면은 `done-index` 를 받아 완료한 수업을 흐리게(.ch-done-item) 보여 준다. **서버(record.gs) 변경 없음.** 선생님 현황은 '완료한 수업' 수와 '최근 완료한 수업'으로 바꿨다. 가짜 서버 시험만 했다.

- 2026-10-08 Claude: 파이썬 단원(17개)이 코드를 칸마다 2000자로 자르던 것을 없애 쓴 값을 그대로 저장한다. 앱(inject.js)은 한 줄 45000자 제한을 넘는 기록을 값 하나도 줄이지 않고 여러 줄(`<워크북>~2` …, 첫 줄에 `__parts`)로 나누어 저장하고 불러올 때 합친다. 선생님 현황에서는 이어진 줄을 숨긴다. 서버 변경 없음. 가짜 서버로 십만 자 안팎 기록의 저장·복원을 시험했다.

- 2026-10-08 Claude: 엔트리 미션 맨 위에 "이 미션에서 코딩할(나오는) 오브젝트" 이름·그림 줄을 넣었다(`class/work/entry_mission_objects.py`, 프로젝트 2·배구는 코딩하는 오브젝트를 정확히). 목표 글에 이름이 나오는 오브젝트만 보여 주므로 오브젝트 이름이 영어인 기초 2·3·4권, 기초 1권(book1) 등 34쪽은 아직 줄이 없다.

- 2026-10-08 Claude: 미션 오브젝트 줄을 넓혔다. 영어 이름 작품은 `entry_hint_objects.py` 의 ALIAS(영어 이름 → 교안에 쓰인 한글 낱말)로 찾고, 코드 오브젝트가 하나뿐인 작품은 모든 미션에 보여 준다. 기존 워크북 미션 187개 중 157개에 줄이 있고 basic4-lesson5·basic4-lesson6·book1-lesson3 의 일부는 글에 오브젝트 이름이 없어 없다. 새 작품을 넣으면 ALIAS 에 이름을 더하고 `entry_mission_objects.py` 를 다시 돌린다.

- 2026-10-08 Claude: 엔트리 워크북 힌트 2(쓸 수 있는 블록)에 **실제 엔트리 블록 그림**을 넣었다(257개 중 244개). 엔트리 공식 패키지 @entrylabs/entry 4.0.23(Apache-2.0)으로 블록을 그려 `class/assets/entry-blocks/<블록종류>.png` 로 저장한다. 도구는 class 저장소 `work/entry_render/`(setup.sh → /tmp/entryrender, 로컬 서버 8790, render_blocks.mjs)와 `work/entry_hint_blocks.py`(힌트 글의 블록 이름 → 블록 종류 규칙표 RULES). 새 워크북을 만들면 `entry_hint_blocks.py` 를 다시 돌린다. 그림이 안 붙은 13개는 글에 블록 이름이 없는 힌트다.

- 2026-10-08 Claude: 힌트 3에도 실제 엔트리 블록 그림을 붙였다(오브젝트 카드는 카드마다 "이 카드에 쓰는 블록", 기존 산문 힌트는 블록 이름이 3개 이상 잡힐 때만 "이 예시에 나오는 블록"). 힌트 글→블록 짝짓기 규칙은 class `work/entry_hint_blocks.py` 의 RULES. 산문 힌트는 글 표현이 달라 빠지는 블록이 있을 수 있어 일부만 보일 수 있다.
