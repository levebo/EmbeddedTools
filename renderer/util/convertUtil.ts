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
 * @param uint8Array
 */
const uint8ArrayToHexString = (uint8Array: Uint8Array): string => {
    let hexData = []
    uint8Array.forEach((u8Datum) => {
        hexData.push(('0' + u8Datum.toString(16).toLocaleUpperCase()).slice(-2));
    })
    return hexData.join(' ');
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

export {isHexString, hexStringToUint8Array, uint8ArrayToString, uint8ArrayToHexString, formatSize};