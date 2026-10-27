const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openExternalWindow: (url) => ipcRenderer.invoke('open-external-window', url),
    convertImage: (options) => ipcRenderer.invoke('convert-image', options),
    generateMasterFile: (outputDir, images, isArrayChunk, arrayChunkSize) => ipcRenderer.invoke('generate-master-file', {
        outputDir,
        images,
        isArrayChunk,
        arrayChunkSize
    }),
    selectDirectory: (title, openTypes = ['openDirectory']) => ipcRenderer.invoke('select-directory', {
        title,
        openTypes
    }),
    getDirectoryFiles: (dirPath) => ipcRenderer.invoke('get-directory-files', dirPath),
    openPath: (dirPath) => ipcRenderer.invoke('open-directory', dirPath),
    processImages: (options) => ipcRenderer.invoke('process-images', options),
    /**
     * 获取文件大小
     * @param filePath 文件路径
     * @returns {Promise<any>}
     */
    getFileSize: (filePath) => ipcRenderer.invoke('get-file-size', filePath),
    /**
     * 分片读取文件数据
     * @param filePath 文件路径
     * @param chunkIndex 当前分片索引
     * @param chunkSize 分片大小
     * @returns {Promise<any>}
     */
    readFileChunk: (filePath, chunkIndex, chunkSize) => ipcRenderer.invoke('read-file-chunk', {
        filePath,
        chunkIndex,
        chunkSize
    }),
    /**
     * 读取文件字节数组
     * @param filePath 文件路径
     * @returns {Promise<any>}
     */
    readFileBytes: (filePath) => ipcRenderer.invoke('read-file-bytes', {filePath}),
    /**
     * 读取json文件
     * @param filePath 文件路径
     * @returns {Promise<any>}
     */
    readJSONFile: (filePath) => ipcRenderer.invoke('read-json-file', {filePath}),

    /**
     * 读取用户数据保存目录json文件
     * @param fileName 文件名
     * @returns {Promise<any>}
     */
    readUserJSONFile: (fileName) => ipcRenderer.invoke('read-user-json-file', {fileName}),

    /**
     * 流式读取用户数据保存目录json文件
     * @param fileName 文件名
     * @param type 自定义类型用于区分后续的数据回调是谁发起的
     * @param jsonPath 读取规则可以指定读取某些内容
     * @returns {Promise<any>}
     */
    readStreamUserJSONFile: (fileName, type, jsonPath) => ipcRenderer.invoke('read-stream-user-json-file', {
        fileName,
        type,
        jsonPath
    }),

    /**
     * 监听读取json数据 流式传输
     * @param callback
     * @returns {Promise<any>}
     */
    onReadStreamUserJSONData: (callback) => ipcRenderer.on('on-read-stream-user-json-data', (event, {
        data,
        type
    }) => callback(data, type)),
    /**
     * 监听读取json数据 流式传输 数据完成回调
     * @param callback
     * @returns {Electron.IpcRenderer}
     */
    onReadStreamUserJSONEnd: (callback) => ipcRenderer.on('on-read-stream-user-json-end', (event, {type}) => callback(type)),

    /**
     * 流式读取用户数据保存目录json文件
     * @param fileName 文件名
     * @param jsonPath json读取规则可以指定读取某些内容
     * @param modify 需要修改的数据键值
     * @returns {Promise<any>}
     */
    modifyStreamUserJSONFile: (fileName, jsonPath, modify) => ipcRenderer.invoke('modify-stream-user-json-file', {
        fileName,
        jsonPath,
        modify
    }),

    /**
     * 写入json数据到用户数据保存目录
     * @param fileName 文件名
     * @param data 写入数据
     * @returns {Promise<any>}
     */
    writeUserJSONFile: (fileName, data) => ipcRenderer.invoke('write-user-json-file', {fileName, data}),

    /**
     * 读取界面布局数据（旧版格式会自动迁移）
     * @returns {Promise<{success: boolean, data?: UILayoutProject, error?: string}>}
     */
    loadUILayout: () => ipcRenderer.invoke('load-ui-layout'),

    /**
     * 保存界面布局数据
     * @param store 布局数据
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    saveUILayout: (store) => ipcRenderer.invoke('save-ui-layout', store),

    /**
     * 读取base64 图片文件
     * @param filePath 文件路径
     * @param fileName 文件名
     */
    readImageBase64: (filePath, fileName) => ipcRenderer.invoke('read-image-base64', {
        filePath,
        fileName
    }),
    onSerialPortList: (callback) => {
        ipcRenderer.on('serial-port-list', (event, list) => {
            callback(list);
        });
    },
    selectSerialPort: (port) => ipcRenderer.send('select-serial-port', port),
    /**
     * 移除串口设备回调
     * @param callback
     * @returns {Electron.IpcRenderer}
     */
    onRemoveSerialPort: (callback) => ipcRenderer.on('remove-serial-port', (event, port) => {
        callback(port);
    }),
    /**
     * 重新连接配对过的串口设备回调
     * @param callback
     * @returns {Electron.IpcRenderer}
     */
    onReconnectSerialPort: (callback) => ipcRenderer.on('reconnect-serial-port', (event, port) => callback(port)),
    /**
     * 复制文本到系统剪切板
     * @param text
     */
    copyText: (text) => ipcRenderer.invoke('copy-text', text),
    downloadFile: (data, filename) => ipcRenderer.invoke('download-file', {data, filename}),
});