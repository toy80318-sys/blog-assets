#!/usr/bin/env python3
"""토이블록 네이버 블로그 도우미 — 배포 패키지 만들기

만드는 것
  dist/toyblock-naver-blog-helper.zip   사용자용 압축 파일 (nbx 폴더 + 설치방법 + 아임웹 코드)
  build/toyblock-extension-store.zip    크롬 웹스토어 업로드용 (manifest.json이 맨 위)
  update/version.json                   확장 프로그램이 확인하는 최신 버전 정보

같은 내용이면 zip이 바이트 단위로 같게 만들어(파일 시각 고정) 불필요한 커밋이 생기지 않게 합니다.
"""
import json
import os
import zipfile
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(ROOT, 'extension')
GUIDE = os.path.join(ROOT, 'guide')
DIST = os.path.join(ROOT, 'dist')
BUILD = os.path.join(ROOT, 'build')
UPDATE = os.path.join(ROOT, 'update')

REPO = 'toy80318-sys/blog-assets'
BRANCH = 'main'
PKG_NAME = 'toyblock-naver-blog-helper'
FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def files_under(base):
    out = []
    for d, dirs, fs in os.walk(base):
        dirs.sort()
        for f in sorted(fs):
            if f.startswith('.'):
                continue
            out.append(os.path.join(d, f))
    return out


def add(z, src, arc):
    info = zipfile.ZipInfo(arc, date_time=FIXED_TIME)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    with open(src, 'rb') as fh:
        z.writestr(info, fh.read())


def write_if_changed(path, data):
    old = open(path, 'rb').read() if os.path.exists(path) else None
    if old != data:
        with open(path, 'wb') as fh:
            fh.write(data)
        return True
    return False


def main():
    manifest = json.load(open(os.path.join(EXT, 'manifest.json'), encoding='utf-8'))
    version = manifest['version']
    os.makedirs(DIST, exist_ok=True)
    os.makedirs(BUILD, exist_ok=True)

    # 1) 웹스토어 업로드용: manifest.json이 zip 맨 위
    store_zip = os.path.join(BUILD, 'toyblock-extension-store.zip')
    with zipfile.ZipFile(store_zip, 'w') as z:
        for f in files_under(EXT):
            add(z, f, os.path.relpath(f, EXT).replace(os.sep, '/'))

    # 2) 사용자용: toyblock-naver-blog-helper/nbx + 설치방법 + 아임웹 코드
    tmp = os.path.join(BUILD, PKG_NAME + '.zip')
    with zipfile.ZipFile(tmp, 'w') as z:
        for f in files_under(EXT):
            add(z, f, f'{PKG_NAME}/nbx/' + os.path.relpath(f, EXT).replace(os.sep, '/'))
        for f in files_under(GUIDE):
            add(z, f, f'{PKG_NAME}/' + os.path.relpath(f, GUIDE).replace(os.sep, '/'))
    changed_zip = write_if_changed(os.path.join(DIST, PKG_NAME + '.zip'), open(tmp, 'rb').read())

    # 3) 최신 버전 정보: 버전이 바뀔 때만 발표 시각을 새로 씁니다
    vpath = os.path.join(UPDATE, 'version.json')
    prev = json.load(open(vpath, encoding='utf-8')) if os.path.exists(vpath) else {}
    notes_path = os.path.join(UPDATE, 'notes.txt')
    notes = open(notes_path, encoding='utf-8').read().strip() if os.path.exists(notes_path) else ''
    released = prev.get('released_at') if prev.get('version') == version else datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    info = {
        'name': manifest['name'],
        'version': version,
        'released_at': released,
        'notes': notes,
        'download_url': f'https://github.com/{REPO}/raw/{BRANCH}/toyblock-extension/dist/{PKG_NAME}.zip',
        'guide_url': f'https://github.com/{REPO}/blob/{BRANCH}/toyblock-extension/README.md#업데이트-방법',
    }
    changed_ver = write_if_changed(vpath, (json.dumps(info, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))

    print(f'version={version}')
    print(f'package_changed={str(changed_zip).lower()}')
    print(f'version_json_changed={str(changed_ver).lower()}')
    print(f'store_zip={store_zip}')
    gh_out = os.environ.get('GITHUB_OUTPUT')
    if gh_out:
        with open(gh_out, 'a', encoding='utf-8') as fh:
            fh.write(f'version={version}\nstore_zip={store_zip}\n')


if __name__ == '__main__':
    main()
