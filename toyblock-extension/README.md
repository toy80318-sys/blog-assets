# 토이블록 네이버 블로그 도우미

네이버 블로그 글쓰기와 블로그 분석을 돕는 크롬 확장 프로그램입니다.

- **글쓰기**: `Ctrl+Shift+1` 엔터+소제목, `Ctrl+Shift+2` 인용구 서식, `Ctrl+Shift+3` 인용구 블록 등 단축키와 화면 상단 단축키 버튼
  - `Ctrl+Shift+1`은 크롬 디버거 기능으로 실제 키보드와 같은 엔터를 넣습니다(확실한 엔터 모드, 설정에서 끌 수 있음). 이때 화면 위에 "디버깅을 시작함" 줄이 잠깐 보입니다.
- **블로그 분석 패널**: 방문자·이웃·전체 글, 100점 블로그 점수, 검색 노출 지수, 발행 분석, 글자 수·키워드 분석 (끌어서 옮길 수 있음)
- **이웃 소통 댓글 도우미**: 이웃 새 글·키워드 노출 글 목록 → 누르면 새 탭에서 댓글창으로 이동하고 그 글에 맞춘 댓글을 복사. 제미나이(기본)·클로드·GPT 또는 템플릿 150종. 등록은 사용자가 직접
- **블로그 점수 가이드**: 확장 안의 팁 페이지, 아임웹 코드 위젯용 코드

## 받기

**[최신 버전 zip 내려받기](https://github.com/toy80318-sys/blog-assets/raw/main/toyblock-extension/dist/toyblock-naver-blog-helper.zip)**

압축을 풀면 `nbx` 폴더(확장 프로그램)와 `설치방법.html`·`설치방법.pdf`가 들어 있습니다. 설치는 설치방법 문서를 따라 하면 5분이면 끝납니다.

## 업데이트 방법

새 버전이 올라오면 6시간 안에 확장 아이콘에 분홍색 **N** 표시가 뜨고, 아이콘을 누르면 "새 버전 받기" 버튼이 보입니다.

1. **새 버전 받기**로 zip을 내려받아 압축을 풉니다.
2. 안의 `nbx` 폴더 파일들로 지금 쓰는 `nbx` 폴더의 파일을 **덮어씁니다**.
3. `chrome://extensions`에서 토이블록 카드의 **새로고침(↻)** 버튼을 누릅니다. 단축키·글자 모양 설정은 그대로 남습니다.
4. 열려 있는 블로그 탭을 `F5`로 새로고침합니다.

크롬 웹스토어에서 설치한 경우에는 이 과정 없이 크롬이 자동으로 업데이트합니다.

## 폴더 구성

| 폴더 | 내용 |
|---|---|
| `extension/` | 확장 프로그램 원본 (manifest.json 포함) |
| `guide/` | 설치방법(HTML·PDF·그림), 아임웹 블로그 점수 가이드 코드 |
| `update/version.json` | 확장이 확인하는 최신 버전 정보 (자동 생성) |
| `update/notes.txt` | 새 버전 알림에 보일 변경 내용 (직접 작성) |
| `update/remote-config.json` | 온라인 설정 — 재설치 없이 바로 반영되는 값 |
| `dist/` | 사용자용 zip (자동 생성) |
| `scripts/build.py` | zip·version.json을 만드는 스크립트 |
| `store/` | 크롬 웹스토어 등록용 소개 글·권한 설명·개인정보처리방침 |

## 새 버전 내보내기

1. `extension/` 안의 코드를 고칩니다.
2. `extension/manifest.json`의 `"version"`을 올립니다. (예: 1.5.0 → 1.5.1)
3. `update/notes.txt`에 바뀐 내용을 적습니다. 이 글이 사용자 알림 창에 그대로 보입니다.
4. main에 커밋합니다.

GitHub Actions가 zip과 `version.json`을 새로 만들어 커밋하고, 웹스토어 정보가 등록돼 있으면 웹스토어에도 올려 심사를 요청합니다. 진행 상황은 저장소의 **Actions** 탭에서 볼 수 있습니다.

## 온라인 설정 (remote-config.json)

네이버가 에디터 화면을 바꿔 버튼을 못 찾게 되면, 이 파일만 고쳐 커밋하면 됩니다. 사용자는 아무것도 다시 설치하지 않아도 6시간 안에(아이콘 창을 열면 바로) 반영됩니다. 실행 코드는 넣을 수 없고 아래 같은 데이터만 받습니다.

```json
{
  "schema": 1,
  "selectors": {
    "format": { "cls": ["se-text-format-toolbar-button"], "names": ["text-format"], "texts": ["본문"] },
    "quoteMenu": { "sel": "button[data-name=\"quotation\"][data-type=\"icon-select\"]" }
  },
  "partner": { "url": "https://link.coupang.com/a/..." }
}
```

`selectors`의 이름: format(본문/소제목 서식), font, size, bold, italic, underline, strike, color, bg, align, link, image, quote, quoteMenu, hr. 댓글 도우미의 댓글창은 cmtButton(댓글 열기 버튼), cmtInput(입력칸), cmtGuide(입력 안내), cmtSubmit(등록 버튼)에 `sel`로 넣습니다. 확장 아이콘 창의 **에디터 구조 정보 복사**나 댓글 도우미 창의 **진단 정보 복사**로 받은 내용을 보면 실제 버튼 이름을 알 수 있습니다.

## 크롬 웹스토어 자동 배포 설정 (한 번만)

웹스토어에서 설치한 사용자는 크롬이 알아서 업데이트합니다. 아래를 한 번 해 두면 이후에는 커밋만으로 웹스토어까지 올라갑니다.

1. **개발자 등록** — [Chrome Web Store 개발자 대시보드](https://chrome.google.com/webstore/devconsole)에 가입합니다. (등록비 5달러, 1회)
2. **첫 등록은 직접** — 저장소 **Actions** 탭의 최근 실행에서 `toyblock-extension-store-v…` 파일을 내려받아 압축을 한 번 풀면 나오는 zip을 대시보드의 **새 항목**에 올립니다. `store/listing.md`의 소개 글·권한 설명을 붙여 넣고, 개인정보처리방침 주소에는 `store/privacy.md`의 GitHub 주소를 넣습니다. 공개 범위는 **비공개(링크가 있는 사용자)**로 고르면 링크를 아는 사람만 설치할 수 있습니다.
3. **ID 확인** — 대시보드의 **게시자 > 설정**에서 Publisher ID를, 항목 주소에서 Extension ID(32자 영문)를 확인합니다.
4. **API 인증** — 둘 중 하나를 준비합니다.
   - *OAuth*: Google Cloud에서 Chrome Web Store API를 켜고, OAuth 클라이언트를 만든 뒤 [OAuth Playground](https://developers.google.com/oauthplayground)에서 범위 `https://www.googleapis.com/auth/chromewebstore`로 리프레시 토큰을 받습니다.
   - *서비스 계정*: Google Cloud에서 서비스 계정을 만들고 JSON 키를 받은 뒤, 서비스 계정 이메일을 웹스토어 대시보드의 **계정**에 추가합니다.
5. **GitHub에 등록** — 저장소 **Settings → Secrets and variables → Actions**에 아래 값을 넣습니다.

| 이름 | 값 |
|---|---|
| `CWS_PUBLISHER_ID` | 게시자 ID |
| `CWS_EXTENSION_ID` | 확장 ID |
| `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` | OAuth를 쓸 때 |
| `CWS_SERVICE_ACCOUNT_JSON` | 서비스 계정을 쓸 때 (JSON 키 전체) |

이후 `manifest.json` 버전을 올려 커밋할 때마다 웹스토어 심사가 자동으로 요청됩니다. 지금 버전을 바로 올리려면 Actions 탭에서 **toyblock-extension → Run workflow**를 누르고 "크롬 웹스토어에 지금 버전을 올리기"를 켜면 됩니다.

## 쿠팡 파트너스

확장 화면과 블로그 점수 가이드 하단의 쿠팡 배너는 쿠팡 파트너스 링크입니다.
이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.
