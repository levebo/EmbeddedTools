const {app, BrowserWindow, ipcMain} = require('electron/main')
const {shell, clipboard, dialog} = require('electron')
const path = require('path');
const {convertImage, generateMasterFile} = require("./imgConvert");
const {readFileSync, stat} = require("node:fs");
const {processImages} = require("./arrayConvertBin");
const fs = require("fs/promises");

let serialPortCallback = null;
// 已经连接过的设备
let connectedDevices = [];
let win = null;
const createWindow = () => {
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
    // win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
}

app.whenReady().then(() => {
    if (require('electron-squirrel-startup')) app.quit();
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

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

    return {success: true, path: result.filePaths[0]};
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

ipcMain.handle('read-and-chunk-file', async (event, {filePath, chunkSize}) => {
    try {
        const data = await fs.readFile(filePath)
        const fileSize = data.byteLength;
        // 判断是否分片
        if (chunkSize === 0) {
            return {success: true, fileSize, list: [data]};
        } else {
            const chunks = []
            for (let i = 0; i < data.length; i += chunkSize) {
                chunks.push(data.subarray(i, i + chunkSize));
            }
            return {success: true, fileSize, list: chunks};
        }
    } catch (error) {
        console.error('读取和分片文件时出错:', error);
        return {success: false, fileSize: 0, list: null};
    }
})

ipcMain.handle('read-json-file', async (event, {filePath}) => {
    try {
        const data = await fs.readFile(filePath, 'utf8')
        return {success: true, data: JSON.parse(data)};
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