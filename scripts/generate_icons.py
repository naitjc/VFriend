#!/usr/bin/env python3
"""Build Web and Android brand resources from one vector source."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = json.loads((ROOT / 'design/brand/icon.json').read_text())
size = spec['viewport']
center = size / 2
scale = spec.get('symbolScale', 1)
symbol = spec['symbolPath']
res = ROOT / 'qa-app/frontend-vue/android/app/src/main/res'
namespace = 'xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"'
vector = f'<vector {namespace} android:width="108dp" android:height="108dp" android:viewportWidth="{size}" android:viewportHeight="{size}">'
definitions = []


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content + '\n', encoding='utf-8')


def resource(relative, content):
    write(res / relative, '<?xml version="1.0" encoding="utf-8"?>\n' + content)


def layers(items, prefix):
    """Render identical path, gradient, opacity and clipping data for both platforms."""
    svg, android = [], []
    for index, item in enumerate(items):
        key = f'{prefix}{index}'
        path = item['path']
        opacity = item.get('opacity', 1)
        fill = item.get('color', '#ffffff')
        android_fill = f'android:fillColor="{fill}"'
        gradient = ''
        if colors := item.get('colors'):
            x1, y1, x2, y2 = item.get('gradient', [0, 0, size, size])
            stops = [(i / (len(colors) - 1), color) for i, color in enumerate(colors)]
            definitions.append(f'<linearGradient id="{key}" gradientUnits="userSpaceOnUse" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">' + ''.join(f'<stop offset="{offset}" stop-color="{color}"/>' for offset, color in stops) + '</linearGradient>')
            fill = f'url(#{key})'
            android_fill = ''
            gradient = f'<aapt:attr name="android:fillColor"><gradient android:type="linear" android:startX="{x1}" android:startY="{y1}" android:endX="{x2}" android:endY="{y2}">' + ''.join(f'<item android:offset="{offset}" android:color="{color}"/>' for offset, color in stops) + '</gradient></aapt:attr>'
        svg_path = f'<path d="{path}" fill="{fill}" opacity="{opacity}"/>'
        android_path = f'<path android:pathData="{path}" android:fillAlpha="{opacity}" {android_fill}>{gradient}</path>'
        if clip := item.get('clipPath'):
            definitions.append(f'<clipPath id="{key}clip"><path d="{clip}"/></clipPath>')
            svg_path = f'<g clip-path="url(#{key}clip)">{svg_path}</g>'
            android_path = f'<group><clip-path android:pathData="{clip}"/>{android_path}</group>'
        svg.append(svg_path)
        android.append(android_path)
    return ''.join(svg), ''.join(android)


square = f'M0,0 H{size} V{size} H0 Z'
background_svg, background_android = layers([
    {'path': square, 'colors': spec['backgroundColors'], 'gradient': spec['backgroundGradient']},
    *spec.get('backgroundLayers', []),
], 'bg')
foreground_svg, foreground_android = layers(spec['foregroundLayers'], 'fg')
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" role="img" aria-label="VFriend">
<defs>{''.join(definitions)}<clipPath id="tile"><rect width="{size}" height="{size}" rx="260"/></clipPath></defs>
<g clip-path="url(#tile)">{background_svg}</g>
<g transform="translate({center} {center}) scale({scale}) translate(-{center} -{center})">{foreground_svg}</g>
</svg>'''
write(ROOT / 'design/brand/vfriend.svg', svg)
write(ROOT / 'qa-app/frontend-vue/public/vfriend.svg', svg)

transform = f'<group android:pivotX="{center}" android:pivotY="{center}" android:scaleX="{scale}" android:scaleY="{scale}">'
resource('drawable/vfriend_foreground.xml', vector + transform + foreground_android + '</group></vector>')
resource('drawable/vfriend_monochrome.xml', vector + transform + f'<path android:pathData="{symbol}" android:fillColor="#ffffff"/></group></vector>')
resource('drawable/vfriend_background.xml', vector + background_android + '</vector>')
rounded = 'M260,0 H994 A260,260 0,0 1,1254,260 V994 A260,260 0,0 1,994,1254 H260 A260,260 0,0 1,0,994 V260 A260,260 0,0 1,260,0 Z'
circle = f'M0,{center} A{center},{center} 0,1 0,{size},{center} A{center},{center} 0,1 0,0,{center} Z'
for filename, clip in [('vfriend_legacy_background.xml', rounded), ('vfriend_round_background.xml', circle)]:
    resource('drawable/' + filename, vector + f'<group><clip-path android:pathData="{clip}"/>' + background_android + '</group></vector>')
for round_icon in [False, True]:
    name = 'ic_launcher_round.xml' if round_icon else 'ic_launcher.xml'
    legacy = 'vfriend_round_background' if round_icon else 'vfriend_legacy_background'
    resource('mipmap-anydpi/' + name, f'<layer-list xmlns:android="http://schemas.android.com/apk/res/android"><item android:drawable="@drawable/{legacy}"/><item android:drawable="@drawable/vfriend_foreground"/></layer-list>')
    for api in [26, 33]:
        monochrome = '<monochrome android:drawable="@drawable/vfriend_monochrome"/>' if api >= 33 else ''
        resource(f'mipmap-anydpi-v{api}/' + name, f'<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/vfriend_background"/><foreground android:drawable="@drawable/vfriend_foreground"/>{monochrome}</adaptive-icon>')
resource('values/ic_launcher_background.xml', f'<resources><color name="ic_launcher_background">{spec["splashColor"]}</color></resources>')
print('Generated VFriend Web, legacy, adaptive and monochrome icons.')
