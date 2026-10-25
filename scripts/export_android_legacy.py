#!/usr/bin/env python3
"""Export a legacy debuggable Android installation without uninstalling it."""
import argparse
import datetime
import json
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile


def export_database(database, destination):
    connection = sqlite3.connect(str(database))
    connection.row_factory = sqlite3.Row
    try:
        relationships = [dict(row) for row in connection.execute('SELECT * FROM relationships')]
        conversations = [dict(row) for row in connection.execute('SELECT * FROM conversations')]
    finally:
        connection.close()
    characters = {}
    for row in relationships:
        character = json.loads(row['character_snapshot_json'])
        if character.get('basicInfo', {}).get('name'):
            character['id'] = character.get('id') or row['character_id'] or row['character_name']
            characters[character['id']] = character
    data = {
        'format': 'chat-rp-backup', 'version': 1,
        'exportedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'relationships': relationships, 'conversations': conversations,
        'customCharacters': list(characters.values()),
    }
    destination.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return len(relationships)


def main():
    parser = argparse.ArgumentParser(description='从旧版调试 APK 导出完整存档，不卸载旧应用、不读取 API Key。请先结束手机上正在生成的回复。')
    parser.add_argument('--serial', help='多台设备连接时指定 adb 序列号')
    parser.add_argument('--output', default='android-legacy-backups', help='电脑上的备份目录')
    parser.add_argument('--push', action='store_true', help='同时把 JSON 复制到这台手机的 Download 目录，便于新版导入')
    args = parser.parse_args()
    adb = shutil.which('adb')
    if not adb:
        candidate = pathlib.Path('/opt/homebrew/share/android-commandlinetools/platform-tools/adb')
        if candidate.exists():
            adb = str(candidate)
    if not adb:
        parser.error('找不到 adb，请先安装 Android Platform Tools。')
    devices = subprocess.run([adb, 'devices'], check=True, capture_output=True, text=True).stdout
    ready = [line.split()[0] for line in devices.splitlines()[1:] if line.strip().endswith('\tdevice')]
    serial = args.serial or (ready[0] if len(ready) == 1 else None)
    if serial not in ready:
        parser.error('请连接一台已授权 USB 调试的手机；连接多台时使用 --serial。')
    command = [adb, '-s', serial]

    def run(*arguments, optional=False):
        result = subprocess.run([*command, *arguments], capture_output=True)
        if result.returncode and not optional:
            raise RuntimeError(result.stderr.decode('utf-8', errors='replace').strip() or 'ADB 操作失败')
        return result

    # Check debug access before changing the running state of the old application.
    run('shell', 'run-as', 'com.naitjc.chatrp', 'id')
    run('shell', 'am', 'force-stop', 'com.naitjc.chatrp')
    listing = run('shell', 'run-as', 'com.naitjc.chatrp', 'ls', 'databases').stdout.decode().split()
    name = next((name for name in listing if name == 'chat_rpSQLite.db'), None)
    if not name:
        raise RuntimeError('旧应用中没有找到 chat_rpSQLite.db，未修改任何存档。')
    stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f')
    target = pathlib.Path(args.output).expanduser().resolve() / stamp
    target.mkdir(parents=True, exist_ok=False)
    database = target / name
    database.write_bytes(run('exec-out', 'run-as', 'com.naitjc.chatrp', 'cat', f'databases/{name}').stdout)
    for suffix in ['-wal', '-shm']:
        if name + suffix in listing:
            (target / (name + suffix)).write_bytes(run('exec-out', 'run-as', 'com.naitjc.chatrp', 'cat', f'databases/{name}{suffix}').stdout)
    # Query a copy so the original captured database and WAL remain intact.
    with tempfile.TemporaryDirectory() as working:
        for source in target.iterdir():
            shutil.copy2(source, pathlib.Path(working) / source.name)
        destination = target / f'VFriend-旧版完整备份-{stamp}.json'
        count = export_database(pathlib.Path(working) / name, destination)
    print(f'已导出 {count} 个存档：{destination}')
    print('旧应用及原存档仍然保留。模型 API Key 不包含在备份中。')
    if args.push:
        remote = f'/sdcard/Download/{destination.name}'
        run('push', str(destination), remote)
        print(f'已复制到手机：{remote}')
    print('安装“VFriend”后，打开“更多 → 导入备份”选择此 JSON。')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, sqlite3.Error) as error:
        print(f'导出失败：{error}', file=sys.stderr)
        sys.exit(1)
