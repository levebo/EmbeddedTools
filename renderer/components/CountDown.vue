<script setup lang="ts">
/** 计时器组件 */
import {computed, onUnmounted, ref, watch} from "vue";

defineOptions({name: 'CountDown'})

/*时间*/
const hours = ref(0)
const minutes = ref(0)
const seconds = ref(0)

// 定义计时器 ID
const timerId = ref<NodeJS.Timeout | null>(null)
// 记录开始时间
const startTime = ref(0)
// 记录暂停时间
const pausedTime = ref(0)
// 记录是否暂停
const isPaused = ref(false)

const {start = false, notStartShowTime = false} = defineProps<{
  /**是否开始计时*/
  start?: boolean,
  /**未开始是否显示计时*/
  notStartShowTime?: boolean,
}>()

const emits = defineEmits<{ onStart: [startTime: number], onPause: [pausedTime: number, restart: () => void] }>()

const showCountDownComputed = computed(() => {
  if (notStartShowTime) {
    return true
  } else {
    return startTime.value > 0 || start
  }
})

// 计算时间
const computedTime = () => {
  const currentTime = Date.now()
  const elapsedTime = currentTime - startTime.value
  const totalSeconds = Math.floor(elapsedTime / 1000)
  const newHours = Math.floor(totalSeconds / 3600)
  const newMinutes = Math.floor((totalSeconds % 3600) / 60)
  const newSeconds = Math.floor(totalSeconds % 60)
  hours.value = newHours
  minutes.value = newMinutes
  seconds.value = newSeconds
}

// 开始计时函数
const startTimer = () => {
  console.log('开始计时')
  // 先清除可能存在的旧定时器
  if (timerId.value) {
    clearInterval(timerId.value)
  }
  if (isPaused.value) {
    startTime.value = Date.now() - pausedTime.value
    isPaused.value = false
  } else {
    startTime.value = Date.now()
  }

  // 立即计算一次时间
  computedTime()
  // 设置定时器
  timerId.value = setInterval(() => {
    computedTime()
  }, 1000)
  emits('onStart', startTime.value)
}
// 暂停计时函数
const pauseTimer = () => {
  console.log('暂停计时')
  if (timerId.value) {
    clearInterval(timerId.value)
    timerId.value = null
    pausedTime.value = Date.now() - startTime.value
    isPaused.value = true
    emits('onPause', pausedTime.value, resetTimer)
  }
}
/** 重置计时函数*/
const resetTimer = () => {
  if (timerId.value) {
    clearInterval(timerId.value)
    timerId.value = null
  }
  startTime.value = 0
  pausedTime.value = 0
  hours.value = 0
  minutes.value = 0
  seconds.value = 0
  isPaused.value = false
}

watch(() => start, (value) => {
  if (value) {
    startTimer()
  } else {
    pauseTimer()
  }
}, {immediate: true})
// 暴露给父组件的方法
defineExpose({resetTimer})

onUnmounted(() => {
  if (timerId.value) {
    // 组件卸载时清除定时器
    clearInterval(timerId.value)
  }
})
</script>

<template>
  <div class="countdown" v-if="showCountDownComputed">
    <el-text>{{ hours.toString().padStart(2, '0') }}</el-text>
    <el-text>:</el-text>
    <el-text>{{ minutes.toString().padStart(2, '0') }}</el-text>
    <el-text>:</el-text>
    <el-text>{{ seconds.toString().padStart(2, '0') }}</el-text>
  </div>
</template>

<style scoped>
.countdown {
  display: flex;
  align-items: center;
  gap: 3px;
}
</style>