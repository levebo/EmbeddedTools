// 格式化时间
const formatDate = (date: number) => {
    return new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
}
const formatTime = (date: Date, isMillis = false) => {
    const formattedTime = new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).format(date);
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${formattedTime}.${milliseconds}`;
}
/**
 * 分割字节数组
 * @param byteArr 字节数组
 * @param len 按多大分割默认 8 个字节
 */
const splitBytes = (byteArr: any [], len: number | number[] = 8) => {
    const result = [];
    if (Array.isArray(len)) {
        let offset = 0;
        for (let i = 0; i < len.length; i++) {
            const number = Number(len[i]);
            const chunk = byteArr.slice(offset, offset + number);
            result.push(chunk);
            offset += chunk.length;
        }
    } else {
        for (let i = 0; i < byteArr.length; i += len) {
            const chunk = byteArr.slice(i, i + len);
            result.push(chunk);
        }
    }
    return result;
}

export {formatDate, formatTime, splitBytes};
