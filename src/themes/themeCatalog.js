/**
 * 主题目录：把“整套主题”和“单独组件”放在同一个地方管理。
 * 这样以后新增风格时，只需要增加配置，不必到处修改页面逻辑。
 */
export const THEME_CATALOG = {
    'sci-fi': {
        name: '科幻风格',
        className: 'theme-sci-fi',
        icon: '◈',
        components: { tile: 'sci-fi', background: 'sci-fi', table: 'sci-fi' }
    },
    classic: {
        name: '国风风格',
        className: 'theme-classic',
        icon: '◆',
        components: { tile: 'classic', background: 'classic', table: 'classic' }
    },
    xianxia: {
        name: '仙侠风格',
        className: 'theme-xianxia',
        icon: '✦',
        components: { tile: 'xianxia', background: 'xianxia', table: 'xianxia' }
    }
};

export const COMPONENT_OPTIONS = {
    tile: [
        { id: 'sci-fi', label: '科幻牌面', description: '蓝紫霓虹，适合科技主题' },
        { id: 'classic', label: '国风牌面', description: '温润米白，接近传统麻将' },
        { id: 'xianxia', label: '仙侠牌面', description: '玉石质感，搭配金色纹饰' }
    ],
    background: [
        { id: 'sci-fi', label: '科幻背景', description: '全息星舰与星云全景背景' },
        { id: 'classic', label: '国风背景', description: '千里江山金箔水墨画卷' },
        { id: 'xianxia', label: '仙侠云端', description: '嵌入式云海背景与仙气粒子' }
    ],
    table: [
        { id: 'sci-fi', label: '科幻桌面', description: '全息控制台牌桌' },
        { id: 'classic', label: '国风桌面', description: '翡翠与金线牌桌' },
        { id: 'xianxia', label: '仙侠桌面', description: '翡翠案面与八卦阵视觉' }
    ]
};

export const DEFAULT_COMPONENT_SETTINGS = THEME_CATALOG['sci-fi'].components;

export function getComponentOption(type, id) {
    return COMPONENT_OPTIONS[type]?.find(option => option.id === id) || COMPONENT_OPTIONS[type]?.[0];
}
