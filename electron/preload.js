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
     * 读取文件并返回文件分片数组
     * @param filePath 文件路径
     * @param chunkSize 分片大小
     * @returns {Promise<any>}
     */
    readAndChunkFile: (filePath, chunkSize) => ipcRenderer.invoke('read-and-chunk-file', {filePath, chunkSize}),
    /**
     * 读取json文件
     * @param filePath 文件路径
     * @returns {Promise<any>}
     */
    readJSONFile: (filePath) => ipcRenderer.invoke('read-json-file', {filePath}),
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