; 토이블록 네이버 블로그 도우미 — 윈도우 설치 프로그램
; 크롬 웹스토어에 등록된 토이블록을 크롬이 자동으로 설치하도록 등록합니다(크롬 공식 방식: 레지스트리 + 웹스토어 업데이트 주소).
; 설치 뒤에는 웹스토어 설치본이라 새 버전이 나오면 자동으로 업데이트됩니다.
; 만들기: makensis -DEXT_ID=<웹스토어 확장 ID 32자> -DVERSION=1.7.0 -DOUTFILE=toyblock-setup.exe toyblock-setup.nsi
Unicode true
!ifndef EXT_ID
  !error "EXT_ID(웹스토어 확장 ID)가 필요합니다"
!endif
!ifndef VERSION
  !define VERSION "1.0.0"
!endif
!ifndef OUTFILE
  !define OUTFILE "toyblock-setup.exe"
!endif
!define APPNAME "토이블록 네이버 블로그 도우미"
!define STORE_URL "https://chromewebstore.google.com/detail/${EXT_ID}"
!define UPDATE_URL "https://clients2.google.com/service/update2/crx"
!define EXT_KEY "Software\Google\Chrome\Extensions\${EXT_ID}"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ToyBlockNaverBlogHelper"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES\ToyBlock"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
Icon "toyblock.ico"
UninstallIcon "toyblock.ico"
BrandingText "토이블록 · 빅픽쳐랩"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1042 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1042 "FileDescription" "${APPNAME} 설치"
VIAddVersionKey /LANG=1042 "CompanyName" "빅픽쳐랩"
VIAddVersionKey /LANG=1042 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1042 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1042 "LegalCopyright" "빅픽쳐랩"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!define MUI_ICON "toyblock.ico"
!define MUI_UNICON "toyblock.ico"
!define MUI_WELCOMEPAGE_TITLE "토이블록 설치를 시작할게요"
!define MUI_WELCOMEPAGE_TEXT "네이버 블로그 글쓰기 단축키, 블로그 점수·검색 노출 분석, 이웃 댓글 도우미를 크롬에 설치합니다.$\r$\n$\r$\n크롬 웹스토어의 공식 토이블록이 설치되며, 새 버전이 나오면 자동으로 업데이트돼요.$\r$\n$\r$\n설치가 끝나면 크롬에서 '확장 프로그램 사용 설정'을 한 번 눌러 주세요."
!define MUI_FINISHPAGE_TITLE "등록을 마쳤어요"
!define MUI_FINISHPAGE_TEXT "크롬을 다시 열면 '새 확장 프로그램이 추가됨' 안내가 떠요. '확장 프로그램 사용 설정'을 누르면 바로 쓸 수 있어요.$\r$\n$\r$\n지금 바로 쓰려면 아래 웹스토어 페이지에서 'Chrome에 추가'를 눌러도 돼요."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "웹스토어 페이지 열기(바로 설치)"
!define MUI_FINISHPAGE_RUN_FUNCTION OpenStore
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"

Function OpenStore
  ExecShell "open" "${STORE_URL}"
FunctionEnd

; 크롬이 깔려 있는지(시스템 또는 사용자 설치)
Function .onInit
  ClearErrors
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  ${If} $0 == ""
    ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe" ""
  ${EndIf}
  ${If} $0 == ""
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "이 PC에서 크롬을 찾지 못했어요. 토이블록은 크롬 확장 프로그램이라 크롬이 필요해요.$\r$\n$\r$\n크롬 내려받기 페이지를 열까요?" IDNO +2
    ExecShell "open" "https://www.google.com/chrome/"
    Abort
  ${EndIf}
FunctionEnd

Section "토이블록" SecMain
  ; 크롬이 읽는 위치(64비트 윈도우에서는 Wow6432Node)와 사용자 위치 두 곳에 등록합니다
  SetRegView 32
  WriteRegStr HKLM "${EXT_KEY}" "update_url" "${UPDATE_URL}"
  SetRegView 64
  WriteRegStr HKCU "${EXT_KEY}" "update_url" "${UPDATE_URL}"
  DetailPrint "크롬에 토이블록을 등록했어요 (${EXT_ID})"

  SetOutPath "$INSTDIR"
  File "toyblock.ico"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "빅픽쳐랩"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\toyblock.ico"
  WriteRegStr HKLM "${UNINST_KEY}" "URLInfoAbout" "${STORE_URL}"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetRegView 32
  DeleteRegKey HKLM "${EXT_KEY}"
  SetRegView 64
  DeleteRegKey HKCU "${EXT_KEY}"
  DeleteRegKey HKLM "${UNINST_KEY}"
  Delete "$INSTDIR\toyblock.ico"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  MessageBox MB_OK|MB_ICONINFORMATION "크롬 등록을 지웠어요. 크롬을 다시 열면 토이블록이 제거돼요.$\r$\n(크롬 확장 프로그램 관리(chrome://extensions)에서 바로 삭제해도 돼요.)"
SectionEnd
