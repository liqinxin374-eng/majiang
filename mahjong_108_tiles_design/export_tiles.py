import os
import json
import re

# 读取 mahjong-renderer.js 并解析渲染逻辑
with open('mahjong-renderer.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

output_dir = os.path.join(os.getcwd(), 'mahjong_tiles_archive')
os.makedirs(output_dir, exist_ok=True)

# 导入 python 版本的渲染生成器
colors = {
    'red': '#C82829',
    'green': '#0F7A40',
    'blue': '#1A568C',
    'black': '#222222',
    'gold': '#D4AF37'
}

def render_bamboo_stick(x, y, width, height, color=colors['green'], angle=0):
    hw = width / 2.0
    hh = height / 2.0
    return f'''
      <g transform="translate({x}, {y}) rotate({angle})">
        <rect x="-{hw}" y="-{hh}" width="{width}" height="{height}" rx="{width*0.3}" ry="{width*0.3}" fill="{color}" stroke="#06381C" stroke-width="0.8" />
        <line x1="-{hw*1.2}" y1="0" x2="{hw*1.2}" y2="0" stroke="#042211" stroke-width="1.8" stroke-linecap="round" />
        <line x1="-{hw*0.9}" y1="0" x2="{hw*0.9}" y2="0" stroke="#8BF3B7" stroke-width="0.8" stroke-linecap="round" />
        <line x1="-{hw*0.7}" y1="-{hh*0.6}" x2="{hw*0.7}" y2="-{hh*0.6}" stroke="rgba(255,255,255,0.3)" stroke-width="0.8" />
        <line x1="-{hw*0.7}" y1="{hh*0.6}" x2="{hw*0.7}" y2="{hh*0.6}" stroke="rgba(0,0,0,0.2)" stroke-width="0.8" />
      </g>'''

def render_single_dot(cx, cy, r, outer_color=colors['green'], center_color=colors['red']):
    inner_r = r * 0.55
    center_r = r * 0.22
    return f'''
      <g transform="translate({cx}, {cy})">
        <circle cx="0" cy="0" r="{r}" fill="{outer_color}" stroke="#06381C" stroke-width="0.6" />
        <circle cx="0" cy="0" r="{r * 0.85}" fill="none" stroke="#FFFFFF" stroke-width="0.8" stroke-dasharray="2,1.5" />
        <circle cx="0" cy="0" r="{inner_r}" fill="#FFFFFF" opacity="0.9" />
        <circle cx="0" cy="0" r="{center_r * 1.5}" fill="{center_color}" />
        <circle cx="0" cy="0" r="{center_r * 0.6}" fill="#FFFFFF" />
      </g>'''

def render_big_dot(cx=50, cy=67, r=38):
    g = colors['green']
    r_col = colors['red']
    petals = ""
    for i in range(16):
        import math
        angle = (i * 360 / 16) * math.pi / 180
        px = math.cos(angle) * (r * 0.92)
        py = math.sin(angle) * (r * 0.92)
        petals += f'<circle cx="{px:.2f}" cy="{py:.2f}" r="{r * 0.12}" fill="{r_col if i % 2 == 0 else g}" />'
    
    rays = ""
    for i in range(24):
        import math
        angle = (i * 360 / 24) * math.pi / 180
        x1 = math.cos(angle) * (r * 0.35)
        y1 = math.sin(angle) * (r * 0.35)
        x2 = math.cos(angle) * (r * 0.72)
        y2 = math.sin(angle) * (r * 0.72)
        rays += f'<line x1="{x1:.2f}" y1="{y1:.2f}" x2="{x2:.2f}" y2="{y2:.2f}" stroke="{r_col if i % 2 == 0 else g}" stroke-width="1.5" />'

    return f'''
      <g transform="translate({cx}, {cy})">
        <circle cx="0" cy="0" r="{r}" fill="{g}" stroke="#06381C" stroke-width="1" />
        <g>{petals}</g>
        <circle cx="0" cy="0" r="{r * 0.78}" fill="{r_col}" stroke="#FFFFFF" stroke-width="1" />
        <circle cx="0" cy="0" r="{r * 0.72}" fill="#FDFBF7" />
        <g>{rays}</g>
        <circle cx="0" cy="0" r="{r * 0.36}" fill="{g}" />
        <circle cx="0" cy="0" r="{r * 0.28}" fill="#FFFFFF" />
        <circle cx="0" cy="0" r="{r * 0.18}" fill="{r_col}" />
        <circle cx="0" cy="0" r="{r * 0.07}" fill="#FFFFFF" />
      </g>'''

def get_face_content(tile_type, num):
    g = colors['green']
    r = colors['red']
    b = colors['blue']
    
    if tile_type == 'wan':
        numbers = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
        char = numbers[num]
        return f'''
        <g class="tile-wan">
          <text x="50" y="38" font-family="'Kaiti', 'STKaiti', '楷体', serif" font-size="64" font-weight="900" fill="{b}" text-anchor="middle" dominant-baseline="central">{char}</text>
          <text x="50" y="93" font-family="'Kaiti', 'STKaiti', '楷体', serif" font-size="62" font-weight="900" fill="{r}" text-anchor="middle" dominant-baseline="central">萬</text>
        </g>'''

    elif tile_type == 'tiao':
        if num == 1:
            return '''
        <g class="tile-tiao-1">
          <path d="M 20 115 Q 50 110 80 118" stroke="#0F7A40" stroke-width="5" fill="none" stroke-linecap="round" />
          <path d="M 22 115 Q 50 110 78 118" stroke="#7BE3A4" stroke-width="1.5" fill="none" stroke-linecap="round" />
          <path d="M 25 115 Q 15 105 10 110 Q 18 116 25 115 Z" fill="#0F7A40" />
          <path d="M 75 116 Q 85 108 90 112 Q 82 118 75 116 Z" fill="#0F7A40" />
          <path d="M 32 95 Q 15 80 12 60 Q 22 72 35 85 Z" fill="#0F7A40" />
          <path d="M 30 100 Q 10 90 8 72 Q 20 82 32 92 Z" fill="#C82829" />
          <path d="M 34 102 Q 20 105 10 98 Q 22 96 34 98 Z" fill="#0F7A40" />
          <ellipse cx="48" cy="80" rx="16" ry="22" fill="#0F7A40" transform="rotate(-15 48 80)" />
          <ellipse cx="46" cy="82" rx="11" ry="17" fill="#8BF3B7" transform="rotate(-15 46 82)" />
          <path d="M 45 66 Q 58 75 52 92 Q 42 85 45 66 Z" fill="#C82829" />
          <circle cx="56" cy="50" r="11" fill="#0F7A40" />
          <path d="M 54 40 Q 52 26 44 22 Q 54 28 58 39 Z" fill="#C82829" />
          <path d="M 57 40 Q 60 25 54 20 Q 60 28 60 39 Z" fill="#D4AF37" />
          <circle cx="60" cy="48" r="3.5" fill="#FFFFFF" />
          <circle cx="61" cy="48" r="1.8" fill="#000000" />
          <path d="M 66 49 L 76 52 L 65 55 Z" fill="#D4AF37" />
          <path d="M 46 98 L 44 112 M 52 97 L 52 111 M 56 96 L 58 111" stroke="#D4AF37" stroke-width="2.5" stroke-linecap="round" />
        </g>'''
        
        w = 10.5
        hLong = 44
        sticks = ""
        if num == 2:
            sticks += render_bamboo_stick(50, 34, w, hLong, g)
            sticks += render_bamboo_stick(50, 100, w, hLong, g)
        elif num == 3:
            sticks += render_bamboo_stick(50, 30, w, 38, g)
            sticks += render_bamboo_stick(32, 98, w, hLong, g)
            sticks += render_bamboo_stick(68, 98, w, hLong, g)
        elif num == 4:
            sticks += render_bamboo_stick(32, 34, w, hLong, g)
            sticks += render_bamboo_stick(32, 100, w, hLong, g)
            sticks += render_bamboo_stick(68, 34, w, hLong, r)
            sticks += render_bamboo_stick(68, 100, w, hLong, r)
        elif num == 5:
            sticks += render_bamboo_stick(28, 34, w, 42, g)
            sticks += render_bamboo_stick(72, 34, w, 42, g)
            sticks += render_bamboo_stick(50, 67, w, 40, r)
            sticks += render_bamboo_stick(28, 100, w, 42, g)
            sticks += render_bamboo_stick(72, 100, w, 42, g)
        elif num == 6:
            sticks += render_bamboo_stick(28, 34, w, hLong, g)
            sticks += render_bamboo_stick(50, 34, w, hLong, g)
            sticks += render_bamboo_stick(72, 34, w, hLong, g)
            sticks += render_bamboo_stick(28, 100, w, hLong, g)
            sticks += render_bamboo_stick(50, 100, w, hLong, g)
            sticks += render_bamboo_stick(72, 100, w, hLong, g)
        elif num == 7:
            sticks += render_bamboo_stick(50, 20, w, 24, r, 0)
            sticks += render_bamboo_stick(28, 58, w, 32, g, 0)
            sticks += render_bamboo_stick(50, 58, w, 32, g, 0)
            sticks += render_bamboo_stick(72, 58, w, 32, g, 0)
            sticks += render_bamboo_stick(28, 102, w, 32, g, 0)
            sticks += render_bamboo_stick(50, 102, w, 32, g, 0)
            sticks += render_bamboo_stick(72, 102, w, 32, g, 0)
        elif num == 8:
            w8 = 10
            hVertical = 38
            hDiagonal = 46
            diagAngle = 34.4
            sticks += render_bamboo_stick(24, 37, w8, hVertical, g, 0)
            sticks += render_bamboo_stick(37, 37, w8, hDiagonal, g, -diagAngle)
            sticks += render_bamboo_stick(63, 37, w8, hDiagonal, g, diagAngle)
            sticks += render_bamboo_stick(76, 37, w8, hVertical, g, 0)
            sticks += render_bamboo_stick(24, 95, w8, hVertical, g, 0)
            sticks += render_bamboo_stick(37, 95, w8, hDiagonal, g, diagAngle)
            sticks += render_bamboo_stick(63, 95, w8, hDiagonal, g, -diagAngle)
            sticks += render_bamboo_stick(76, 95, w8, hVertical, g, 0)
        elif num == 9:
            rows = [28, 67, 106]
            cols_idx = [30, 50, 70]
            colors_matrix = [[g, r, g], [g, r, g], [g, r, g]]
            for rIdx in range(3):
                for cIdx in range(3):
                    sticks += render_bamboo_stick(cols_idx[cIdx], rows[rIdx], 10, 28, colors_matrix[rIdx][cIdx])
        return f'<g class="tile-tiao">{sticks}</g>'

    elif tile_type == 'bing':
        if num == 1:
            return f'<g class="tile-bing-1">{render_big_dot()}</g>'
        
        dots = ""
        if num == 2:
            dots += render_single_dot(50, 36, 16, g, r)
            dots += render_single_dot(50, 98, 16, r, g)
        elif num == 3:
            dots += render_single_dot(28, 32, 14, g, r)
            dots += render_single_dot(50, 67, 14, r, g)
            dots += render_single_dot(72, 102, 14, g, r)
        elif num == 4:
            dots += render_single_dot(30, 36, 15, g, r)
            dots += render_single_dot(70, 36, 15, r, g)
            dots += render_single_dot(30, 98, 15, r, g)
            dots += render_single_dot(70, 98, 15, g, r)
        elif num == 5:
            dots += render_single_dot(28, 32, 13, g, r)
            dots += render_single_dot(72, 32, 13, g, r)
            dots += render_single_dot(50, 67, 15, r, g)
            dots += render_single_dot(28, 102, 13, g, r)
            dots += render_single_dot(72, 102, 13, g, r)
        elif num == 6:
            dots += render_single_dot(32, 32, 13.5, g, r)
            dots += render_single_dot(68, 32, 13.5, g, r)
            dots += render_single_dot(32, 67, 13.5, r, g)
            dots += render_single_dot(68, 67, 13.5, r, g)
            dots += render_single_dot(32, 102, 13.5, r, g)
            dots += render_single_dot(68, 102, 13.5, r, g)
        elif num == 7:
            dots += render_single_dot(26, 26, 11, g, r)
            dots += render_single_dot(50, 38, 11, g, r)
            dots += render_single_dot(74, 50, 11, g, r)
            dots += render_single_dot(30, 78, 12, r, g)
            dots += render_single_dot(70, 78, 12, r, g)
            dots += render_single_dot(30, 106, 12, r, g)
            dots += render_single_dot(70, 106, 12, r, g)
        elif num == 8:
            dots += render_single_dot(30, 26, 11.5, g, r)
            dots += render_single_dot(70, 26, 11.5, g, r)
            dots += render_single_dot(30, 53, 11.5, g, r)
            dots += render_single_dot(70, 53, 11.5, g, r)
            dots += render_single_dot(30, 81, 11.5, r, g)
            dots += render_single_dot(70, 81, 11.5, r, g)
            dots += render_single_dot(30, 108, 11.5, r, g)
            dots += render_single_dot(70, 108, 11.5, r, g)
        elif num == 9:
            rows = [28, 67, 106]
            cols_idx = [21, 50, 79]
            for rIdx in range(3):
                for cIdx in range(3):
                    color_outer = r if cIdx == 1 else g
                    dots += render_single_dot(cols_idx[cIdx], rows[rIdx], 10.5, color_outer, g if cIdx == 1 else r)
        return f'<g class="tile-bing">{dots}</g>'

deck_data = []
tile_id = 1

categories = [
    ('wan', '万', 9),
    ('bing', '饼', 9),
    ('tiao', '条', 9)
]

for t_key, t_name, count in categories:
    for val in range(1, count + 1):
        for copy in range(1, 5):
            file_name = f"{t_key}_{val}_copy{copy}.svg"
            tile_name = f"{val}{t_name}"
            
            face_svg = get_face_content(t_key, val)
            
            full_tile_svg = f'''<svg viewBox="0 0 100 135" width="1000" height="1350" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="jadeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="60%" stop-color="#F2FAE9" />
      <stop offset="100%" stop-color="#E2EDE5" />
    </linearGradient>
  </defs>
  <!-- 麻将牌圆角白玉底座与立体厚度 -->
  <rect x="2" y="2" width="96" height="131" rx="7" ry="7" fill="url(#jadeGrad)" stroke="#FFFFFF" stroke-width="2" />
  <rect x="4" y="4" width="92" height="127" rx="5" ry="5" fill="none" stroke="#DCE8E0" stroke-width="1" />
  {face_svg}
</svg>'''

            file_path = os.path.join(output_dir, file_name)
            with open(file_path, 'w', encoding='utf-8') as svg_file:
                svg_file.write(full_tile_svg)
                
            deck_data.append({
                'id': tile_id,
                'type': t_key,
                'value': val,
                'copy': copy,
                'name': tile_name,
                'fileName': file_name,
                'svgContent': full_tile_svg
            })
            tile_id += 1

# 输出整套 108 张麻将 JSON 数据库
with open('mahjong_108_deck.json', 'w', encoding='utf-8') as json_file:
    json.dump(deck_data, json_file, ensure_ascii=False, indent=2)

print(f"Successfully generated {len(deck_data)} SVG tiles into directory: {output_dir}")
print(f"Successfully generated mahjong_108_deck.json")
