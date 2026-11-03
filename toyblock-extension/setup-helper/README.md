# 토이블록 설치 도우미 (윈도우)

`ToyBlock-Setup.exe`를 더블클릭하면:

1. 최신 버전 정보(`update/version.json`)를 읽고, 확장 파일 묶음(`dist/toyblock-extension-files.zip`)을 받아 SHA-256 지문을 확인합니다.
2. 이미 크롬·웨일·엣지에 폴더로 설치된 토이블록이 있으면 그 폴더를, 없으면 `내 폴더\ToyBlock\nbx`에 파일을 풉니다(업데이트도 같은 방식).
3. 폴더 경로를 클립보드에 복사하고 `chrome://extensions` 화면을 엽니다.
4. 남은 세 단계(개발자 모드 켜기 → 압축해제된 확장 프로그램 로드 → 폴더 칸에 Ctrl+V)를 안내합니다.

크롬 정책상 웹스토어 밖의 확장을 '켜는' 마지막 단계는 사용자가 직접 눌러야 합니다.
항상 최신 버전을 받아 오므로 확장 버전이 올라가도 이 실행 파일은 다시 만들 필요가 없습니다.

다시 만들기(리눅스에서):

```
go-winres simply --arch amd64 --icon ../installer/toyblock.ico --manifest cli --product-name "토이블록 설치 도우미" --original-filename ToyBlock-Setup.exe
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o ToyBlock-Setup.exe .
```

코드 서명이 없어 처음 실행할 때 "Windows의 PC 보호" 창이 뜰 수 있습니다. [추가 정보] → [실행]을 누르면 됩니다.
