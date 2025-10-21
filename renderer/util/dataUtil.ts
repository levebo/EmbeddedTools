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

export {formatDate, formatTime};
