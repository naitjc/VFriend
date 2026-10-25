#!/usr/bin/env python3
"""Build Web and Android vector resources from the selected Conversation V geometry."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = json.loads((ROOT / 'design/brand/icon.json').read_text())
size = spec['viewport']
path = spec['symbolPath']
background = spec['backgroundColors']
foreground = spec['foregroundColors']
res = ROOT / 'qa-app/frontend-vue/android/app/src/main/res'


def write(relative, content):
    target = ROOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content + '\n', encoding='utf-8')


def resource(relative, content):
    write(str((res / relative).relative_to(ROOT)), '<?xml version="1.0" encoding="utf-8"?>\n' + content)


svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="VFriend">
<defs>
<linearGradient id="background" x2="0.3" y2="1"><stop stop-color="{background[0]}"/><stop offset="1" stop-color="{background[1]}"/></linearGradient>
<linearGradient id="emblem" x1="0.2" x2="0.8" y2="1"><stop stop-color="{foreground[0]}"/><stop offset="0.65" stop-color="{foreground[1]}"/><stop offset="1" stop-color="{foreground[2]}"/></linearGradient>
</defs>
<rect width="{size}" height="{size}" rx="260" fill="url(#background)"/>
<path d="{path}" fill="url(#emblem)" fill-rule="evenodd"/>
</svg>'''
write('design/brand/vfriend.svg', svg)
write('qa-app/frontend-vue/public/vfriend.svg', svg)

vector = f'''<vector xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt" android:width="108dp" android:height="108dp" android:viewportWidth="{size}" android:viewportHeight="{size}">
<path android:pathData="{path}" android:fillType="evenOdd">
<aapt:attr name="android:fillColor"><gradient android:type="linear" android:startX="300" android:startY="260" android:endX="980" android:endY="980">
<item android:offset="0" android:color="{foreground[0]}"/><item android:offset="0.65" android:color="{foreground[1]}"/><item android:offset="1" android:color="{foreground[2]}"/>
</gradient></aapt:attr></path></vector>'''
resource('drawable/vfriend_foreground.xml', vector)
resource('drawable/vfriend_monochrome.xml', f'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="{size}" android:viewportHeight="{size}"><path android:pathData="{path}" android:fillType="evenOdd" android:fillColor="#ffffff"/></vector>')
for filename, shape, corners in [('vfriend_background.xml', 'rectangle', ''), ('vfriend_legacy_background.xml', 'rectangle', '<corners android:radius="24dp"/>'), ('vfriend_round_background.xml', 'oval', '')]:
    resource('drawable/' + filename, f'<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="{shape}">{corners}<gradient android:angle="270" android:startColor="{background[0]}" android:endColor="{background[1]}"/></shape>')
for round_icon in [False, True]:
    name = 'ic_launcher_round.xml' if round_icon else 'ic_launcher.xml'
    legacy = 'vfriend_round_background' if round_icon else 'vfriend_legacy_background'
    resource('mipmap-anydpi/' + name, f'<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@drawable/{legacy}"/><item android:drawable="@drawable/vfriend_foreground"/></layer-list>')
    for api in [26, 33]:
        monochrome = '<monochrome android:drawable="@drawable/vfriend_monochrome"/>' if api >= 33 else ''
        resource(f'mipmap-anydpi-v{api}/' + name, f'<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/vfriend_background"/><foreground android:drawable="@drawable/vfriend_foreground"/>{monochrome}</adaptive-icon>')
resource('values/ic_launcher_background.xml', f'<resources><color name="ic_launcher_background">{background[1]}</color></resources>')
print('Generated VFriend Web, legacy, adaptive and monochrome icons.')
