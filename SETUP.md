# 코딩하루 태블릿 앱 — 설정 순서

성령사연과 같은 방식입니다. **교안은 비밀번호로 잠긴 파일(.enc)로만 공개 저장소에 올라가고**,
태블릿 브라우저가 비밀번호로 풀어서 보여 줍니다. 원본은 비공개 `patrickdfg/class` 에만 있습니다.

## 1. 저장소 만들기 (한 번)
1. GitHub 에서 **공개** 저장소 `codingharu-app` 을 만든다 (Pages 는 공개 저장소여야 무료).
2. 이 폴더를 push 한다.
3. Settings → Pages → Source: `main` / `(root)`.
4. 주소: `https://patrickdfg.github.io/codingharu-app/`

## 2. 비밀값 넣기 (본인이 GitHub 화면에서 직접 — 채팅에 붙이지 말 것)
Settings → Secrets and variables → Actions → New repository secret

| 이름 | 값 |
| --- | --- |
| `SITE_PASS` | 학생이 입력할 비밀번호. **10자 이상, 길수록 안전** (아래 '보안 한계' 참고) |
| `CLASS_READ_TOKEN` | github.com → Settings → Developer settings → Fine-grained tokens. Repository access: **Only `patrickdfg/class`**, Permissions: **Contents → Read-only** 만 |

기존 Apps Script 의 GITHUB_TOKEN(읽기/쓰기)은 옮기지 않습니다. 새 읽기 전용 토큰을 따로 만듭니다.

## 3. 첫 동기화
Actions → "교안 동기화" → Run workflow. 끝나면 `content/` 가 올라오고 사이트가 열립니다.
이후에는 15분마다 자동으로 확인하고, 바뀐 교안이 있을 때만 올립니다.

## 4. 교안 고치기
지금처럼 Apps Script 편집기로 `class` main 에 저장하면 됩니다. 15분 안에 앱에 반영되고,
열려 있는 화면에는 "새 교안이 올라왔어요 [새로고침]" 이 뜹니다(답안은 안 날아감).
바로 반영하려면 Actions 에서 "교안 동기화"를 수동 실행합니다.

## 5. 태블릿 설치
크롬으로 앱 주소를 열고 비밀번호를 입력 → 화면의 "이 태블릿에 앱으로 설치" 단추
(또는 ⋮ 메뉴 → 앱 설치). 설치된 아이콘으로 열면 주소창이 없습니다.

## 기기 접속 해제 = 비밀번호 바꾸기
`SITE_PASS` 를 바꾸고 동기화를 다시 돌리면, 모든 기기가 다음 접속 때 로그아웃되어
새 비밀번호를 물어봅니다. **기기를 하나씩만 끊는 것은 이 방식으로는 안 됩니다.**

## 보안 한계 (정직하게)
- 서버가 없어서 로그인 시도 제한은 **기기 안에서만** 걸립니다. 암호화된 파일은 공개라, 누군가 파일을
  받아 자기 컴퓨터에서 무한히 비밀번호를 대입해 볼 수 있습니다. 대비책은 **긴 비밀번호**
  (PBKDF2 60만 번으로 느리게 만들어 두었음)입니다. 단어 3~4개 문장을 권장합니다.
- GitHub Pages 는 응답 헤더를 못 바꿔서 noindex 는 `<meta>` 와 `robots.txt` 로 합니다.
- 암호화는 교안 본문·이미지·첨부에 적용됩니다. 파일 개수와 대략의 크기는 보입니다.
