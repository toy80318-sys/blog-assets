# 토이블록 안내 페이지(아임웹) 자료

Supabase 함수 `toyblock-guide`가 처음 요청을 받을 때 이 폴더의 파일을 한 번 받아(이름 끝 지문 확인) Supabase `tb_assets` 표에 저장하고, 그다음부터는 Supabase에서 내보냅니다.

- `guide-app-<지문>.js` — 아임웹 코드 위젯이 불러오는 화면 스크립트
- `img/*-<지문>.webp` — 설치 단계 그림(실제 크롬 화면 캡처 + 윈도우 예시 그림)

안내 글(단계·문구)은 Supabase `tb_contents` 표의 `toyblock-install` 줄에 있습니다. 글만 고치면 아임웹 페이지에 바로 반영됩니다.
