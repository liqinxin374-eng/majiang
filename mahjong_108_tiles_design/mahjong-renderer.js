/**
 * Mahjong Tile SVG Renderer
 * Renders authentic Mahjong tile SVG markup for Wan, Suo/Tiao, and Bing/Tong tiles.
 */

const MahjongRenderer = {
  // Color Palette
  colors: {
    red: '#C82829',
    green: '#0F7A40',
    blue: '#1A568C',
    black: '#222222',
    gold: '#D4AF37'
  },

  /**
   * Main render entry point
   * @param {string} type - 'wan', 'tiao', 'bing', 'feng', 'dragon'
   * @param {number|string} value - 1-9 or wind/dragon name
   * @returns {string} SVG HTML string
   */
  renderTileFace(type, value) {
    const svgHeader = `<svg viewBox="0 0 100 135" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
    const svgFooter = `</svg>`;
    let content = '';

    switch (type) {
      case 'wan':
        content = this.renderWan(value);
        break;
      case 'tiao':
      case 'suo':
        content = this.renderTiao(parseInt(value, 10));
        break;
      case 'bing':
      case 'tong':
        content = this.renderBing(parseInt(value, 10));
        break;
      case 'feng':
        content = this.renderFeng(value);
        break;
      case 'dragon':
        content = this.renderDragon(value);
        break;
      default:
        content = '';
    }

    return `${svgHeader}${content}${svgFooter}`;
  },

  // ---------------------------------------------------------------------------
  // WAN (万字牌)
  // ---------------------------------------------------------------------------
  renderWan(num) {
    const numbers = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const char = numbers[num] || num;
    // 上方数字：雕刻绀蓝色，下方“萬”字：大红色
    const numColor = this.colors.blue;

    // 极致放大字号，将边缘留白压缩至最小
    return `
      <g class="tile-wan">
        <!-- 上数字 (极具雕刻感的64px大字号, 绀蓝色) -->
        <text x="50" y="38" 
              font-family="'Kaiti', 'STKaiti', '楷体', 'Microsoft YaHei', serif" 
              font-size="64" 
              font-weight="900" 
              fill="${numColor}" 
              text-anchor="middle" 
              dominant-baseline="central"
              style="filter: drop-shadow(0.6px 0.6px 0px rgba(0,0,0,0.18));">
          ${char}
        </text>
        <!-- 下“萬”字 (极具雕刻感的62px大字号, 大红色) -->
        <text x="50" y="93" 
              font-family="'Kaiti', 'STKaiti', '楷体', 'Microsoft YaHei', serif" 
              font-size="62" 
              font-weight="900" 
              fill="${this.colors.red}" 
              text-anchor="middle" 
              dominant-baseline="central"
              style="filter: drop-shadow(0.6px 0.6px 0px rgba(0,0,0,0.18));">
          萬
        </text>
      </g>
    `;
  },

  // ---------------------------------------------------------------------------
  // TIAO / SUO (索/条字牌)
  // ---------------------------------------------------------------------------
  // 单个竹节 SVG 生成
  renderBambooStick(x, y, width, height, color = this.colors.green, angle = 0) {
    const hw = width / 2;
    const hh = height / 2;
    return `
      <g transform="translate(${x}, ${y}) rotate(${angle})">
        <!-- 竹节主体 -->
        <rect x="-${hw}" y="-${hh}" width="${width}" height="${height}" rx="${width*0.3}" ry="${width*0.3}" 
              fill="${color}" stroke="#06381C" stroke-width="0.8" />
        <!-- 竹节中间节点圈 -->
        <line x1="-${hw*1.2}" y1="0" x2="${hw*1.2}" y2="0" stroke="#042211" stroke-width="1.8" stroke-linecap="round" />
        <line x1="-${hw*0.9}" y1="0" x2="${hw*0.9}" y2="0" stroke="#8BF3B7" stroke-width="0.8" stroke-linecap="round" />
        <!-- 竹节上下端线纹 -->
        <line x1="-${hw*0.7}" y1="-${hh*0.6}" x2="${hw*0.7}" y2="-${hh*0.6}" stroke="rgba(255,255,255,0.3)" stroke-width="0.8" />
        <line x1="-${hw*0.7}" y1="${hh*0.6}" x2="${hw*0.7}" y2="${hh*0.6}" stroke="rgba(0,0,0,0.2)" stroke-width="0.8" />
      </g>
    `;
  },

  renderTiao(num) {
    if (num === 1) {
      // 1条 (幺鸡 / 精美雀鸟立于竹上)
      return `
        <g class="tile-tiao-1">
          <!-- 竹枝底座 -->
          <path d="M 20 115 Q 50 110 80 118" stroke="${this.colors.green}" stroke-width="5" fill="none" stroke-linecap="round" />
          <path d="M 22 115 Q 50 110 78 118" stroke="#7BE3A4" stroke-width="1.5" fill="none" stroke-linecap="round" />
          <!-- 竹叶 -->
          <path d="M 25 115 Q 15 105 10 110 Q 18 116 25 115 Z" fill="${this.colors.green}" />
          <path d="M 75 116 Q 85 108 90 112 Q 82 118 75 116 Z" fill="${this.colors.green}" />
          
          <!-- 雀鸟身体 -->
          <!-- 尾羽 -->
          <path d="M 32 95 Q 15 80 12 60 Q 22 72 35 85 Z" fill="${this.colors.green}" />
          <path d="M 30 100 Q 10 90 8 72 Q 20 82 32 92 Z" fill="${this.colors.red}" />
          <path d="M 34 102 Q 20 105 10 98 Q 22 96 34 98 Z" fill="${this.colors.green}" />
          
          <!-- 腹部与背部 -->
          <ellipse cx="48" cy="80" rx="16" ry="22" fill="${this.colors.green}" transform="rotate(-15 48 80)" />
          <ellipse cx="46" cy="82" rx="11" ry="17" fill="#8BF3B7" transform="rotate(-15 46 82)" />
          <!-- 红胸襟 -->
          <path d="M 45 66 Q 58 75 52 92 Q 42 85 45 66 Z" fill="${this.colors.red}" />
          
          <!-- 头部 -->
          <circle cx="56" cy="50" r="11" fill="${this.colors.green}" />
          <!-- 冠羽 -->
          <path d="M 54 40 Q 52 26 44 22 Q 54 28 58 39 Z" fill="${this.colors.red}" />
          <path d="M 57 40 Q 60 25 54 20 Q 60 28 60 39 Z" fill="${this.colors.gold}" />
          <!-- 眼睛 -->
          <circle cx="60" cy="48" r="3.5" fill="#FFFFFF" />
          <circle cx="61" cy="48" r="1.8" fill="#000000" />
          <!-- 鸟喙 -->
          <path d="M 66 49 L 76 52 L 65 55 Z" fill="${this.colors.gold}" />
          
          <!-- 爪子 -->
          <path d="M 46 98 L 44 112 M 52 97 L 52 111 M 56 96 L 58 111" stroke="${this.colors.gold}" stroke-width="2.5" stroke-linecap="round" />
        </g>
      `;
    }

    const g = this.colors.green;
    const r = this.colors.red;
    let sticks = '';

    const w = 10.5; // 竹节宽度
    const hLong = 44; // 加长版竹节高度 (原 32/34 -> 44)

    switch (num) {
      case 2:
        // 二条：加长竹节至44px，上下间隔20px，绝不重叠
        sticks += this.renderBambooStick(50, 34, w, hLong, g);
        sticks += this.renderBambooStick(50, 100, w, hLong, g);
        break;
      case 3:
        sticks += this.renderBambooStick(50, 30, w, 38, g);
        sticks += this.renderBambooStick(32, 98, w, hLong, g);
        sticks += this.renderBambooStick(68, 98, w, hLong, g);
        break;
      case 4:
        // 四条：加长竹节，左2绿，右2红
        sticks += this.renderBambooStick(32, 34, w, hLong, g);
        sticks += this.renderBambooStick(32, 100, w, hLong, g);
        sticks += this.renderBambooStick(68, 34, w, hLong, r);
        sticks += this.renderBambooStick(68, 100, w, hLong, r);
        break;
      case 5:
        // 五条：四角加长至42px，中间红加长至40px
        sticks += this.renderBambooStick(28, 34, w, 42, g);
        sticks += this.renderBambooStick(72, 34, w, 42, g);
        sticks += this.renderBambooStick(50, 67, w, 40, r);
        sticks += this.renderBambooStick(28, 100, w, 42, g);
        sticks += this.renderBambooStick(72, 100, w, 42, g);
        break;
      case 6:
        // 六条：加长竹节至44px，上3绿下3绿，中央留出清晰断层
        sticks += this.renderBambooStick(28, 34, w, hLong, g);
        sticks += this.renderBambooStick(50, 34, w, hLong, g);
        sticks += this.renderBambooStick(72, 34, w, hLong, g);

        sticks += this.renderBambooStick(28, 100, w, hLong, g);
        sticks += this.renderBambooStick(50, 100, w, hLong, g);
        sticks += this.renderBambooStick(72, 100, w, hLong, g);
        break;
      case 7:
        // 七条（按用户需求设计）：顶部1个红色居中竹节 + 下方压缩版的6条(上3绿下3绿)
        // 1. 最顶端 1 个红色竹节 (居中)
        sticks += this.renderBambooStick(50, 20, w, 24, r, 0);

        // 2. 中层 3 个竖直绿竹节
        sticks += this.renderBambooStick(28, 58, w, 32, g, 0);
        sticks += this.renderBambooStick(50, 58, w, 32, g, 0);
        sticks += this.renderBambooStick(72, 58, w, 32, g, 0);

        // 3. 底层 3 个竖直绿竹节
        sticks += this.renderBambooStick(28, 102, w, 32, g, 0);
        sticks += this.renderBambooStick(50, 102, w, 32, g, 0);
        sticks += this.renderBambooStick(72, 102, w, 32, g, 0);
        break;
      case 8:
        // 八条（无缝连贯构型）：顶点精确对齐，M 与 W 节点的端点完全无缝连接，展现一笔画成的连贯质感
        const w8 = 10;
        const hVertical = 38;
        const hDiagonal = 46;
        const diagAngle = 34.4; // atan2(26, 38) 的精确角度

        // 上半部分 M 形 (4笔无缝连贯：(24,18) -> (50,56) -> (76,18))
        sticks += this.renderBambooStick(24, 37, w8, hVertical, g, 0);          // 左竖腿
        sticks += this.renderBambooStick(37, 37, w8, hDiagonal, g, -diagAngle); // 左斜接腿
        sticks += this.renderBambooStick(63, 37, w8, hDiagonal, g, diagAngle);  // 右斜接腿
        sticks += this.renderBambooStick(76, 37, w8, hVertical, g, 0);          // 右竖腿

        // 下半部分 W 形 (4笔无缝连贯：(24,114) -> (50,76) -> (76,114))
        sticks += this.renderBambooStick(24, 95, w8, hVertical, g, 0);          // 左竖腿
        sticks += this.renderBambooStick(37, 95, w8, hDiagonal, g, diagAngle);   // 左斜接腿
        sticks += this.renderBambooStick(63, 95, w8, hDiagonal, g, -diagAngle);  // 右斜接腿
        sticks += this.renderBambooStick(76, 95, w8, hVertical, g, 0);          // 右竖腿
        break;
      case 9:
        // 九条：单个竹节加长至 28px，维持11px安全间隔
        const rows = [28, 67, 106];
        const cols = [30, 50, 70];
        const colors = [
          [g, r, g],
          [g, r, g],
          [g, r, g]
        ];
        for (let rIdx = 0; rIdx < 3; rIdx++) {
          for (let cIdx = 0; cIdx < 3; cIdx++) {
            sticks += this.renderBambooStick(cols[cIdx], rows[rIdx], 10, 28, colors[rIdx][cIdx]);
          }
        }
        break;
    }

    return `<g class="tile-tiao">${sticks}</g>`;
  },

  // ---------------------------------------------------------------------------
  // BING / TONG (饼/筒字牌)
  // ---------------------------------------------------------------------------
  // 单个筒子 (饼圈) SVG 生成
  renderSingleDot(cx, cy, r, outerColor = this.colors.green, centerColor = this.colors.red) {
    const innerR = r * 0.55;
    const centerR = r * 0.22;
    return `
      <g transform="translate(${cx}, ${cy})">
        <!-- 外齿轮/花瓣轮廓圈 -->
        <circle cx="0" cy="0" r="${r}" fill="${outerColor}" stroke="#06381C" stroke-width="0.6" />
        <!-- 内部雕纹环 -->
        <circle cx="0" cy="0" r="${r * 0.85}" fill="none" stroke="#FFFFFF" stroke-width="0.8" stroke-dasharray="2,1.5" />
        <circle cx="0" cy="0" r="${innerR}" fill="#FFFFFF" opacity="0.9" />
        <!-- 中心红/绿点与雕花 -->
        <circle cx="0" cy="0" r="${centerR * 1.5}" fill="${centerColor}" />
        <circle cx="0" cy="0" r="${centerR * 0.6}" fill="#FFFFFF" />
      </g>
    `;
  },

  // 一饼（大筒/大饼）超精细 SVG
  renderBigDot(cx = 50, cy = 67, r = 40) {
    const g = this.colors.green;
    const rCol = this.colors.red;
    
    let petals = '';
    for (let i = 0; i < 16; i++) {
      const angle = (i * 360 / 16) * Math.PI / 180;
      const px = Math.cos(angle) * (r * 0.92);
      const py = Math.sin(angle) * (r * 0.92);
      petals += `<circle cx="${px.toFixed(2)}" cy="${py.toFixed(2)}" r="${r * 0.12}" fill="${i % 2 === 0 ? rCol : g}" />`;
    }

    let rays = '';
    for (let i = 0; i < 24; i++) {
      const angle = (i * 360 / 24) * Math.PI / 180;
      const x1 = Math.cos(angle) * (r * 0.35);
      const y1 = Math.sin(angle) * (r * 0.35);
      const x2 = Math.cos(angle) * (r * 0.72);
      const y2 = Math.sin(angle) * (r * 0.72);
      rays += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${i % 2 === 0 ? rCol : g}" stroke-width="1.5" />`;
    }

    return `
      <g transform="translate(${cx}, ${cy})">
        <circle cx="0" cy="0" r="${r}" fill="${g}" stroke="#06381C" stroke-width="1" />
        <g>${petals}</g>
        <circle cx="0" cy="0" r="${r * 0.78}" fill="${rCol}" stroke="#FFFFFF" stroke-width="1" />
        <circle cx="0" cy="0" r="${r * 0.72}" fill="#FDFBF7" />
        <g>${rays}</g>
        <circle cx="0" cy="0" r="${r * 0.36}" fill="${g}" />
        <circle cx="0" cy="0" r="${r * 0.28}" fill="#FFFFFF" />
        <circle cx="0" cy="0" r="${r * 0.18}" fill="${rCol}" />
        <circle cx="0" cy="0" r="${r * 0.07}" fill="#FFFFFF" />
      </g>
    `;
  },

  renderBing(num) {
    if (num === 1) {
      return `<g class="tile-bing-1">${this.renderBigDot(50, 67, 38)}</g>`;
    }

    const g = this.colors.green;
    const r = this.colors.red;
    let dots = '';

    switch (num) {
      case 2:
        dots += this.renderSingleDot(50, 36, 16, g, r);
        dots += this.renderSingleDot(50, 98, 16, r, g);
        break;
      case 3:
        dots += this.renderSingleDot(28, 32, 14, g, r);
        dots += this.renderSingleDot(50, 67, 14, r, g);
        dots += this.renderSingleDot(72, 102, 14, g, r);
        break;
      case 4:
        dots += this.renderSingleDot(30, 36, 15, g, r);
        dots += this.renderSingleDot(70, 36, 15, r, g);
        dots += this.renderSingleDot(30, 98, 15, r, g);
        dots += this.renderSingleDot(70, 98, 15, g, r);
        break;
      case 5:
        dots += this.renderSingleDot(28, 32, 13, g, r);
        dots += this.renderSingleDot(72, 32, 13, g, r);
        dots += this.renderSingleDot(50, 67, 15, r, g);
        dots += this.renderSingleDot(28, 102, 13, g, r);
        dots += this.renderSingleDot(72, 102, 13, g, r);
        break;
      case 6:
        dots += this.renderSingleDot(32, 32, 13.5, g, r);
        dots += this.renderSingleDot(68, 32, 13.5, g, r);
        dots += this.renderSingleDot(32, 67, 13.5, r, g);
        dots += this.renderSingleDot(68, 67, 13.5, r, g);
        dots += this.renderSingleDot(32, 102, 13.5, r, g);
        dots += this.renderSingleDot(68, 102, 13.5, r, g);
        break;
      case 7:
        dots += this.renderSingleDot(26, 26, 11, g, r);
        dots += this.renderSingleDot(50, 38, 11, g, r);
        dots += this.renderSingleDot(74, 50, 11, g, r);
        dots += this.renderSingleDot(30, 78, 12, r, g);
        dots += this.renderSingleDot(70, 78, 12, r, g);
        dots += this.renderSingleDot(30, 106, 12, r, g);
        dots += this.renderSingleDot(70, 106, 12, r, g);
        break;
      case 8:
        dots += this.renderSingleDot(30, 26, 11.5, g, r);
        dots += this.renderSingleDot(70, 26, 11.5, g, r);
        dots += this.renderSingleDot(30, 53, 11.5, g, r);
        dots += this.renderSingleDot(70, 53, 11.5, g, r);

        dots += this.renderSingleDot(30, 81, 11.5, r, g);
        dots += this.renderSingleDot(70, 81, 11.5, r, g);
        dots += this.renderSingleDot(30, 108, 11.5, r, g);
        dots += this.renderSingleDot(70, 108, 11.5, r, g);
        break;
      case 9:
        // 九饼 3x3 矩阵布局优化：扩大横向列间距与纵向行间距，适当微调半径，使各圆清晰间隔，不再拥挤
        const rows = [28, 67, 106];
        const cols = [21, 50, 79];
        for (let rIdx = 0; rIdx < 3; rIdx++) {
          for (let cIdx = 0; cIdx < 3; cIdx++) {
            const colorOuter = (cIdx === 1) ? r : g;
            dots += this.renderSingleDot(cols[cIdx], rows[rIdx], 10.5, colorOuter, (cIdx === 1) ? g : r);
          }
        }
        break;
    }

    return `<g class="tile-bing">${dots}</g>`;
  },

  // ---------------------------------------------------------------------------
  // FENG & DRAGON (风牌 / 箭牌 - 拓展支持)
  // ---------------------------------------------------------------------------
  renderFeng(char) {
    return `
      <g class="tile-feng">
        <text x="50" y="76" 
              font-family="'Kaiti', 'STKaiti', '楷体', 'Microsoft YaHei', serif" 
              font-size="64" 
              font-weight="900" 
              fill="${this.colors.blue}" 
              text-anchor="middle" 
              dominant-baseline="central"
              style="filter: drop-shadow(0.5px 0.5px 0px rgba(0,0,0,0.2));">
          ${char}
        </text>
      </g>
    `;
  },

  renderDragon(type) {
    let char = '';
    let color = '';
    if (type === 'zhong' || type === '中') {
      char = '中';
      color = this.colors.red;
    } else if (type === 'fa' || type === '發') {
      char = '發';
      color = this.colors.green;
    } else if (type === 'bai' || type === '白') {
      return `
        <g class="tile-bai">
          <rect x="22" y="24" width="56" height="86" rx="4" ry="4" fill="none" stroke="${this.colors.blue}" stroke-width="7" />
          <rect x="27" y="29" width="46" height="76" rx="2" ry="2" fill="none" stroke="#FFFFFF" stroke-width="2" />
        </g>
      `;
    }

    return `
      <g class="tile-dragon">
        <text x="50" y="74" 
              font-family="'Kaiti', 'STKaiti', '楷体', 'Microsoft YaHei', serif" 
              font-size="64" 
              font-weight="900" 
              fill="${color}" 
              text-anchor="middle" 
              dominant-baseline="central"
              style="filter: drop-shadow(0.5px 0.5px 0px rgba(0,0,0,0.2));">
          ${char}
        </text>
      </g>
    `;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MahjongRenderer;
}
