const {app, BrowserWindow, ipcMain} = require('electron/main')
const {shell, clipboard, dialog} = require('electron')
const path = require('path');
const {execFile} = require('node:child_process');
const {convertImage, generateMasterFile, readImageBase64} = require("./imgConvert");
const {readFileSync, createReadStream, renameSync} = require("node:fs");
const {processImages} = require("./arrayConvertBin");
const fs = require("fs/promises");
const JSONStream = require('JSONStream');
const {pinyin} = require("pinyin");
const {createWriteStream} = require("fs");
const {access, writeFile} = require("node:fs/promises");
const {json} = require("node:stream/consumers");

const {chain} = require('stream-chain')
const {parser} = require('stream-json/Parser')
const {pick} = require('stream-json/filters/Pick');
const {streamArray} = require('stream-json/streamers/StreamArray');
const {streamObject} = require('stream-json/streamers/StreamObject');
const {streamValues} = require('stream-json/streamers/StreamValues');
const {replace} = require('stream-json/filters/Replace')
const {stringer} = require('stream-json/Stringer');
const {Readable} = require("node:stream");

// Squirrel 的安装/更新/卸载事件必须尽早处理并退出，不能创建窗口
const isSquirrelStartup = require('electron-squirrel-startup');

let serialPortCallback = null;
// 已经连接过的设备
let connectedDevices = [];
let win = null;
// 开发环境（electron-forge start）与打包后的 app 使用不同的加载方式
const isDev = !app.isPackaged;
// Squirrel 安装/更新完成后会自动拉起一次应用，此时安装器可能还没释放文件
const isSquirrelLaunch = process.argv.includes('--squirrel-firstrun')
    || process.argv.includes('--squirrel-updated');
// firstrun 实例会被安装器等待退出，加载完成后需要重启一个不带该参数的实例
const isSquirrelFirstRun = process.argv.includes('--squirrel-firstrun');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const UNINSTALL_REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\embedded_tools';
const REG_EXE = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');

/**
 * 同步卸载列表信息
 * Squirrel 默认会把 DisplayIcon 指向 app.ico（Electron 默认图标），
 * 且更新后 DisplayVersion 可能不刷新；这里在打包版启动时统一纠正。
 */
const syncUninstallEntry = () => {
    if (process.platform !== 'win32' || isDev) return;
    execFile(REG_EXE, ['query', UNINSTALL_REG_KEY], {windowsHide: true}, (queryError) => {
        if (queryError) return; // 卸载项还没创建（安装尚未完成）
        const setValue = (name, value) => {
            execFile(REG_EXE, [
                'add', UNINSTALL_REG_KEY,
                '/v', name,
                '/t', 'REG_SZ',
                '/d', value,
                '/f'
            ], {windowsHide: true}, (error) => {
                if (error) console.warn(`设置卸载项 ${name} 失败:`, error.message);
            });
        };
        setValue('DisplayIcon', process.execPath);
        setValue('DisplayVersion', app.getVersion());
    });
};

/**
 * 加载打包后的页面
 * Squirrel 首次拉起时偶发 ERR_FAILED，重试几次；仍失败则静默退出，
 * 让安装流程结束，用户从开始菜单正常启动即可。
 */
const loadProductionPage = async () => {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await win.loadFile(indexPath);
            return true;
        } catch (error) {
            console.error(`加载 dist/index.html 失败（第 ${attempt} 次）:`, error);
            if (attempt < maxAttempts) {
                await wait(800);
                continue;
            }
            if (isSquirrelLaunch) {
                console.warn('Squirrel 安装/更新拉起阶段加载失败，退出等待用户正常启动');
                app.quit();
            } else {
                dialog.showErrorBox('加载失败', `无法加载 dist/index.html：${error.message}`);
            }
        }
    }
    return false;
};

const createWindow = async () => {
    win = new BrowserWindow({
        width: 1200,
        height: 860,
        icon: path.resolve(__dirname, '..', 'dist', 'icons', 'png', '256x256.png'),
        webPreferences: {
            preload: path.resolve(__dirname, 'preload.js')
        }
    })


    // 处理串口设备
    win.webContents.session.on('select-serial-port', (event, portList, webContents, callback) => {
        win.webContents.session.on('serial-port-added', (event, port) => {
            console.log('serial-port-added FIRED WITH', port)
            // 检查新插入的设备是否为之前连接过的设备
            for (let i = 0; i < connectedDevices.length; i++) {
                const {vendorId, productId} = connectedDevices[i];
                if (port.vendorId === vendorId && port.productId === productId) {
                    win.webContents.send('reconnect-serial-port', port);
                    //callback(port.portId);
                    break;
                }
            }
        })
        win.webContents.session.on('serial-port-removed', (event, port) => {
            win.webContents.send('remove-serial-port', port);
            console.log('serial-port-removed FIRED WITH', port)
            /*const index = connectedDevices.indexOf(port.portId);
            if (index !== -1) {
                connectedDevices.splice(index, 1);
            }*/
        })
        event.preventDefault()
        serialPortCallback = callback;
        win.webContents.send('serial-port-list', portList);
        /*if (portList && portList.length > 0) {

            callback(portList[0].portId)
        } else {
            callback('')
        }*/
    });

    win.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        if (permission === 'serial' && (details.securityOrigin === 'file:///' || details.securityOrigin === 'http://localhost:5173/')) {
            return true;
        }
        return false;
    })
    win.webContents.session.setDevicePermissionHandler((details) => {
        if (details.deviceType === 'serial' && (details.origin === 'file://' || details.origin === 'http://localhost:5173')) {
            return true;
        }
        return false;
    })

    win.menuBarVisible = false;
    if (isDev) {
        try {
            await win.loadURL('http://localhost:5173');
            win.webContents.openDevTools();
        } catch (error) {
            dialog.showErrorBox('开发服务器未启动', '请先运行 npm run dev，再启动 Electron。');
        }
    } else {
        await loadProductionPage();
    }
}

const createWindowSafe = () => {
    createWindow().catch(error => {
        console.error('创建窗口失败:', error);
        dialog.showErrorBox('启动失败', error.message);
    });
};

if (isSquirrelStartup) {
    // 处理安装/更新/卸载事件后立即退出，避免创建窗口卡住 Squirrel 的 loading 界面
    app.quit();
} else {
    app.whenReady().then(() => {
        syncUninstallEntry();

        // 首次安装后 Squirrel 会等待这个进程退出；这里不创建主窗口，
        // 稍后重启一个不带 --squirrel-firstrun 的实例，安装器关闭后只打开一次主界面。
        if (isSquirrelFirstRun) {
            const relaunchArgs = process.argv.slice(1).filter(arg => arg !== '--squirrel-firstrun');
            setTimeout(() => {
                app.relaunch({args: relaunchArgs});
                app.exit(0);
            }, 1200);
            return;
        }

        createWindowSafe()

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindowSafe()
            }
        })
    })
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

// 在外部打开链接
ipcMain.handle('open-external-window', async (event, url) => {
    try {
        await shell.openExternal(url);
    } catch (err) {
        console.error('打开链接失败: ', err);
    }
})

// 处理图像转换请求
ipcMain.handle('convert-image', async (event, options) => {
    try {
        const result = await convertImage(options);
        return {success: true, result};
    } catch (error) {
        return {success: false, error: error.message};
    }
});

// 处理生成总文件请求
ipcMain.handle('generate-master-file', async (event, {outputDir, images, isArrayChunk, arrayChunkSize}) => {
    try {
        await generateMasterFile(outputDir, images, isArrayChunk, arrayChunkSize);
        return {success: true};
    } catch (error) {
        return {success: false, error: error.message};
    }
});

// 处理目录选择请求
ipcMain.handle('select-directory', async (event, {title, openTypes}) => {
    const result = await dialog.showOpenDialog({
        title,
        properties: openTypes
    });

    if (result.canceled) {
        return {success: false, path: null};
    }
    let paths = []
    for (const filePath of result.filePaths) {
        paths.push(path.parse(filePath));
    }
    return {success: true, path: result.filePaths[0], paths};
});

ipcMain.handle('get-file-size', async (event, filePath) => {
    try {
        const stat = await fs.stat(filePath);
        return {success: true, fileSize: stat.size};
    } catch (error) {
        return {success: false, fileSize: 0};
    }
})

ipcMain.handle('read-file-chunk', async (event, {filePath, chunkIndex, chunkSize}) => {
    try {
        chunkSize = Number(chunkSize);
        const fd = await fs.open(filePath, 'r');
        const start = chunkIndex * chunkSize;
        const buffer = Buffer.alloc(chunkSize);

        const {bytesRead} = await fd.read(buffer, 0, chunkSize, start);
        await fd.close();

        // 返回实际读取的数据（可能小于chunkSize）
        const data = bytesRead < chunkSize ? buffer.subarray(0, bytesRead) : buffer;
        return {success: true, data: new Uint8Array(data), isLast: bytesRead < chunkSize};
    } catch (error) {
        console.error('读取文件块时出错:', error);
        return {success: false, data: null};
    }
})

ipcMain.handle('read-file-bytes', async (event, {filePath}) => {
    try {
        const data = await fs.readFile(filePath)
        const fileSize = data.byteLength;
        return {success: true, fileSize, data: data};
    } catch (error) {
        console.error('读取文件时出错:', error);
        return {success: false, fileSize: 0, data: null};
    }
})

async function readJson(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8')
        return {success: true, data: JSON.parse(data)};
    } catch (error) {
        return {success: false, error: error.message};
    }
}

ipcMain.handle('read-json-file', async (event, {filePath}) => {
    return await readJson(filePath);
})

ipcMain.handle('read-user-json-file', async (event, {fileName}) => {
    const filePath = path.join(app.getPath("userData"), fileName);
    return await readJson(filePath);
})

ipcMain.handle('read-stream-user-json-file', async (event, {fileName, type, jsonPath}) => {
    return new Promise(async (resolve, reject) => {
        const filePath = path.join(app.getPath("userData"), fileName);

        // 检查文件
        try {
            await access(filePath);
        } catch {
            // 文件不存在，创建一个空的 JSON 文件
            try {
                await writeFile(filePath, '{}');
            } catch (writeErr) {
                return Promise.reject({success: false, error: `无法创建文件 ${filePath}: ${writeErr.message}`});
            }
        }

        const readStream = createReadStream(filePath, {encoding: "utf8"});
        const parser = JSONStream.parse(jsonPath)
        readStream.pipe(parser);
        // 处理解析出的数据
        parser.on('data', (data) => {
            event.sender.send('on-read-stream-user-json-data', {data, type})
        })
        // 处理解析完成事件
        parser.on('end', () => {
            event.sender.send('on-read-stream-user-json-end', {type})
            resolve({success: true});
        });
        // 处理错误事件
        parser.on('error', (err) => {
            reject({success: false, error: err.message});
        });
    })
})

ipcMain.handle('write-user-json-file', async (event, {fileName, data}) => {
    try {
        const filePath = path.join(app.getPath('userData'), fileName);
        await fs.writeFile(filePath, data);
        return {success: true};
    } catch (error) {
        return {success: false, error: error.message};
    }
})

// ---------------------- 界面布局数据 --------------------------
const UI_LAYOUT_FILE_NAME = 'ui-layout.json';
const MAX_UI_LAYOUT_SCREENS = 50;

/**
 * 从目录路径取最后一段作为默认布局名称
 * @param inputDir 资源目录
 * @returns {string}
 */
function uiLayoutDefaultName(inputDir) {
    const parts = String(inputDir || '').split(/[\\/]/).filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : '未命名布局';
}

/**
 * 创建一个默认界面
 * @returns {{id: string, name: string, codeName: string, width: number, height: number, bgColor: string, items: *[]}}
 */
function createDefaultScreen() {
    return {
        id: 'screen_1',
        name: '主界面',
        codeName: 'SCREEN_1',
        width: 240,
        height: 240,
        bgColor: '#ffffff',
        items: []
    };
}

/**
 * 旧版布局数据迁移
 * 旧版把 imgList、base64 全部存进 JSON，这里只保留“枚举名 + 坐标”，
 * 图片在加载布局时从 inputDir 重新读取。
 * @param oldData 旧版 ui-layout.json 内容
 * @returns {{version: number, history: *[]}}
 */
function migrateUiLayoutV1(oldData) {
    const history = [];
    const dataMap = oldData && typeof oldData === 'object' && oldData.data && typeof oldData.data === 'object'
        ? oldData.data
        : {};
    const historyList = Array.isArray(oldData?.historyList) ? oldData.historyList : [];
    const seen = new Set();

    const pushRecord = (id, meta) => {
        const key = String(id ?? '');
        if (!key || seen.has(key)) return;
        const record = dataMap[key];
        if (!record) return;
        seen.add(key);

        const option = record.uiLayoutOption || {};
        const layout = record.uiLayoutData || {};
        const imgByIndex = new Map();
        for (const img of option.imgList || []) {
            if (img && typeof img.index === 'number') {
                imgByIndex.set(img.index, img);
            }
        }

        const items = [];
        (layout.list || []).forEach((item, index) => {
            if (!item) return;
            const img = imgByIndex.get(item.index) || {};
            const enumName = item.enumName || img.enumName || '';
            const fileName = item.fileName || img.fileName || '';
            if (!enumName && !fileName) return;
            items.push({
                id: item.id || `v1_${key}_${index}`,
                enumName,
                fileName,
                x: Number(item.x) || 0,
                y: Number(item.y) || 0
            });
        });

        const rawName = record.name || meta?.name || '';
        history.push({
            id: key,
            name: rawName && !/[\\/]/.test(rawName) ? rawName : uiLayoutDefaultName(option.inputDir),
            inputDir: option.inputDir || '',
            width: Number(option.width ?? option.inputWidth) || 240,
            height: Number(option.height ?? option.inputHeight) || 240,
            bgColor: option.bgColor || '#ffffff',
            updateTime: Date.parse(meta?.updateTime) || Date.now(),
            items
        });
    };

    historyList.forEach(item => {
        if (item && item.key !== undefined) pushRecord(item.key, item);
    });
    // 兜底：historyList 缺失但 data 里还有记录
    Object.keys(dataMap).forEach(key => pushRecord(key, null));

    history.sort((a, b) => b.updateTime - a.updateTime);
    return {version: 2, history: history.slice(0, MAX_UI_LAYOUT_SCREENS)};
}

/**
 * v2 的“多个快照”迁移成 v3 的“多个界面”
 * @param store v2 布局数据
 * @returns {{version: number, name: string, inputDir: string, activeScreenId: string, screens: *[]}}
 */
function migrateUiLayoutV2ToProject(store) {
    const history = Array.isArray(store?.history) ? store.history : [];
    const screens = history.map((item, index) => ({
        id: String(item.id || `screen_${index + 1}`),
        name: item.name || `界面${index + 1}`,
        codeName: `SCREEN_${index + 1}`,
        width: Number(item.width) || 240,
        height: Number(item.height) || 240,
        bgColor: item.bgColor || '#ffffff',
        items: Array.isArray(item.items) ? item.items : []
    }));
    if (screens.length === 0) {
        screens.push(createDefaultScreen());
    }
    const inputDir = history.find(item => item.inputDir)?.inputDir || '';
    const name = uiLayoutDefaultName(inputDir);
    return {
        version: 3,
        name: name === '未命名布局' ? '未命名工程' : name,
        inputDir,
        activeScreenId: screens[0].id,
        screens: screens.slice(0, MAX_UI_LAYOUT_SCREENS)
    };
}

/**
 * 原子写入 JSON，避免写到一半留下半个文件
 * @param filePath 目标路径
 * @param data 数据
 */
async function writeJsonFileAtomic(filePath, data) {
    const tempFilePath = `${filePath}.tmp`;
    await fs.writeFile(tempFilePath, JSON.stringify(data));
    await fs.rename(tempFilePath, filePath);
}

/**
 * 读取界面工程数据，旧格式会自动迁移并备份
 */
ipcMain.handle('load-ui-layout', async () => {
    const filePath = path.join(app.getPath('userData'), UI_LAYOUT_FILE_NAME);
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        let data;
        try {
            data = JSON.parse(raw);
        } catch (error) {
            return {success: false, error: `布局数据解析失败: ${error.message}`};
        }
        if (data && data.version === 3 && Array.isArray(data.screens)) {
            return {success: true, data};
        }

        let legacy = data;
        let backupSuffix = 'v1';
        if (data && data.version === 2 && Array.isArray(data.history)) {
            backupSuffix = 'v2';
        } else {
            legacy = migrateUiLayoutV1(data);
        }
        const project = migrateUiLayoutV2ToProject(legacy);
        await fs.writeFile(`${filePath}.${backupSuffix}.bak`, raw);
        await writeJsonFileAtomic(filePath, project);
        return {success: true, data: project, migrated: true};
    } catch (error) {
        if (error.code === 'ENOENT') {
            return {
                success: true,
                data: {
                    version: 3,
                    name: '未命名工程',
                    inputDir: '',
                    activeScreenId: 'screen_1',
                    screens: [createDefaultScreen()]
                }
            };
        }
        return {success: false, error: error.message};
    }
});

/**
 * 保存界面工程数据
 */
ipcMain.handle('save-ui-layout', async (event, store) => {
    const filePath = path.join(app.getPath('userData'), UI_LAYOUT_FILE_NAME);
    try {
        const project = store && store.version === 3 && Array.isArray(store.screens)
            ? store
            : migrateUiLayoutV2ToProject(store);
        const screens = project.screens.slice(0, MAX_UI_LAYOUT_SCREENS).map((screen, index) => ({
            id: String(screen.id || `screen_${index + 1}`),
            name: screen.name || `界面${index + 1}`,
            codeName: screen.codeName || `SCREEN_${index + 1}`,
            width: Number(screen.width) || 240,
            height: Number(screen.height) || 240,
            bgColor: screen.bgColor || '#ffffff',
            items: Array.isArray(screen.items) ? screen.items : []
        }));
        if (screens.length === 0) {
            screens.push(createDefaultScreen());
        }
        const activeScreenId = screens.some(screen => screen.id === project.activeScreenId)
            ? project.activeScreenId
            : screens[0].id;
        await writeJsonFileAtomic(filePath, {
            version: 3,
            name: project.name || '未命名工程',
            inputDir: project.inputDir || '',
            activeScreenId,
            screens
        });
        return {success: true};
    } catch (error) {
        return {success: false, error: error.message};
    }
});

/*ipcMain.handle('modify-stream-user-json-file', async (event, {fileName, jsonPath, modify}) => {
    try {
        const filePath = path.join(app.getPath('userData'), fileName);

        const tempFilePath = `${filePath}.temp`;
        const readStream = createReadStream(filePath, {encoding: "utf8"});
        const writeStream = createWriteStream(tempFilePath, {encoding: "utf8"});
        const parser = JSONStream.parse(jsonPath)
        // 创建一个转换流来处理数据
        const transform = es.mapSync((data) => {
            console.log('transform原始数据:', JSON.stringify(data));
            if (modify.type === 'object') {
                for (const modifyKey in modify.data) {
                    data[modifyKey] = modify.data[modifyKey];
                }
            } else if (modify.type === 'array') {
                data = modify.data[modify.key];
            }
            console.log('transform修改后的数据:', JSON.stringify(data));
            return data;
        })
        // 创建一个序列化器
        let stringifier;
        if (modify.type === 'object') {
            stringifier = JSONStream.stringifyObject()
        } else if (modify.type === 'array') {
            stringifier = JSONStream.stringify();
        }
        // 管道连接各个流
        readStream.pipe(parser)
            .pipe(transform)
            .pipe(stringifier)
            .pipe(writeStream);
        // 处理完成事件
        await new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                console.log('文件修改完成');
                // 用临时文件替换原文件
                renameSync(tempFilePath, filePath);
                resolve();
            });

            // 处理错误事件
            writeStream.on('error', (err) => {
                console.error('修改文件时出错:', err);
                reject(err);
            });
        });
        return {success: true};
    } catch (error) {
        return {success: false, error: error.message};
    }
})*/

ipcMain.handle('modify-stream-user-json-file', async (event, {fileName, jsonPath, modify}) => {
    try {
        const filePath = path.join(app.getPath('userData'), fileName);
        const tempFilePath = `${filePath}.temp`;
        const writeStream = createWriteStream(tempFilePath, {encoding: "utf8"});

        // 转换要替换的数据成token流
        const parserData = parser();
        let dataToken;
        Readable.from(JSON.stringify(modify.data)).pipe(parserData)
        await new Promise((resolve, reject) => {
            const tokens = []
            parserData.on('data', (data) => {
                tokens.push(data);
            })
            parserData.on('end', () => {
                dataToken = tokens;
                resolve();
            })
            parserData.on('error', (err) => {
                reject(err)
            })
        })
        // 构建处理流
        const pipeline = chain([
            createReadStream(filePath, {encoding: "utf8"}),
            parser(),
            replace({
                filter: jsonPath, replacement: dataToken
            }),
            stringer(),
            writeStream
        ])
        // 处理完成事件
        await new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                console.log('文件修改完成');
                // 用临时文件替换原文件
                renameSync(tempFilePath, filePath);
                resolve();
            })
            pipeline.on('error', (err) => {
                console.error('修改文件时出错:', err);
                reject(err)
            })
        })
        return {success: true};
    } catch (error) {
        return {success: false, error: error.message};
    }
})

/**
 * 枚举名兜底：文件名里没有可用字母/数字时，用文件名哈希生成稳定名称
 * 注意：arrayConvertBin.js 中有同样的实现，两处必须保持一致
 * @param fileName 文件名（不含扩展名）
 * @returns {string}
 */
function enumNameFallback(fileName) {
    let hash = 0;
    for (let i = 0; i < fileName.length; i++) {
        hash = ((hash << 5) - hash + fileName.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16).toUpperCase();
}

ipcMain.handle('read-image-base64', async (event, {filePath, fileName}) => {
    try {
        const stat = await fs.stat(filePath);
        const pinyinName = pinyin(fileName, {style: pinyin.STYLE_NORMAL, segment: true}).flat().join('_')
        // 将拼音转换为大写
        const upperCasePinyin = pinyinName.toUpperCase();
        // 移除特殊字符，只保留字母、数字和下划线
        const validName = upperCasePinyin.replace(/[^a-zA-Z0-9_]/g, '');
        // 确保不以数字开头，如果以数字开头则添加前缀；纯符号名用哈希兜底
        const finalName = validName
            ? (/^\d/.test(validName) ? `IMG_${validName}` : validName)
            : `IMG_${enumNameFallback(fileName)}`;
        const image = await readImageBase64(filePath);
        return {
            success: true,
            size: stat.size,
            enumName: finalName,
            ...image
        };
    } catch (error) {
        return {success: false, error: error.message};
    }
})

ipcMain.handle('get-directory-files', async (event, dirPath) => {
    console.log(`Getting files from: ${dirPath}`);
    try {
        const fs = await import('fs/promises');
        const files = await fs.readdir(dirPath);
        return {success: true, data: files};
    } catch (error) {
        return {success: false, error: error.message};
    }
});

// 通过Windows资源管理器打开目录
ipcMain.handle('open-directory', async (event, outputDir) => {
    try {
        const res = await shell.openPath(outputDir);
        return {success: true, path: outputDir};
    } catch (error) {
        return {success: false, error: '打开目录失败'};
    }
})


// 解析C文件
ipcMain.handle('parse-c-file', async (_, filePath) => {
    try {
        const content = readFileSync(filePath, 'utf-8');
        return {success: true, content};
    } catch (error) {
        return {success: false, error: `读取文件失败: ${error.message}`};
    }
});


// 处理图像数据
ipcMain.handle('process-images', async (_, options) => {
    return processImages(options);
});

ipcMain.on('select-serial-port', async (_, port) => {
    serialPortCallback(port.portId);
    // 记录已连接设备的 vendorId 和 productId
    const {vendorId, productId} = port;
    const device = {vendorId, productId};
    if (!connectedDevices.some(d => d.vendorId === vendorId && d.productId === productId)) {
        connectedDevices.push(device);
    }
});

ipcMain.handle('copy-text', (_, text) => {
    clipboard.writeText(text);
})

ipcMain.handle('download-file', async (_, {data, filename}) => {
    const {canceled, filePath} = await dialog.showSaveDialog(win, {
        defaultPath: path.join(app.getPath('downloads'), filename)
    });
    if (!canceled) {
        try {
            // 写入文件
            await fs.writeFile(filePath, data);
            return {success: true};
        } catch (error) {
            console.error('文件保存失败:', error);
            return {success: false};
        }
    }
    return {success: false};
})