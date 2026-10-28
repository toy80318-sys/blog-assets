#!/usr/bin/env python3
"""토이블록 네이버 블로그 도우미 — 배포 패키지 만들기

만드는 것
  dist/toyblock-naver-blog-helper.zip   사용자용 압축 파일 (nbx 폴더 + 설치방법 + 아임웹 코드)
  dist/toyblock-extension-files.zip     폴더 설치본의 '지금 업데이트'가 받아 바꿔 넣는 확장 파일(맨 위에 manifest.json)
  build/toyblock-extension-store.zip    크롬 웹스토어 업로드용 (manifest.json이 맨 위, 폴더 설치본 전용 업데이트 파일 제외)
  update/version.json                   확장 프로그램이 확인하는 최신 버전 정보(files_url · files_sha256 포함)

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
# 폴더 설치본에서만 쓰는 온라인 업데이트 화면: 웹스토어 버전은 크롬이 업데이트하므로 넣지 않습니다
FOLDER_ONLY = {'update.html', 'update.js', 'selfupdate.js'}
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
            rel = os.path.relpath(f, EXT).replace(os.sep, '/')
            if rel in FOLDER_ONLY:
                continue
            add(z, f, rel)

    # 1-2) 폴더 설치본 온라인 업데이트용: 확장 파일 전부(맨 위에 manifest.json)
    files_tmp = os.path.join(BUILD, 'toyblock-extension-files.zip')
    with zipfile.ZipFile(files_tmp, 'w') as z:
        for f in files_under(EXT):
            add(z, f, os.path.relpath(f, EXT).replace(os.sep, '/'))
    files_bytes = open(files_tmp, 'rb').read()
    changed_files = write_if_changed(os.path.join(DIST, 'toyblock-extension-files.zip'), files_bytes)
    import hashlib
    files_sha = hashlib.sha256(files_bytes).hexdigest()

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
    # 웹스토어 정보(등록 뒤 update/store.json의 extension_id에 32자 ID를 적으면
    #   · 폴더 설치본이 '웹스토어로 옮기기' 안내를 띄우고
    #   · 윈도우 설치 프로그램(dist/toyblock-setup.exe)을 만듭니다)
    store_path = os.path.join(UPDATE, 'store.json')
    store = json.load(open(store_path, encoding='utf-8')) if os.path.exists(store_path) else {}
    ext_id = str(store.get('extension_id', '')).strip()
    if ext_id and not __import__('re').fullmatch(r'[a-p]{32}', ext_id):
        raise SystemExit('update/store.json의 extension_id는 a~p 32자여야 합니다: ' + ext_id)
    if ext_id and not store.get('store_url'):
        store['store_url'] = f'https://chromewebstore.google.com/detail/{ext_id}'
    info = {
        'name': manifest['name'],
        'version': version,
        'released_at': released,
        'notes': notes,
        'download_url': f'https://github.com/{REPO}/raw/{BRANCH}/toyblock-extension/dist/{PKG_NAME}.zip',
        'guide_url': f'https://github.com/{REPO}/blob/{BRANCH}/toyblock-extension/README.md#업데이트-방법',
        'store_url': store.get('store_url', ''),
        'files_url': f'https://raw.githubusercontent.com/{REPO}/{BRANCH}/toyblock-extension/dist/toyblock-extension-files.zip',
        'files_sha256': files_sha,
        'files_size': len(files_bytes),
    }
    changed_ver = write_if_changed(vpath, (json.dumps(info, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))

    # 4) 윈도우 설치 프로그램: 웹스토어 ID가 있고 makensis가 있을 때만
    changed_setup = False
    if ext_id:
        import shutil, subprocess
        if shutil.which('makensis'):
            out = os.path.join(BUILD, 'toyblock-setup.exe')
            subprocess.run(['makensis', '-V2', f'-DEXT_ID={ext_id}', f'-DVERSION={version}', f'-DOUTFILE={out}', os.path.join(ROOT, 'installer', 'toyblock-setup.nsi')], check=True)
            changed_setup = write_if_changed(os.path.join(DIST, 'toyblock-setup.exe'), open(out, 'rb').read())
        else:
            print('makensis가 없어 설치 프로그램은 건너뜁니다')

    print(f'version={version}')
    print(f'package_changed={str(changed_zip or changed_files).lower()}')
    print(f'version_json_changed={str(changed_ver).lower()}')
    print(f'setup_changed={str(changed_setup).lower()}')
    print(f'store_zip={store_zip}')
    gh_out = os.environ.get('GITHUB_OUTPUT')
    if gh_out:
        with open(gh_out, 'a', encoding='utf-8') as fh:
            fh.write(f'version={version}\nstore_zip={store_zip}\n')


if __name__ == '__main__':
    main()
