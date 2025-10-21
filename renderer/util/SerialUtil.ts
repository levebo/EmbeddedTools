/**
 * 串口工具类*/

const scriptErrMsg = '执行自定义脚本时出错: '
/**
 * 执行发送自定义脚本
 * @param sendData 数据
 * @param scriptCode 脚本代码
 */
const execSendCustomScript = (sendData: Uint8Array, scriptCode: string): Uint8Array => {
    try {
        // 创建一个新的函数，将响应数据作为参数传入
        const fun = new Function('sendData', scriptCode);
        return fun(sendData);
    } catch (error) {
        console.error(scriptErrMsg, error);
        throw new Error(scriptErrMsg + error.message);
    }
}

/**
 * 执行接收自定义脚本
 * @param sendData 发送数据
 * @param receiveData 接收数据
 * @param scriptCode 脚本代码
 */
const execReceiveCustomScript = (sendData: Uint8Array, receiveData: Uint8Array, scriptCode: string): {
    /*返回true：表示继续下一条发送 false：表示继续等待响应和重试知道超时*/
    success: boolean,
    /*发送数据*/
    sendData: Uint8Array,
    /*接收数据 如果要修改接收数据必须返回*/
    receiveData: Uint8Array
} => {
    try {
        // 创建一个新的函数，将响应数据作为参数传入
        const fun = new Function('sendData', 'receiveData', scriptCode);
        return fun(sendData, receiveData);
    } catch (error) {
        console.error(scriptErrMsg, error);
        throw new Error(scriptErrMsg + error.message);
    }
}
/**
 * 等待时间
 * @param timeout 时长 毫秒
 */
const awaitTime = async (timeout: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, timeout));
}

/**
 * 等待时间 支持按固定间隔触发回调
 *
 * @param timeout 等待时长 ms
 * @param interval 回调间隔 ms
 * @param callback 回调函数 返回true则提前结束
 */
const awaitTimeout = async (timeout: number, interval: number, callback: (elapsed: number) => boolean | Promise<boolean>): Promise<void> => {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const elapsed = Date.now() - startTime;

        // 检查是否需要提前结束
        const shouldStop = await callback(elapsed);
        if (shouldStop) {
            return;
        }

        // 等待指定的间隔时间
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    // 等待总时长后执行最后一次检查
    const finalResult = await callback(timeout);
    if (finalResult) {
        return;
    }
}

/**
 * 计算校验和
 * @param data 数组
 * @param len 数组大小
 * @return 校检和
 */
function calculateChecksum(data: number[], len: number): number {
    let sum: number = 0;
    for (let i = 0; i < len; i++) {
        sum += data[i];
    }
    return sum % 256;
}

export {execSendCustomScript, execReceiveCustomScript, awaitTime, awaitTimeout};