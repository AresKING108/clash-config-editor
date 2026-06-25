<template>
  <div class="subconverter-editor">
    <el-alert
      title="Subconverter 模板文件不是标准 Clash YAML 格式，使用纯文本编辑"
      type="info"
      show-icon
      :closable="false"
      style="margin-bottom: 16px"
    />

    <div class="toolbar">
      <el-select v-model="currentFile" placeholder="选择模板文件" @change="loadFile" style="width: 280px">
        <el-option-group label="Subconverter 模板">
          <el-option label="all_base.tpl (Clash 模板)" value="subconverter_rules/all_base.tpl" />
          <el-option label="groups.txt (策略组定义)" value="subconverter_groups.txt" />
          <el-option label="pref.ini (Subconverter 配置)" value="subconverter_pref.ini" />
          <el-option label="emoji.txt (节点 Emoji)" value="subconverter_emoji.txt" />
        </el-option-group>
        <el-option-group label="规则文件">
          <el-option label="Apple.list" value="subconverter_rules/Apple.list" />
          <el-option label="Netflix.list" value="subconverter_rules/Netflix.list" />
          <el-option label="Telegram.list" value="subconverter_rules/Telegram.list" />
          <el-option label="China.list" value="subconverter_rules/China.list" />
          <el-option label="Global.list" value="subconverter_rules/Global.list" />
        </el-option-group>
        <el-option-group label="OpenClash">
          <el-option label="config.yaml (OpenClash 配置)" value="openclash_config.yaml" />
        </el-option-group>
      </el-select>

      <el-button type="primary" @click="saveFile" :loading="saving" :disabled="!dirty">
        保存
      </el-button>
      <el-tag v-if="dirty" type="warning" size="small">未保存</el-tag>
    </div>

    <div class="editor-container">
      <textarea
        v-model="fileContent"
        class="code-editor"
        :disabled="!currentFile"
        spellcheck="false"
        @input="dirty = true"
      ></textarea>
    </div>

    <div class="status-bar">
      <span v-if="currentFile">{{ currentFile }}</span>
      <span v-if="fileContent"> | {{ fileContent.split('\\\\n').length }} 行 | {{ fileContent.length }} 字符</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { fileAPI } from '@/api'

const currentFile = ref('subconverter_groups.txt')
const fileContent = ref('')
const saving = ref(false)
const dirty = ref(false)
const loading = ref(false)

const loadFile = async () => {
  if (!currentFile.value) return
  loading.value = true
  try {
    const res = await fileAPI.read(currentFile.value)
    if (res && res.content !== undefined) {
      fileContent.value = res.content
    } else {
      fileContent.value = '# 文件不存在或为空'
    }
    dirty.value = false
  } catch (e) {
    fileContent.value = '# 加载失败: ' + e.message
  } finally {
    loading.value = false
  }
}

const saveFile = async () => {
  if (!currentFile.value) return
  saving.value = true
  try {
    // Save as a text/raw config using file save endpoint
    const res = await fileAPI.save(currentFile.value, { raw: fileContent.value })
    if (res && res.success) {
      ElMessage.success('保存成功')
      dirty.value = false
    } else {
      ElMessage.error('保存失败')
    }
  } catch (e) {
    ElMessage.error('保存出错: ' + e.message)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadFile()
})
</script>

<style scoped>
.subconverter-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.editor-container {
  flex: 1;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  min-height: 400px;
}
.code-editor {
  width: 100%;
  height: 100%;
  min-height: 400px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 12px;
  border: none;
  outline: none;
  resize: vertical;
  background: #1e1e1e;
  color: #d4d4d4;
  tab-size: 2;
}
.status-bar {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
