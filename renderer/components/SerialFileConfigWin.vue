<script setup lang="ts">

import {nextTick, reactive, ref} from "vue";
import {InfoFilled} from "@element-plus/icons-vue";
// language
import "codemirror/mode/javascript/javascript.js";
import Codemirror from "codemirror-editor-vue3";
// placeholder
import "codemirror/addon/display/placeholder.js";
import {Editor, EditorConfiguration} from "codemirror";
import {EpPropMergeType} from "element-plus/es/utils";

/*串口工具发送文件配置弹窗*/
defineOptions({name: 'SerialFileConfigWin'})

const {
  btnText = "配置", btnIsText = false, btnType = "", fileOptions
} = defineProps<{
  /*按钮文字*/
  btnText?: string,
  /*是否是文本类型按钮*/
  btnIsText?: boolean,
  /*按钮类型*/
  btnType?: EpPropMergeType<StringConstructor, "" | "default" | "text" | "primary" | "success" | "warning" | "info" | "danger", unknown>,
  /*发送文件配置*/
  fileOptions: SendFileOptions
}>();

const show = ref(false)
const tabIndex = ref('base')

const cmSendOptions: EditorConfiguration = reactive({
  mode: "javascript",
  theme: "default",
  readOnly: false,
  lineNumbers: true,
  lineWiseCopyCut: true,
  gutters: ["CodeMirror-lint-markers"],
  lint: true,
});
const cmReceiveOptions: EditorConfiguration = reactive({
  mode: "javascript",
  theme: "default",
  readOnly: false,
  lineNumbers: true,
  lineWiseCopyCut: true,
  gutters: ["CodeMirror-lint-markers"],
  lint: true,
});
/*发送指令脚本代码实例对象*/
const cmSendInstance = ref<Editor | null>(null);
/*接收指令脚本代码实例对象*/
const cmReceiveInstance = ref<Editor | null>(null);
const onReadySend = (cm: Editor) => {
  cmSendInstance.value = cm;
};
const onReadyReceive = (cm: Editor) => {
  cmReceiveInstance.value = cm;
};

const tabChange = async (name: string) => {
  switch (name) {
    case "base":
      break;
    case "sendCode":
      await nextTick()
      if (cmSendInstance.value) {
        cmSendInstance.value.refresh();
      }
      break;
    case "receiveCode":
      await nextTick()
      if (cmReceiveInstance.value) {
        cmReceiveInstance.value.refresh();
      }
      break;
    default:
      break;
  }
}

const handleShow = () => {
  tabIndex.value = 'base'
  show.value = true
}

const handleClose = (done: () => void) => {
  done()
}
</script>

<template>
  <el-button :type="btnType" :text="btnIsText" :style="{marginLeft: btnIsText ? '-10px' : '8px',flex: 1}"
             @click="handleShow">{{
      btnText
    }}
  </el-button>
  <el-dialog
      v-model="show"
      title="发送文件配置"
      width="900"
      append-to-body
      :before-close="handleClose"
  >
    <el-tabs @tab-change="tabChange" v-model="tabIndex">
      <el-tab-pane label="基本配置" name="base">
        <el-form :label-width="160" label-position="right">
          <el-row>
            <el-col :span="12">
              <el-form-item label="是否分片发送">
                <el-switch v-model="fileOptions.isChunkSend"></el-switch>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item v-if="fileOptions.isChunkSend" label="分片发送大小">
                <el-input v-model="fileOptions.chunkSize">
                  <template #append>
                    字节
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item v-if="fileOptions.isChunkSend" label="分片发送间隔">
                <el-input v-model="fileOptions.chunkSpeed">
                  <template #append>
                    毫秒
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :span="24">
              <el-form-item label="启用自定义发送格式">
                <el-switch v-model="fileOptions.isSendCode"/>
                <el-tag style="margin-left: 10px;" type="info">
                  <el-icon>
                    <InfoFilled/>
                  </el-icon>
                  开启后可以配置发送文件的数据格式。在发送指令配置
                </el-tag>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row>
            <el-col :span="24">
              <el-form-item label="是否响应RX状态">
                <el-switch v-model="fileOptions.isReceiveCode"/>
                <el-tag style="margin-left: 10px;" type="info">
                  <el-icon>
                    <InfoFilled/>
                  </el-icon>
                  配置后每次分片接收到指定命令后才发送下一片数据。在响应指令配置
                </el-tag>
              </el-form-item>
            </el-col>
          </el-row>
          <el-row v-if="fileOptions.isReceiveCode">
            <el-col :span="12">
              <el-form-item label="未响应重试时间">
                <el-input v-model="fileOptions.receiveRetryTime">
                  <template #append>
                    毫秒
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="重试次数">
                <el-input v-model="fileOptions.receiveRetryNum">
                  <template #append>
                    次
                  </template>
                </el-input>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </el-tab-pane>
      <el-tab-pane v-if="fileOptions.isSendCode" label="发送指令配置" name="sendCode">
        <Codemirror v-model:value="fileOptions.sendCode"
                    :options="cmSendOptions" height="460" width="100%" :border="true"
                    @ready="onReadySend"/>
      </el-tab-pane>
      <el-tab-pane v-if="fileOptions.isReceiveCode" label="响应指令配置" name="receiveCode">
        <Codemirror v-model:value="fileOptions.receiveCode"
                    :options="cmReceiveOptions" height="460" width="100%" :border="true"
                    @ready="onReadyReceive"/>
      </el-tab-pane>
    </el-tabs>
    <template #footer>
      <el-button @click="show = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>

</style>