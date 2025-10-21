declare global {
    interface Window {
        electronAPI: {
            /*通过系统协议打开链接*/
            openExternalWindow: (url: string) => Promise<void>;
            /**
             * 转换图像
             * @param options 配置选项
             * @param options.inputPath 输入目录
             * @param options.outputDir 输出目录
             * @param options.isRLE 是否开启RLE编码
             * @param options.littleEndian 是否小端序
             * @param options.isArrayChunk 是否分割总数组
             * @param options.arrayChunkSize 分割大小 单位KB
             * @param options.colorCodedType 颜色编码类型
             */
            convertImage: (options: {
                inputPath: string,
                outputDir: string,
                isRLE: boolean,
                littleEndian: boolean,
                colorCodedType: string
            }) => Promise<{
                success: boolean;
                result?: {
                    fileName: string;
                    originalFileName: string;
                    fileBase64: string;
                    width: number;
                    height: number;
                    originalSize: number;
                    rleSize: number;
                    arrayData: Uint16Array<ArrayBuffer> | Buffer<ArrayBuffer>;
                    compressionRatio: number;
                };
                error?: string;
            }>;
            generateMasterFile: (outputDir: string, images: Array<{
                fileName: string;
                width: number;
                height: number;
                isRLE: boolean;
                littleEndian: boolean;
                colorCodedType: string;
                rleSize: number;
                arrayData: Uint16Array<ArrayBuffer> | Buffer<ArrayBuffer>;
            }>, isArrayChunk: boolean, arrayChunkSize: number) => Promise<{ success: boolean; error?: string }>;
            selectDirectory: (title: string, openTypes?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory' | 'dontAddToRecent'>) => Promise<{
                success: boolean;
                path?: string
            }>;
            getDirectoryFiles: (dirPath: string) => Promise<{ success: boolean; data?: string[]; error?: string }>;
            /**
             * 通过Windows资源管理器打开目录
             * @param path 路径
             */
            openPath: (path: string) => Promise<{ success: boolean; path: string; error?: string }>;
            processImages: (options: {
                files: { fileName: string, filePath: string }[],
                outputDir: string,
                mergedFileName: string
                showRLE: boolean,
                isEnumMapping: boolean
            }) => Promise<{
                results: {
                    success: boolean,
                    fileName: string,
                    path: string,
                    width: number,
                    height: number,
                    size: number,
                    offset: number,
                    fileBase64: string,
                    error?: string
                }[],
                source: { name: string, desc: string, path: string, size: number, createTime: number },
                mergedFile: { name: string, desc: string, path: string, size: number, createTime: number }
            }>;
            /* 串口工具类 */
            /**
             * 获取文件大小
             * @param filePath 文件路径
             */
            getFileSize: (filePath: string) => Promise<{ success: boolean; fileSize: number }>;
            /**
             * 分片读取文件数据
             * @param filePath 文件路径
             * @param chunkIndex 当前分片索引
             * @param chunkSize 分片大小
             */
            readFileChunk: (filePath: string, chunkIndex: number, chunkSize: number) => Promise<{
                success: boolean,
                data: Uint8Array,
                isLast?: boolean,
            }>,
            /**
             * 读取文件并返回文件分片数组
             * @param filePath 文件路径
             * @param chunkSize 分片大小 0为不分片
             */
            readAndChunkFile: (filePath: string, chunkSize: number) => Promise<{
                success: boolean;
                fileSize: number;
                list?: Uint8Array[]
            }>;
            /**
             * 读取json文件数据
             * @param filePath 文件路径
             */
            readJSONFile: (filePath: string) => Promise<{ success: boolean, data: any, error?: string }>
            /**
             * 获取串口列表
             * @param callback
             */
            onSerialPortList: (callback: (...args: any[]) => void) => void;
            /**
             * 移除串口设备回调事件
             * @param callback
             */
            onRemoveSerialPort: (callback: (...args: any[]) => void) => void;
            /**
             * 重新连接已配对串口设备回调事件
             * @param callback
             */
            onReconnectSerialPort: (callback: (...args: any[]) => void) => void;
            /**
             * 选择串口设备
             * @param port 串口设备信息
             */
            selectSerialPort: (port: SerialPort) => Promise<void>;
            /**
             * 复制文本到系统剪切板
             * @param text
             */
            copyText: (text: string) => void;
            /**
             * 把 String写入 文件
             * @param data
             * @param filename 文件名
             */
            downloadFile: (data: string, filename: string) => Promise<{ success: boolean }>;
        };
    }

    interface SerialPortInfo {
        // 对应 unsigned short usbVendorId
        usbVendorId: number;
        // 对应 unsigned short usbProductId
        usbProductId: number;
        // 对应 BluetoothServiceUUID bluetoothServiceClassId
        bluetoothServiceClassId: BluetoothServiceUUID;
    }

    type ParityType = "none" | "even" | "odd";
    type FlowControlType = "none" | "hardware";

    interface SerialOptions {
        // 对应 required unsigned long baudRate
        baudRate: number;

        // 对应 octet dataBits = 8
        dataBits?: number;

        // 对应 octet stopBits = 1
        stopBits?: number;

        // 对应 ParityType parity = "none"
        parity?: ParityType;

        // 对应 unsigned long bufferSize = 255
        bufferSize?: number;

        // 对应 FlowControlType flowControl = "none"
        flowControl?: FlowControlType;
    }

    interface SerialOutputSignals {
        dataTerminalReady: boolean;
        requestToSend: boolean;
        break: boolean;
    }

    interface SerialInputSignals {
        // 对应 required boolean dataCarrierDetect
        dataCarrierDetect: boolean;
        // 对应 required boolean clearToSend
        clearToSend: boolean;
        // 对应 required boolean ringIndicator
        ringIndicator: boolean;
        // 对应 required boolean dataSetReady
        dataSetReady: boolean;
    }

    interface SerialPort extends EventTarget {
        // 对应 onconnect 属性
        onconnect: ((this: SerialPort, ev: Event) => any) | null;
        // 对应 ondisconnect 属性
        ondisconnect: ((this: SerialPort, ev: Event) => any) | null;
        // 对应 connected 只读属性
        readonly connected: boolean;
        // 对应 readable 只读属性
        readonly readable: ReadableStream;
        // 对应 writable 只读属性
        readonly writable: WritableStream;

        // 对应 getInfo 方法
        getInfo?(): SerialPortInfo;

        // 对应 open 方法
        open?(options: SerialOptions): Promise<void>;

        // 对应 setSignals 方法
        setSignals?(signals?: SerialOutputSignals): Promise<void>;

        // 对应 getSignals 方法
        getSignals?(): Promise<SerialInputSignals>;

        // 对应 close 方法
        close?(): Promise<void>;

        // 对应 forget 方法
        forget?(): Promise<void>;

        // Docs: https://electronjs.org/docs/api/structures/serial-port

        /**
         * A stable identifier on Windows that can be used for device permissions.
         *
         * @platform win32
         */
        deviceInstanceId?: string;
        /**
         * A string suitable for display to the user for describing this device.
         */
        displayName?: string;
        /**
         * Unique identifier for the port.
         */
        portId: string;
        /**
         * Name of the port.
         */
        portName: string;
        /**
         * The USB product ID.
         */
        productId?: string;
        /**
         * The USB device serial number.
         */
        serialNumber?: string;
        /**
         * Represents a single serial port on macOS can be enumerated by multiple drivers.
         *
         * @platform darwin
         */
        usbDriverName?: string;
        /**
         * The USB vendor ID.
         */
        vendorId?: string;
    }

    interface SerialPortFilter {
        // 对应 unsigned short usbVendorId
        usbVendorId?: number;
        // 对应 unsigned short usbProductId
        usbProductId?: number;
        // 对应 BluetoothServiceUUID bluetoothServiceClassId
        bluetoothServiceClassId?: BluetoothServiceUUID;
    }

    interface SerialPortRequestOptions {
        filters: SerialPortFilter[];
        allowedBluetoothServiceClassIds: BluetoothServiceUUID[];
    }

    interface Serial extends EventTarget {
        onconnect: ((this: Serial, ev: Event) => any) | null;
        ondisconnect: ((this: Serial, ev: Event) => any) | null;

        getPorts(): Promise<SerialPort[]>;

        requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    }

    // 扩展 Navigator 接口
    interface Navigator {
        readonly serial: Serial;
    }

    /**
     * 发送文件配置
     */
    interface SendFileOptions {
        /*文件路径*/
        filePath: string,
        /*文件大小字节*/
        fileSize: number,
        /*文件传输进度*/
        fileProgress: number,
        /*是否开启文件发送添加自定义脚本处理发送数据格式*/
        isSendCode: boolean,
        /*文件发送脚本代码*/
        sendCode: string,
        /*当前发送的文件数据 u8数组*/
        currentSendBytes: Uint8Array,
        /*当前发送的文件数据是否正确返回响应信息 配合自定义脚本处理时生效*/
        currentReceiveSuccess: boolean,
        /*是否分片发送*/
        isChunkSend: boolean,
        /*分片发送大小 字节 byte*/
        chunkSize: number,
        /*分片发送间隔时间 毫秒 ms*/
        chunkSpeed: number,
        /*开启配置后每次分片接收到指定命令后才发送下一片数据。在响应指令配置*/
        isReceiveCode: boolean,
        /*多长时间未接收到有效响应重试*/
        receiveRetryTime: number,
        /*未接收到响应时重试次数*/
        receiveRetryNum: number,
        /*响应指令脚本代码*/
        receiveCode: string
    }
}

export {ParityType, FlowControlType, SendFileOptions};