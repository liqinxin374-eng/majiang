const SVG_DEFS = `
<defs>
    <filter id="cyber-glow-cyan" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
        </feMerge>
    </filter>
    <filter id="cyber-glow-magenta" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
        </feMerge>
    </filter>
    <filter id="cyber-glow-green" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
        </feMerge>
    </filter>
</defs>
`;

const DESIGN_TILE_BASE = '/mahjong-tiles';

// 素材文件加载失败时，用程序内置牌面兜底，避免页面出现破损图片图标。
// 这只在网络请求失败时触发，正常情况下仍优先显示设计目录中的真实素材。
if (typeof window !== 'undefined' && !window.__mahjongTileFallback) {
    window.__mahjongTileFallback = (image, suit, value) => {
        if (!image || image.dataset.fallbackApplied === 'true') return;

        image.dataset.fallbackApplied = 'true';
        const holder = document.createElement('span');
        holder.innerHTML = getLegacyTileSVG(suit, Number(value));
        const fallback = holder.firstElementChild;
        if (!fallback) return;

        fallback.classList.add('mahjong-asset', 'mahjong-inline-fallback');
        fallback.setAttribute('aria-label', `${value}${suit === 'wan' ? '万' : suit === 'tiao' ? '条' : '筒'}牌`);
        image.replaceWith(fallback);
    };
}

/**
 * 返回设计目录里的真实牌面素材。
 * 牌面素材本身已经包含白玉底、圆角和边框，因此这里使用图片元素，
 * 而不是继续在浏览器中重新绘制旧版科幻牌面。
 */
export function getTileSVG(suit, value) {
    const assetSuit = suit === 'tong' ? 'bing' : suit;
    const assetPath = `${DESIGN_TILE_BASE}/${assetSuit}_${Number(value)}_copy1.svg`;
    const labelMap = { wan: '万', tiao: '条', tong: '筒', bing: '筒' };
    const label = `${value}${labelMap[suit] || ''}`;

    return `<img class="mahjong-asset" src="${assetPath}" alt="${label}牌" draggable="false" onerror="window.__mahjongTileFallback?.(this, '${suit}', '${Number(value)}')">`;
}

function getLegacyTileSVG(suit, value) {
    let content = '';
    let glowColor = '';
    let filter = '';

    if (suit === 'tong') {
        glowColor = 'var(--cyan)';
        filter = 'url(#cyber-glow-cyan)';
        content = generateTongSVG(value);
    } else if (suit === 'tiao') {
        glowColor = 'var(--green)';
        filter = 'url(#cyber-glow-green)';
        content = generateTiaoSVG(value);
    } else if (suit === 'wan') {
        glowColor = 'var(--magenta)';
        filter = '';
        content = generateWanSVG(value);
    } else if (suit === 'zipai') {
        glowColor = 'var(--cyan)';
        filter = '';
        content = generateZiPaiSVG(value);
    }

    return `
    <svg class="mahjong-svg" viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" style="--svg-glow-color: ${glowColor};">
        ${SVG_DEFS}
        <rect x="5" y="5" width="90" height="130" rx="6" fill="none" stroke="${glowColor}" stroke-opacity="0.15" stroke-width="1" />
        <path class="tile-cyber-deco" d="M 8 15 L 8 8 L 15 8" fill="none" stroke="${glowColor}" stroke-width="1.5" filter="${filter}" />
        <path class="tile-cyber-deco" d="M 92 15 L 92 8 L 85 8" fill="none" stroke="${glowColor}" stroke-width="1.5" filter="${filter}" />
        <path class="tile-cyber-deco" d="M 8 125 L 8 132 L 15 132" fill="none" stroke="${glowColor}" stroke-width="1.5" filter="${filter}" />
        <path class="tile-cyber-deco" d="M 92 125 L 92 132 L 85 132" fill="none" stroke="${glowColor}" stroke-width="1.5" filter="${filter}" />
        <g class="tile-face-content" filter="${filter}">
            ${content}
        </g>
    </svg>
    `;
}

function generateTongSVG(val) {
    const centers = {
        1: [[50, 70, 24]],
        2: [[50, 40, 16], [50, 100, 16]],
        3: [[25, 35, 14], [50, 70, 14], [75, 105, 14]],
        4: [[30, 40, 14], [70, 40, 14], [30, 100, 14], [70, 100, 14]],
        5: [[30, 38, 13], [70, 38, 13], [50, 70, 13], [30, 102, 13], [70, 102, 13]],
        6: [[32, 36, 12], [68, 36, 12], [32, 70, 12], [68, 70, 12], [32, 104, 12], [68, 104, 12]],
        7: [[30, 32, 11], [70, 32, 11], [50, 56, 11], [30, 80, 11], [70, 80, 11], [30, 108, 11], [70, 108, 11]],
        8: [[32, 28, 10], [68, 28, 10], [32, 56, 10], [68, 56, 10], [32, 84, 10], [68, 84, 10], [32, 112, 10], [68, 112, 10]],
        9: [[25, 32, 10], [50, 32, 10], [75, 32, 10], [25, 70, 10], [50, 70, 10], [75, 70, 10], [25, 108, 10], [50, 108, 10], [75, 108, 10]]
    };

    let svg = '';

    // 1筒单独的整合输出
    if (val === 1) {
        const [cx, cy, r] = centers[1][0];
        svg += `
        <!-- 科幻一筒 -->
        <g class="tile-tong-cyber-1">
            <circle class="tile-tong-outer" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--cyan)" stroke-width="2" />
            <circle class="tile-tong-inner" cx="${cx}" cy="${cy}" r="${r - 6}" fill="none" stroke="var(--green)" stroke-dasharray="4 3" stroke-width="1.5" />
            <circle class="tile-tong-center-big" cx="${cx}" cy="${cy}" r="6" fill="var(--magenta)" />
            <circle class="tile-tong-outer-deco" cx="${cx}" cy="${cy}" r="${r + 8}" fill="none" stroke="var(--cyan)" stroke-width="1" stroke-dasharray="25 15" />
            <line class="tile-tong-line" x1="${cx - r - 12}" y1="${cy}" x2="${cx + r + 12}" y2="${cy}" stroke="var(--cyan)" stroke-opacity="0.3" stroke-width="1" />
            <line class="tile-tong-line" x1="${cx}" y1="${cy - r - 12}" x2="${cx}" y2="${cy + r + 12}" stroke="var(--cyan)" stroke-opacity="0.3" stroke-width="1" />
        </g>
        <!-- 传统一筒：精致的同心圆菊花盘 -->
        <g class="tile-tong-traditional-1">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--magenta)" stroke-width="2" />
            <circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="none" stroke="var(--green)" stroke-width="2" stroke-dasharray="3.2 2" />
            <circle cx="${cx}" cy="${cy}" r="13" fill="none" stroke="var(--magenta)" stroke-width="1.8" />
            <path d="M 33 70 Q 50 67 67 70 M 50 53 Q 47 70 50 87 M 38 58 Q 50 67 62 82 M 38 82 Q 50 67 62 58" fill="none" stroke="var(--green)" stroke-width="1.2" />
            <circle cx="${cx}" cy="${cy}" r="7" fill="var(--magenta)" />
            <circle cx="${cx}" cy="${cy}" r="2" fill="#fff" />
        </g>
        <!-- 仙侠一筒：太极乾坤镜 -->
        <g class="tile-tong-xianxia-1">
            <circle cx="${cx}" cy="${cy}" r="${r + 6}" fill="none" stroke="#ffea77" stroke-width="1.5" stroke-dasharray="8 4 2 4" />
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2e7d32" stroke-width="2.5" />
            <circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="#c23616" />
            <path d="M ${cx} ${cy - r + 3.5} A ${(r - 3.5)/2} ${(r - 3.5)/2} 0 0 0 ${cx} ${cy} A ${(r - 3.5)/2} ${(r - 3.5)/2} 0 0 1 ${cx} ${cy + r - 3.5} A ${r - 3.5} ${r - 3.5} 0 0 1 ${cx} ${cy - r + 3.5} Z" fill="#ffffff" opacity="0.9" />
            <circle cx="${cx}" cy="${cy - (r - 3.5)/2}" r="3" fill="#c23616" />
            <circle cx="${cx}" cy="${cy + (r - 3.5)/2}" r="3" fill="#ffffff" />
            <circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="none" stroke="#2ecc71" stroke-width="0.8" opacity="0.5" />
        </g>
        `;
        return svg;
    }

    centers[val].forEach(([cx, cy, r], idx) => {
        // 1. 确定科幻下的颜色
        let color = 'var(--cyan)';
        if (val === 2) {
            color = cy < 70 ? 'var(--green)' : 'var(--cyan)';
        } else if (val === 3) {
            if (cy < 50) color = 'var(--green)';
            else if (cy < 95) color = 'var(--magenta)';
            else color = 'var(--cyan)';
        } else if (val === 4) {
            color = (cx < 50 && cy < 70) || (cx > 50 && cy > 70) ? 'var(--green)' : 'var(--cyan)';
        } else if (val === 5) {
            if (cx === 50 && cy === 70) color = 'var(--magenta)';
            else color = (cx < 50 && cy < 70) || (cx > 50 && cy > 70) ? 'var(--green)' : 'var(--cyan)';
        } else if (val === 6) {
            color = cy < 50 ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 7) {
            color = cy <= 56 ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 8) {
            color = cy < 40 || (cy > 70 && cy < 95) ? 'var(--green)' : 'var(--cyan)';
        } else if (val === 9) {
            if (cy < 50) color = 'var(--cyan)';
            else if (cy < 90) color = 'var(--magenta)';
            else color = 'var(--green)';
        }

        // 2. 精确计算传统麻将红绿配色的每个子筒子颜色
        let tradColor = 'var(--green)'; // 默认绿色
        if (val === 2) {
            tradColor = idx === 0 ? 'var(--green)' : 'var(--magenta)';
        } else if (val === 3) {
            tradColor = idx === 0 ? 'var(--green)' : (idx === 1 ? 'var(--magenta)' : 'var(--green)');
        } else if (val === 4) {
            // 对角线：左上/右下是绿色，右上/左下是红色
            tradColor = (idx === 0 || idx === 3) ? 'var(--green)' : 'var(--magenta)';
        } else if (val === 5) {
            // 四个角是绿色，中间是红色
            tradColor = idx === 2 ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 6) {
            // 上面两个绿色，下面四个红色
            tradColor = idx < 2 ? 'var(--green)' : 'var(--magenta)';
        } else if (val === 7) {
            // 斜排三个绿色，下面四个红色
            tradColor = idx < 3 ? 'var(--green)' : 'var(--magenta)';
        } else if (val === 8) {
            // 左右交替
            tradColor = (idx % 2 === 0) ? 'var(--green)' : 'var(--magenta)';
        } else if (val === 9) {
            // 第一排绿，第二排红，第三排绿
            tradColor = (idx >= 3 && idx < 6) ? 'var(--magenta)' : 'var(--green)';
        }

        svg += `
        <!-- 科幻多筒 -->
        <g class="tile-tong-cyber-group">
            <circle class="tile-tong-outer" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="1.5" />
            <circle class="tile-tong-inner" cx="${cx}" cy="${cy}" r="${r - 4}" fill="${color}" fill-opacity="0.4" />
            <circle class="tile-tong-center" cx="${cx}" cy="${cy}" r="2" fill="#e2f1f7" />
        </g>
        <!-- 传统多筒：经典的红绿相间雕刻花盘 -->
        <g class="tile-tong-traditional-group">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${tradColor}" stroke-width="1.8" />
            <circle cx="${cx}" cy="${cy}" r="${r - 3.5}" fill="none" stroke="${tradColor}" stroke-dasharray="2.8 1.8" stroke-width="1.3" />
            <circle cx="${cx}" cy="${cy}" r="3.5" fill="${tradColor === 'var(--magenta)' ? 'var(--green)' : 'var(--magenta)'}" />
            <circle cx="${cx}" cy="${cy}" r="1" fill="#fff" />
        </g>
        <!-- 仙侠多筒：太极同心玉环 -->
        <g class="tile-tong-xianxia-group">
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2ecc71" stroke-width="2.2" />
            <circle cx="${cx}" cy="${cy}" r="${r - 2.5}" fill="#c23616" />
            <path d="M ${cx} ${cy - r + 2.5} A ${(r - 2.5)/2} ${(r - 2.5)/2} 0 0 0 ${cx} ${cy} A ${(r - 2.5)/2} ${(r - 2.5)/2} 0 0 1 ${cx} ${cy + r - 2.5} A ${r - 2.5} ${r - 2.5} 0 0 1 ${cx} ${cy - r + 2.5} Z" fill="#ffffff" opacity="0.85" />
            <circle cx="${cx}" cy="${cy - (r - 2.5)/2}" r="1.2" fill="#c23616" />
            <circle cx="${cx}" cy="${cy + (r - 2.5)/2}" r="1.2" fill="#ffffff" />
            <circle cx="${cx}" cy="${cy}" r="${r + 1}" fill="none" stroke="#ffea77" stroke-width="0.5" stroke-opacity="0.3" />
        </g>
        `;
    });

    return svg;
}

function getXianxiaSword(x1, y1, x2, y2, color) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI - 90;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    
    return `
    <g transform="translate(${cx}, ${cy}) rotate(${angle})">
        <!-- 剑身 -->
        <path d="M -1.8 ${-len/2 + 4} L 1.8 ${-len/2 + 4} L 1.2 ${len/2 - 2} L 0 ${len/2} L -1.2 ${len/2 - 2} Z" fill="${color}" />
        <!-- 剑刃高光 -->
        <line x1="0" y1="${-len/2 + 5}" x2="0" y2="${len/2 - 1}" stroke="#ffffff" stroke-width="0.8" />
        <!-- 剑镡 -->
        <rect x="-3" y="${-len/2 + 2}" width="6" height="1.6" rx="0.4" fill="${color === '#c23616' ? '#ffea77' : '#c23616'}" />
        <!-- 剑柄 -->
        <line x1="0" y1="${-len/2}" x2="0" y2="${-len/2 + 2}" stroke="#ffea77" stroke-width="1.2" />
        <circle cx="0" cy="${-len/2}" r="0.8" fill="#ffea77" />
    </g>
    `;
}

function getTraditionalBambooPath(x1, y1, x2, y2, color) {
    const height = y2 - y1;
    // 如果是八条斜线
    if (x1 !== x2) {
        return `
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="6.8" stroke-linecap="round" />
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 5" />
        `;
    }

    // 垂直翠玉红泥竹条子，鼓起关节、白色高光
    const cx = x1;
    const cy = (y1 + y2) / 2;
    const w = 4.2; // 半宽

    return `
    <g class="tile-tiao-traditional-bamboo">
        <!-- 竹节柱身 -->
        <path d="M ${cx - w} ${y1} Q ${cx} ${y1 - 1.5} ${cx + w} ${y1} Q ${cx + w - 0.8} ${cy} ${cx + w} ${y2} Q ${cx} ${y2 + 1.5} ${cx - w} ${y2} Q ${cx - w + 0.8} ${cy} ${cx - w} ${y1} Z" fill="${color}" />
        <!-- 竹身中央高光疤线 -->
        <line x1="${cx - w + 0.5}" y1="${cy}" x2="${cx + w - 0.5}" y2="${cy}" stroke="#fff" stroke-width="1.1" opacity="0.95" />
        <!-- 上下端节圈 -->
        <line x1="${cx - w}" y1="${y1 + 1}" x2="${cx + w}" y2="${y1 + 1}" stroke="#fff" stroke-width="0.8" opacity="0.6" />
        <line x1="${cx - w}" y1="${y2 - 1}" x2="${cx + w}" y2="${y2 - 1}" stroke="#fff" stroke-width="0.8" opacity="0.6" />
    </g>
    `;
}

function generateTiaoSVG(val) {
    if (val === 1) {
        return `
        <!-- 科幻一条 -->
        <g class="tile-tiao-cyber-group">
            <path class="tile-tiao-path" d="M 50 35 Q 20 25 15 50 Q 30 65 50 55" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" />
            <path class="tile-tiao-path" d="M 50 42 Q 28 35 25 52 Q 35 60 50 55" fill="none" stroke="var(--cyan)" stroke-width="1.5" stroke-linecap="round" />
            <path class="tile-tiao-path" d="M 50 35 Q 80 25 85 50 Q 70 65 50 55" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" />
            <path class="tile-tiao-path" d="M 50 42 Q 72 35 75 52 Q 65 60 50 55" fill="none" stroke="var(--cyan)" stroke-width="1.5" stroke-linecap="round" />
            <path class="tile-tiao-path-dotline" d="M 50 25 L 50 75" stroke="var(--green)" stroke-width="1.5" stroke-dasharray="5 3" />
            <path class="tile-tiao-path-crown" d="M 50 15 L 46 25 L 54 25 Z" fill="var(--magenta)" />
            <path class="tile-tiao-path-feather" d="M 50 15 Q 43 10 38 12 Q 45 18 50 22" fill="none" stroke="var(--magenta)" stroke-width="1" />
            <path class="tile-tiao-path-feather" d="M 50 15 Q 57 10 62 12 Q 55 18 50 22" fill="none" stroke="var(--magenta)" stroke-width="1" />
            <circle class="tile-tiao-bird-center" cx="50" cy="48" r="7" fill="none" stroke="var(--green)" stroke-width="1.5" />
            <circle class="tile-tiao-bird-eye" cx="50" cy="48" r="3" fill="var(--magenta)" />
            <path class="tile-tiao-path-tail" d="M 45 70 Q 30 90 35 115" fill="none" stroke="var(--magenta)" stroke-width="1.5" stroke-linecap="round" />
            <path class="tile-tiao-path-tail-center" d="M 50 70 Q 50 95 50 120" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" />
            <path class="tile-tiao-path-tail" d="M 55 70 Q 70 90 65 115" fill="none" stroke="var(--magenta)" stroke-width="1.5" stroke-linecap="round" />
            <circle class="tile-tiao-bird-tail-dot" cx="35" cy="115" r="2.5" fill="var(--magenta)" />
            <circle class="tile-tiao-bird-tail-dot" cx="50" cy="120" r="3" fill="var(--green)" />
            <circle class="tile-tiao-bird-tail-dot" cx="65" cy="115" r="2.5" fill="var(--magenta)" />
            <line class="tile-tiao-line-deco" x1="15" y1="95" x2="85" y2="95" stroke="var(--cyan)" stroke-width="1" stroke-opacity="0.4" />
        </g>
        <!-- 传统一条：经典的翠绿灵鸟图案 -->
        <g class="tile-tiao-traditional-1">
            <path d="M 50 35 C 57 35 62 42 60 50 C 58 55 52 58 48 58 C 42 58 38 52 40 45 C 41 38 45 35 50 35 Z" fill="var(--green)" />
            <path d="M 58 43 L 66 40 L 60 47" fill="none" stroke="var(--magenta)" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="53" cy="42" r="1.5" fill="#fff" />
            <path d="M 46 35 Q 43 25 35 28" fill="none" stroke="var(--magenta)" stroke-width="2" stroke-linecap="round" />
            <path d="M 44 48 C 36 50 30 65 34 85 C 38 95 44 95 46 80 Z" fill="var(--magenta)" />
            <path d="M 44 78 Q 40 100 35 118 M 46 76 Q 47 98 48 120 M 48 78 Q 58 100 62 118" fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linecap="round" />
            <circle cx="35" cy="118" r="2" fill="var(--magenta)" />
            <circle cx="48" cy="120" r="2" fill="var(--green)" />
            <circle cx="62" cy="118" r="2" fill="var(--magenta)" />
            <path d="M 28 85 H 72 C 76 85 76 92 72 92 H 28 C 24 92 24 85 28 85 Z" fill="var(--green)" />
            <path d="M 38 92 V 110 M 62 92 V 110" fill="none" stroke="var(--green)" stroke-width="3.5" stroke-linecap="round" />
        </g>
        <!-- 仙侠一条：青莲飞剑 -->
        <g class="tile-tiao-xianxia-1">
            <!-- 青莲底座 -->
            <path d="M 32 106 Q 50 88 68 106 Q 50 118 32 106 Z" fill="#2ecc71" fill-opacity="0.3" stroke="#2ecc71" stroke-width="1.5" />
            <path d="M 40 106 Q 50 96 60 106" fill="none" stroke="#c23616" stroke-width="1.2" />
            <!-- 仙气云烟 -->
            <path d="M 22 75 Q 36 62 40 75 Q 46 88 32 94" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1" stroke-linecap="round" />
            <path d="M 78 75 Q 64 62 60 75 Q 54 88 68 94" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="1" stroke-linecap="round" />
            <!-- 飞剑剑身 -->
            <path d="M 47 38 L 53 38 L 51.5 94 L 48.5 94 Z" fill="#2ecc71" />
            <path d="M 47 38 L 50 24 L 53 38 Z" fill="#2ecc71" />
            <line x1="50" y1="26" x2="50" y2="94" stroke="#ffffff" stroke-width="1" />
            <!-- 剑格/剑镡 -->
            <rect x="43" y="94" width="14" height="3" rx="0.8" fill="#c23616" />
            <!-- 剑柄 -->
            <line x1="50" y1="97" x2="50" y2="110" stroke="#ffea77" stroke-width="1.8" />
            <circle cx="50" cy="110" r="2" fill="#c23616" />
            <!-- 剑尖灵光 -->
            <circle cx="50" cy="20" r="2.2" fill="#ffea77" />
        </g>
        `;
    }

    const rods = {
        2: [[50, 30, 50, 65], [50, 75, 50, 110]],
        3: [[50, 25, 50, 60], [32, 75, 32, 110], [68, 75, 68, 110]],
        4: [[32, 25, 32, 60], [68, 25, 68, 60], [32, 75, 32, 110], [68, 75, 68, 110]],
        5: [[30, 25, 30, 60], [70, 25, 70, 60], [50, 50, 50, 85], [30, 75, 30, 110], [70, 75, 70, 110]],
        6: [[30, 25, 30, 60], [50, 25, 50, 60], [70, 25, 70, 60], [30, 75, 30, 110], [50, 75, 50, 110], [70, 75, 70, 110]],
        7: [[50, 20, 50, 46], [30, 56, 30, 81], [50, 56, 50, 81], [70, 56, 70, 81], [30, 91, 30, 116], [50, 91, 50, 116], [70, 91, 70, 116]],
        8: [
            [20, 25, 35, 55], [35, 55, 50, 25], [50, 25, 65, 55], [65, 55, 80, 25],
            [20, 115, 35, 85], [35, 85, 50, 115], [50, 115, 65, 85], [65, 85, 80, 115]
        ],
        9: [
            [25, 31, 25, 56], [50, 31, 50, 56], [75, 31, 75, 56],
            [25, 66, 25, 91], [50, 66, 50, 91], [75, 66, 75, 91],
            [25, 101, 25, 126], [50, 101, 50, 126], [75, 101, 75, 126]
        ]
    };

    let svg = '';

    rods[val].forEach(([x1, y1, x2, y2], idx) => {
        // 1. 科幻版下的颜色
        let color = 'var(--green)';
        if (val === 2) {
            color = y1 < 50 ? 'var(--green)' : 'var(--cyan)';
        } else if (val === 3) {
            if (y1 < 50) color = 'var(--magenta)';
            else if (x1 < 50) color = 'var(--green)';
            else color = 'var(--cyan)';
        } else if (val === 4 || val === 6) {
            color = y1 < 50 ? 'var(--green)' : 'var(--cyan)';
        } else if (val === 5) {
            if (x1 === 50 && y1 === 50) color = 'var(--magenta)';
            else color = (x1 < 50 && y1 < 50) || (x1 > 50 && y1 > 50) ? 'var(--green)' : 'var(--cyan)';
        } else if (val === 7) {
            if (y1 < 50) color = 'var(--magenta)';
            else if (y1 < 90) color = 'var(--green)';
            else color = 'var(--cyan)';
        } else if (val === 8) {
            color = x1 === 20 || x2 === 80 ? 'var(--green)' : 'var(--magenta)';
        } else if (val === 9) {
            if (y1 < 50) color = 'var(--green)';
            else if (y1 < 80) color = 'var(--magenta)';
            else color = 'var(--cyan)';
        }

        // 2. 精确计算传统条子的红绿相间配色
        let tradColor = 'var(--green)';
        if (val === 2) {
            tradColor = idx === 0 ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 3) {
            tradColor = idx === 0 ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 4) {
            tradColor = idx < 2 ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 5) {
            tradColor = idx === 2 ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 7) {
            tradColor = idx === 0 ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 8) {
            tradColor = (idx === 1 || idx === 2 || idx === 5 || idx === 6) ? 'var(--magenta)' : 'var(--green)';
        } else if (val === 9) {
            tradColor = (idx >= 3 && idx < 6) ? 'var(--magenta)' : 'var(--green)';
        }

        // 3. 仙侠条子的红绿飞剑配色
        let xianxiaColor = '#2ecc71';
        if (val === 2) {
            xianxiaColor = idx === 0 ? '#c23616' : '#2ecc71';
        } else if (val === 3) {
            xianxiaColor = idx === 0 ? '#c23616' : '#2ecc71';
        } else if (val === 4) {
            xianxiaColor = idx < 2 ? '#c23616' : '#2ecc71';
        } else if (val === 5) {
            xianxiaColor = idx === 2 ? '#c23616' : '#2ecc71';
        } else if (val === 6) {
            xianxiaColor = idx < 3 ? '#c23616' : '#2ecc71';
        } else if (val === 7) {
            xianxiaColor = idx === 0 ? '#c23616' : '#2ecc71';
        } else if (val === 8) {
            xianxiaColor = (idx === 1 || idx === 2 || idx === 5 || idx === 6) ? '#c23616' : '#2ecc71';
        } else if (val === 9) {
            xianxiaColor = (idx >= 3 && idx < 6) ? '#c23616' : '#2ecc71';
        }

        svg += `
        <!-- 科幻多条 -->
        <g class="tile-tiao-cyber-group">
            ${x1 !== x2 ? `
                <line class="tile-tiao-slant-bg" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="4.5" stroke-linecap="round" />
                <line class="tile-tiao-slant-fg" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="1.2" stroke-linecap="round" />
            ` : `
                <rect class="tile-tiao-rect" x="${x1 - 3}" y="${y1}" width="6" height="${y2 - y1}" rx="3" fill="none" stroke="${color}" stroke-width="1.5" />
                <line class="tile-tiao-line" x1="${x1}" y1="${y1 + 4}" x2="${x1}" y2="${y2 - 4}" stroke="${color}" stroke-width="2" stroke-linecap="round" />
                <circle class="tile-tiao-dot" cx="${x1}" cy="${(y1 + y2) / 2}" r="2" fill="#fff" />
            `}
        </g>
        <!-- 传统多条 -->
        <g class="tile-tiao-traditional-group">
            ${getTraditionalBambooPath(x1, y1, x2, y2, tradColor)}
        </g>
        <!-- 仙侠多条：翠玉飞剑阵 -->
        <g class="tile-tiao-xianxia-group">
            ${getXianxiaSword(x1, y1, x2, y2, xianxiaColor)}
        </g>
        `;
    });

    return svg;
}

function generateWanSVG(val) {
    const chars = {
        1: `<path d="M 25 45 H 75" fill="none" stroke="var(--cyan)" stroke-width="4" stroke-linecap="round" /><path d="M 25 45 H 75" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />`,
        2: `<path d="M 32 38 H 68 M 22 52 H 78" fill="none" stroke="var(--cyan)" stroke-width="4" stroke-linecap="round" /><path d="M 32 38 H 68 M 22 52 H 78" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" />`,
        3: `<path d="M 32 32 H 68 M 38 45 H 62 M 22 58 H 78" fill="none" stroke="var(--cyan)" stroke-width="3.5" stroke-linecap="round" /><path d="M 32 32 H 68 M 38 45 H 62 M 22 58 H 78" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" />`,
        4: `<path d="M 32 26 H 68 V 58 H 32 Z M 42 34 Q 42 46 36 50 M 58 34 V 44 Q 58 50 64 50 V 46" fill="none" stroke="var(--cyan)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" /><path d="M 32 26 H 68 V 58 H 32 Z M 42 34 Q 42 46 36 50 M 58 34 V 44 Q 58 50 64 50 V 46" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />`,
        5: `<path d="M 32 26 H 68 M 46 26 L 38 42 H 58 V 58 M 24 58 H 76" fill="none" stroke="var(--cyan)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M 32 26 H 68 M 46 26 L 38 42 H 58 V 58 M 24 58 H 76" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" />`,
        6: `<path d="M 50 24 V 31 M 24 38 H 76 M 36 46 L 24 60 M 64 46 L 76 60" fill="none" stroke="var(--cyan)" stroke-width="3.5" stroke-linecap="round" /><path d="M 50 24 V 31 M 24 38 H 76 M 36 46 L 24 60 M 64 46 L 76 60" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" />`,
        7: `<path d="M 26 42 H 74 M 46 28 V 48 C 46 58 54 58 64 58 H 68 C 74 58 74 54 74 48" fill="none" stroke="var(--cyan)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round" /><path d="M 26 42 H 74 M 46 28 V 48 C 46 58 54 58 64 58 H 68 C 74 58 74 54 74 48" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />`,
        8: `<path d="M 44 30 Q 36 38 24 58 M 56 30 Q 64 38 76 58" fill="none" stroke="var(--cyan)" stroke-width="4" stroke-linecap="round" /><path d="M 44 30 Q 36 38 24 58 M 56 30 Q 64 38 76 58" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" />`,
        9: `<path d="M 56 28 L 36 60 M 30 36 H 62 V 50 C 62 58 68 58 74 58" fill="none" stroke="var(--cyan)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" /><path d="M 56 28 L 36 60 M 30 36 H 62 V 50 C 62 58 68 58 74 58" fill="none" stroke="#fff" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" />`
    };

    const numStr = {1:'一', 2:'二', 3:'三', 4:'四', 5:'五', 6:'六', 7:'七', 8:'八', 9:'九'}[val];

    return `
    <!-- 科幻量子折线版本 -->
    <g class="tile-wan-cyber-group">
        <g transform="translate(10, 3) scale(0.8)">${chars[val]}</g>
        <g>
            <text x="50" y="105" font-family="var(--font-cyber)" font-size="48" font-weight="900" fill="none" stroke="var(--magenta)" stroke-width="4.5" stroke-linejoin="round" text-anchor="middle">萬</text>
            <text x="50" y="105" font-family="var(--font-cyber)" font-size="48" font-weight="900" fill="#fff" text-anchor="middle">萬</text>
            <text x="50" y="122" font-family="var(--font-cyber)" font-size="8" fill="var(--magenta)" text-anchor="middle" font-weight="900" letter-spacing="1.5" opacity="0.8">${val}万</text>
        </g>
    </g>
    <!-- 传统书法版本：数字是黑色，萬是朱砂红，还原截图中的高档视觉 -->
    <g class="tile-wan-traditional-group">
        <text x="50" y="55" class="tile-char-text">${numStr}</text>
        <text x="50" y="105" class="tile-wan-text">萬</text>
        <text x="50" y="122" class="tile-traditional-sub" font-size="8" font-family="var(--font-cyber)" text-anchor="middle" letter-spacing="1.5" opacity="0.6">${val}万</text>
    </g>
    <!-- 仙侠朱砂天诀版本 -->
    <g class="tile-wan-xianxia-group">
        <!-- 淡淡的金色灵力法阵底盘 -->
        <circle cx="50" cy="70" r="26" fill="none" stroke="#ffea77" stroke-opacity="0.18" stroke-width="1" stroke-dasharray="2 3" />
        <circle cx="50" cy="70" r="32" fill="none" stroke="#ffea77" stroke-opacity="0.1" stroke-width="0.8" />
        <path d="M 30 70 A 20 20 0 0 1 70 70" fill="none" stroke="#ffea77" stroke-opacity="0.12" stroke-width="0.8" />
        
        <!-- 朱砂红数字 -->
        <text x="50" y="55" class="tile-char-text-xianxia" style="font-family: 'STXingkai', 'STKaiti', 'KaiTi', 'Noto Serif SC', serif; font-size: 36px; font-weight: 900; fill: #c23616; text-anchor: middle; filter: drop-shadow(0 0 1px rgba(255, 234, 119, 0.4));">${numStr}</text>
        
        <!-- 朱砂红 萬 字 -->
        <text x="50" y="105" class="tile-wan-text-xianxia" style="font-family: 'STXingkai', 'STKaiti', 'KaiTi', 'Noto Serif SC', serif; font-size: 38px; font-weight: 900; fill: #c23616; text-anchor: middle; filter: drop-shadow(0 0 1px rgba(255, 234, 119, 0.4));">萬</text>
        
        <!-- 底部仙文标注 -->
        <text x="50" y="122" class="tile-xianxia-sub" font-size="8" font-family="var(--font-cyber)" text-anchor="middle" fill="#ffea77" opacity="0.5" letter-spacing="1.5">${val}万</text>
    </g>
    `;
}

function generateZiPaiSVG(val) {
    const ziMap = {
        'zhong': { char: '中', color: '#c23616' },
        'fa': { char: '發', color: '#2ecc71' },
        'bai': { char: '白', color: '#7f8c8d' },
        'feng': { char: '風', color: '#2d3436' }
    };
    
    const info = ziMap[val] || { char: '中', color: '#c23616' };
    
    return `
    <!-- 字牌科幻版 -->
    <g class="tile-wan-cyber-group">
        <text x="50" y="85" font-family="var(--font-cyber)" font-size="44" font-weight="900" fill="none" stroke="${info.color}" stroke-width="4" stroke-linejoin="round" text-anchor="middle">${info.char}</text>
        <text x="50" y="85" font-family="var(--font-cyber)" font-size="44" font-weight="900" fill="#fff" text-anchor="middle">${info.char}</text>
    </g>
    <!-- 字牌传统书法版 -->
    <g class="tile-wan-traditional-group">
        <text x="50" y="85" class="tile-char-text-zipai" style="font-family: 'STXingkai', 'STKaiti', 'KaiTi', serif; font-size: 52px; font-weight: 900; fill: ${info.color} !important; text-anchor: middle;">${info.char}</text>
    </g>
    `;
}
