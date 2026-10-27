/**
 * 界面工程持久化
 *
 * 设计要点：
 * - 工程包含多个界面，每个界面保存“枚举名/文件名 + 坐标”，不保存图片 base64；
 * - 加载界面时按 enumName（其次 fileName）重新匹配当前资源目录，
 *   这样增删图片、替换同名图片后布局仍然可用；
 * - 同一张图片允许在同一个界面中放置多次，靠每个布局项的 id 区分；
 * - 工程自动保存到 userData，同时支持导出/导入独立的工程 JSON 文件。
 */

/**支持的图片扩展名*/
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp'];

/**一个工程最多包含的界面数量*/
export const MAX_LAYOUT_SCREENS = 50;

/**
 * 是否是支持的图片文件
 * @param fileName 文件名
 */
export const isImageFile = (fileName: string): boolean => {
    const index = fileName.lastIndexOf('.');
    if (index < 0) return false;
    return IMAGE_EXTENSIONS.includes(fileName.slice(index).toLowerCase());
};

/**
 * 取路径最后一段（兼容 Windows / POSIX 分隔符）
 * @param value 路径
 */
export const pathBaseName = (value: string): string => {
    const parts = String(value || '').split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : '';
};

/**生成布局/布局项唯一 id*/
export const makeLayoutId = (): string =>
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * 把名称转成合法的 C 标识
 * 中文等无法转换的字符会落到 fallback
 * @param value 原始名称
 * @param fallback 兜底名称
 */
export const sanitizeCodeName = (value: string, fallback = 'SCREEN'): string => {
    let code = String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+/, '');
    if (!code) code = fallback;
    if (/^\d/.test(code)) code = `_${code}`;
    return code || 'SCREEN';
};

/**
 * 生成不重复的 C 标识
 * @param screens 已有界面
 * @param base 期望名称
 * @param excludeId 排除的界面 id（重命名当前界面时用）
 */
export const uniqueCodeName = (
    screens: UILayoutScreen[],
    base: string,
    excludeId?: string
): string => {
    const root = sanitizeCodeName(base, 'SCREEN');
    let candidate = root;
    let index = 2;
    while (screens.some(screen => screen.id !== excludeId && screen.codeName === candidate)) {
        candidate = `${root}_${index}`;
        index += 1;
    }
    return candidate;
};

/**
 * 创建一个空界面
 * @param name 界面名称
 * @param width 屏幕宽度
 * @param height 屏幕高度
 * @param bgColor 背景色
 * @param codeName C 标识
 */
export const createScreen = (
    name = '主界面',
    width = 240,
    height = 240,
    bgColor = '#ffffff',
    codeName = 'SCREEN_1'
): UILayoutScreen => ({
    id: makeLayoutId(),
    name: name || '未命名界面',
    codeName: sanitizeCodeName(codeName, 'SCREEN_1'),
    width: Number(width) || 240,
    height: Number(height) || 240,
    bgColor: bgColor || '#ffffff',
    items: []
});

/**
 * 规范化工程数据，兼容手工改坏/旧字段缺失/导入文件
 * @param project 工程数据
 */
export const normalizeProject = (
    project: Partial<UILayoutProject> | null | undefined
): UILayoutProject => {
    const rawScreens = Array.isArray(project?.screens) ? project.screens : [];
    const usedNames = new Set<string>();
    const screens: UILayoutScreen[] = rawScreens
        .slice(0, MAX_LAYOUT_SCREENS)
        .map((screen, index) => {
            const id = String(screen?.id || `screen_${index + 1}`);
            let codeName = sanitizeCodeName(
                screen?.codeName || screen?.name || '',
                `SCREEN_${index + 1}`
            );
            let suffix = 2;
            while (usedNames.has(codeName)) {
                codeName = `${sanitizeCodeName(screen?.codeName || screen?.name || '', `SCREEN_${index + 1}`)}_${suffix}`;
                suffix += 1;
            }
            usedNames.add(codeName);
            return {
                id,
                name: screen?.name || `界面${index + 1}`,
                codeName,
                width: Number(screen?.width) || 240,
                height: Number(screen?.height) || 240,
                bgColor: screen?.bgColor || '#ffffff',
                items: (Array.isArray(screen?.items) ? screen.items : [])
                    .filter(item => item && (item.enumName || item.fileName))
                    .map((item, itemIndex) => ({
                        id: item.id || `item_${id}_${itemIndex}`,
                        enumName: item.enumName || '',
                        fileName: item.fileName || '',
                        x: Number(item.x) || 0,
                        y: Number(item.y) || 0
                    }))
            };
        });

    if (screens.length === 0) {
        screens.push(createScreen('主界面', 240, 240, '#ffffff', 'SCREEN_1'));
    }

    return {
        version: 3,
        name: project?.name || '未命名工程',
        inputDir: project?.inputDir || '',
        activeScreenId: screens.some(screen => screen.id === project?.activeScreenId)
            ? String(project?.activeScreenId)
            : screens[0].id,
        screens
    };
};

/**
 * 读取工程数据（主进程负责旧格式迁移）
 */
export const loadProject = async (): Promise<UILayoutProject> => {
    const result = await window.electronAPI.loadUILayout();
    if (!result.success || !result.data) {
        throw new Error(result.error || '读取界面工程失败');
    }
    return normalizeProject(result.data);
};

/**
 * 保存工程数据（主进程原子写入）
 * @param project 工程数据
 */
export const saveProject = async (project: UILayoutProject): Promise<void> => {
    const normalized = normalizeProject(project);
    const result = await window.electronAPI.saveUILayout(normalized);
    if (!result.success) {
        throw new Error(result.error || '保存界面工程失败');
    }
};

/**
 * 把当前编辑器状态写回界面对象
 * @param option 当前布局配置
 * @param list 当前布局项
 * @param screen 目标界面
 */
export const captureScreen = (
    option: UILayoutOption,
    list: UILayout[],
    screen: UILayoutScreen
): void => {
    screen.width = Number(option.width) || 240;
    screen.height = Number(option.height) || 240;
    screen.bgColor = option.bgColor || '#ffffff';
    screen.items = list.map(item => ({
        id: item.id || makeLayoutId(),
        enumName: item.enumName || '',
        fileName: item.fileName || '',
        x: Number(item.x) || 0,
        y: Number(item.y) || 0
    }));
};

/**
 * 把界面还原成布局项
 * 优先按 enumName 匹配，其次按 fileName；找不到的资源会收集到 missing
 * @param screen 界面
 * @param imgList 当前资源目录中的图片
 */
export const restoreScreen = (
    screen: UILayoutScreen,
    imgList: ImgOptions[]
): { list: UILayout[]; missing: string[] } => {
    const byEnum = new Map<string, ImgOptions>();
    const byFile = new Map<string, ImgOptions>();
    for (const img of imgList) {
        if (img.enumName) byEnum.set(img.enumName, img);
        if (img.fileName) byFile.set(img.fileName, img);
    }

    const list: UILayout[] = [];
    const missing: string[] = [];
    for (const item of screen.items) {
        const img = (item.enumName && byEnum.get(item.enumName))
            || (item.fileName && byFile.get(item.fileName));
        if (!img) {
            missing.push(item.enumName || item.fileName || item.id);
            continue;
        }
        list.push({
            id: item.id || makeLayoutId(),
            active: false,
            width: img.width || 0,
            height: img.height || 0,
            x: item.x,
            y: item.y,
            isXCenter: false,
            isYCenter: false,
            fileName: img.fileName,
            index: img.index,
            enumName: img.enumName,
            base64: img.base64,
            size: img.size
        });
    }
    return {list, missing};
};

/**
 * 找出枚举名重复的图片
 * 例如 a.png / a.jpg 都会变成 A，生成的 C 枚举会重定义
 * @param imgList 图片列表
 */
export const findEnumConflicts = (imgList: ImgOptions[]): string[] => {
    const counts = new Map<string, number>();
    for (const img of imgList) {
        if (!img.enumName) continue;
        counts.set(img.enumName, (counts.get(img.enumName) || 0) + 1);
    }
    return [...counts.entries()]
        .filter(([, count]) => count > 1)
        .map(([name]) => name);
};
