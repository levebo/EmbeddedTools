// 检查是否是十六进制字符串
const isHexString = (str: string): boolean => {
    return /^[0-9a-fA-F\s]+$/.test(str);
}

// 将十六进制字符串转换为Uint8Array
const hexStringToUint8Array = (hexString: string): Uint8Array<ArrayBuffer> => {
    // 移除所有空格
    const hex = hexString.replace(/\s/g, '');

    // 确保长度为偶数
    if (hex.length % 2 !== 0) {
        throw new Error('无效的十六进制字符串');
    }

    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        const byte = hex.substring(i * 2, i * 2 + 2);
        bytes[i] = parseInt(byte, 16);
    }

    return bytes;
}
/**
 * uint8数组 转换成文本显示
 * @param uint8Array
 */
const uint8ArrayToString = (uint8Array: Uint8Array): string => {
    // 用于文本解码
    const textDecoder = new TextDecoder();
    // 文本显示模式
    return textDecoder.decode(uint8Array, {stream: true});
}
/**
 * uint8数组 转十六进制字符串
 * @param uint8Array 数据
 * @param separator 分隔符
 */
const uint8ArrayToHexString = (uint8Array: Uint8Array, separator: string = ' '): string => {
    const hexData: string[] = []
    uint8Array.forEach((u8Datum) => {
        hexData.push(('0' + u8Datum.toString(16).toLocaleUpperCase()).slice(-2));
    })
    return hexData.join(separator);
}
/**
 * uint8数组 转ASCII 字符串
 * @param uint8Array
 */
const uint8ArrayToAscii = (uint8Array: Uint8Array): string => {
    let asciiChar = ''
    if (uint8Array.length == 0) {
        return ''
    }
    uint8Array.forEach((byte) => {
        asciiChar += byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.';
    })
    return asciiChar;
}

/**
 * 格式化文件大小
 * @param bytes 字节大小
 */
const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 转换成字节数据
 * @param value 待转换的值
 * @param type 值的类型：文本 | 十六进制 | 十进制 | 二进制
 * @param toType 转换后显示的类型：十六进制 | 十进制
 * @param toByteLen 目标数据字节长度
 */
const convertToByte = (value: string, type: 'text' | 'hex' | 'dec' | 'bin', toType: 'hex' | 'dec', toByteLen?: number): string => {
    function toTypeFun(bytes: Uint8Array, toType: 'hex' | 'dec') {
        let mBytes = bytes
        if (toByteLen !== undefined && mBytes.length !== toByteLen) {
            if (mBytes.length < toByteLen) {
                const len = toByteLen - mBytes.length;
                const newBytes = new Uint8Array(toByteLen);
                for (let i = 0; i < len; i++) {
                    newBytes[i] = 0;
                }
                newBytes.set(mBytes, len);
                mBytes = newBytes;
            } else if (mBytes.length > toByteLen) {
                mBytes = mBytes.slice(0, toByteLen);
            }
        }
        const resStrings: string[] = []
        if (toType === 'hex') {
            mBytes.forEach((byte) => {
                resStrings.push(byte.toString(16).padStart(2, '0').toLocaleUpperCase());
            })
            return resStrings.join(' ');
        } else if (toType === 'dec') {
            return bytes.join(' ');
        }
        return '';
    }

    switch (type) {
        case 'text':
            const encoder = new TextEncoder();
            const byteData = encoder.encode(value);
            return toTypeFun(byteData, toType);
        case 'hex':
            // 确保长度为偶数
            let hexValue = value
            if (hexValue.length % 2 !== 0) {
                hexValue = hexValue.slice(0, hexValue.length - 1) + '0' + hexValue.slice(hexValue.length - 1);
            }
            let bytes = hexStringToUint8Array(hexValue);
            return toTypeFun(bytes, toType);
        case 'dec':
            const newValue = value.replace(/\s/g, '');
            let hexStr = Number(newValue).toString(16);
            // 确保十六进制字符串长度为偶数
            if (hexStr.length % 2 !== 0) {
                hexStr = '0' + hexStr;
            }
            const byteArray = []
            for (let i = 0; i < hexStr.length; i += 2) {
                const byteHex = hexStr.substring(i, i + 2);
                const byte = parseInt(byteHex, 16);
                byteArray.push(byte);
            }
            /*const byteArray = value.split(' ').map((byte) => {
                let num = parseInt(byte, 10);
                if (isNaN(num)) {
                    num = 0;
                } else if (num < 0) {
                    num = 0;
                } else if (num > 255) {
                    num = 255;
                }
                return num;
            });*/
            return toTypeFun(new Uint8Array(byteArray), toType);
        case 'bin':
            const binByteArray = [];
            // 每 8 位一组处理二进制数据
            for (let i = 0; i < value.length; i += 8) {
                const byteStr = value.slice(i, i + 8);
                // 将 8 位二进制字符串转换为十进制整数
                const byte = parseInt(byteStr, 2);
                binByteArray.push(byte);
            }
            return toTypeFun(new Uint8Array(binByteArray), toType);
    }
}

export {
    isHexString,
    hexStringToUint8Array,
    uint8ArrayToString,
    uint8ArrayToHexString,
    uint8ArrayToAscii,
    formatSize,
    convertToByte
};