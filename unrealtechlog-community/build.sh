#!/bin/bash
# utlc-community 폴더를 wp-admin 업로드용 zip으로 묶습니다.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/utlc-community.zip
find utlc-community -name '*.php' -print0 | xargs -0 -n1 php -l > /dev/null
zip -rq dist/utlc-community.zip utlc-community -x '*.DS_Store' '*/.git*'
echo "dist/utlc-community.zip ($(du -h dist/utlc-community.zip | cut -f1))"
