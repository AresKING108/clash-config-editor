<template>
  <div class="yaml-editor-app">
    <!-- 顶栏 -->
    <div class="top-bar">
      <div class="app-title">YAML编辑器</div>
      <div class="top-actions">
        <el-tag v-if="routerConnected" type="success" size="small" effect="dark" class="status-tag">
          {{ routerInfo }}
        </el-tag>
        <el-tag v-else type="danger" size="small" effect="dark" class="status-tag">
          路由器未连接
        </el-tag>
        <el-button size="small" @click="refreshAllStatus" :loading="statusLoading">
          刷新状态
        </el-button>
      </div>
    </div>

    <!-- 主体 -->
    <el-tabs v-model="activeTab" class="main-tabs" @tab-click="onTabChange">
      <!-- ============ OpenClash 热重载 ============ -->
      <el-tab-pane label="OpenClash 热重载" name="openclash">
        <div class="tab-content">
          <div class="action-bar">
            <el-space>
              <el-button type="primary" @click="pullOpenClash" :loading="ocLoading">
                拉取文件
              </el-button>
              <el-button type="success" @click="applyOpenClash" :loading="applyOCLoading">
                应用修改
              </el-button>
            </el-space>
            <el-tag v-if="ocActiveConfig" type="info" effect="plain">
              当前: {{ ocActiveConfig }}
            </el-tag>
          </div>
          <div class="editor-wrapper">
            <textarea
              v-model="ocYamlContent"
              class="yaml-editor"
              spellcheck="false"
              placeholder="点击「拉取文件」获取路由器上当前 OpenClash 配置..."
            ></textarea>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ Subconverter 模板 ============ -->
      <el-tab-pane label="Subconverter 模板" name="subconverter">
        <div class="tab-content">
          <div class="action-bar">
            <el-space>
              <el-button type="primary" @click="pullTemplates" :loading="tplLoading">
                拉取模板
              </el-button>
              <el-select
                v-model="selectedTemplate"
                placeholder="选择模板"
                style="width: 240px"
                @change="loadTemplateFile"
                clearable
              >
                <el-option
                  v-for="tpl in templateList"
                  :key="tpl"
                  :label="tpl"
                  :value="tpl"
                >
                  <span style="float: left">{{ tpl }}</span>
                  <el-button
                    type="danger"
                    size="small"
                    circle
                    style="float: right; padding: 3px; min-width: 22px"
                    @click.stop="deleteTemplate(tpl)"
                  >
                    ✕
                  </el-button>
                </el-option>
              </el-select>
              <el-button type="warning" @click="pushTemplates" :loading="pushTplLoading">
                推送模板
              </el-button>
            </el-space>
          </div>
          <div class="editor-wrapper">
            <textarea
              v-model="tplContent"
              class="yaml-editor"
              spellcheck="false"
              placeholder="点击「拉取模板」获取 Subconverter 模板文件..."
            ></textarea>
          </div>
          <div class="bottom-actions">
            <el-space>
              <el-button type="primary" @click="saveTemplate" :disabled="!selectedTemplate">
                保存修改
              </el-button>
              <el-button @click="showSaveAsDialog">
                另添加为新模板
              </el-button>
            </el-space>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ 上传文件 ============ -->
      <el-tab-pane label="上传文件" name="upload">
        <div class="tab-content">
          <div class="url-import-section">
            <span style="font-weight: 600; margin-right: 12px;">从链接导入 YAML</span>
            <el-input
              v-model="importUrl"
              placeholder="输入订阅链接或原始 YAML 链接..."
              style="width: 500px"
              clearable
            />
            <el-button type="primary" @click="importFromUrl" :loading="urlLoading">
              拉取
            </el-button>
          </div>
          <el-divider>或</el-divider>
          <div class="file-upload-section">
            <el-upload
              drag
              :auto-upload="false"
              :on-change="handleLocalFile"
              :limit="1"
              accept=".yaml,.yml,.txt"
              class="upload-area"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">
                拖拽文件到此处 或 <em>点击选择本地文件</em>
              </div>
            </el-upload>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { routerAPI } from '@/api'

const activeTab = ref('openclash')
const statusLoading = ref(false)
const routerConnected = ref(false)
const routerInfo = ref('')

// --- OpenClash ---
const ocLoading = ref(false)
const applyOCLoading = ref(false)
const ocYamlContent = ref('')
const ocActiveConfig = ref('')

// --- Subconverter 模板 ---
const tplLoading = ref(false)
const pushTplLoading = ref(false)
const selectedTemplate = ref('')
const templateList = ref([])
const tplContent = ref('')

// --- 上传文件 ---
const importUrl = ref('')
const urlLoading = ref(false)

// ======== 刷新状态 ========
const refreshAllStatus = async () => {
  statusLoading.value = true
  try {
    const res = await routerAPI.status()
    if (res.connected) {
      routerConnected.value = true
      routerInfo.value = res.info || '已连接'
    } else {
      routerConnected.value = false
      routerInfo.value = '未连接'
    }
    ElMessage.success('状态已刷新')
  } catch {
    routerConnected.value = false
    routerInfo.value = '错误'
  } finally {
    statusLoading.value = false
  }
}

// ======== OpenClash 拉取/应用 ========
const pullOpenClash = async () => {
  ocLoading.value = true
  try {
    const res = await routerAPI.pull('openclash')
    if (res.success) {
      const parts = res.pulled.split(', ')
      const activePart = parts.find(p => p.startsWith('active:'))
      ocActiveConfig.value = activePart ? activePart.replace('active:', '') : ''
      // 读取拉取到的文件内容
      if (ocActiveConfig.value) {
        const resp = await fetch(`/api/files/read/openclash_${ocActiveConfig.value}.yaml`)
        const data = await resp.json()
        if (data.success && data.content) {
          ocYamlContent.value = data.content
          ElMessage.success(`已加载: ${ocActiveConfig.value}.yaml`)
        } else {
          ocYamlContent.value = '# 文件内容为空'
        }
      }
    } else {
      ElMessage.error('拉取失败: ' + (res.error || ''))
    }
  } catch (e) {
    ElMessage.error('拉取出错: ' + e.message)
  } finally {
    ocLoading.value = false
  }
}

const applyOpenClash = async () => {
  if (!ocYamlContent.value || !ocActiveConfig.value) {
    ElMessage.warning('请先拉取文件')
    return
  }
  applyOCLoading.value = true
  try {
    // 先保存内容到本地文件
    await fetch('/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: `openclash_${ocActiveConfig.value}.yaml`,
        raw: ocYamlContent.value
      })
    })
    // 推送到路由器
    const pushRes = await routerAPI.push([
      { local: `openclash_${ocActiveConfig.value}.yaml`, remote: `/etc/openclash/config/${ocActiveConfig.value}.yaml` }
    ], true)
    if (pushRes.success) {
      ElMessage.success('✅ 已推送并触发重载')
    } else {
      ElMessage.error('推送失败: ' + (pushRes.error || ''))
    }
  } catch (e) {
    ElMessage.error('操作失败: ' + e.message)
  } finally {
    applyOCLoading.value = false
  }
}

// ======== Subconverter 模板 ========
const refreshTemplateList = () => {
  templateList.value = [
    'groups.txt',
    'pref.ini',
    'emoji.txt',
    'all_base.tpl',
  ]
}

const pullTemplates = async () => {
  tplLoading.value = true
  try {
    const res = await routerAPI.pull('subconverter')
    if (res.success) {
      refreshTemplateList()
      if (templateList.value.length > 0) {
        selectedTemplate.value = templateList.value[0]
        await loadTemplateFile()
      }
      ElMessage.success('模板已拉取')
    } else {
      ElMessage.error('拉取失败: ' + (res.error || ''))
    }
  } catch (e) {
    ElMessage.error('拉取出错: ' + e.message)
  } finally {
    tplLoading.value = false
  }
}

const loadTemplateFile = async () => {
  if (!selectedTemplate.value) return
  try {
    // 映射文件名到本地路径
    const fileMap = {
      'groups.txt': 'subconverter_groups.txt',
      'pref.ini': 'subconverter_pref.ini',
      'emoji.txt': 'subconverter_emoji.txt',
      'all_base.tpl': 'subconverter_rules/rules/all_base.tpl',
    }
    const localPath = fileMap[selectedTemplate.value] || selectedTemplate.value
    const resp = await fetch(`/api/files/read/${localPath}`)
    const data = await resp.json()
    if (data.success && data.content) {
      tplContent.value = data.content
    } else {
      tplContent.value = '# 文件为空'
    }
  } catch (e) {
    tplContent.value = '# 加载失败: ' + e.message
  }
}

const saveTemplate = async () => {
  if (!selectedTemplate.value) {
    ElMessage.warning('请先选择一个模板')
    return
  }
  try {
    const fileMap = {
      'groups.txt': 'subconverter_groups.txt',
      'pref.ini': 'subconverter_pref.ini',
      'emoji.txt': 'subconverter_emoji.txt',
      'all_base.tpl': 'subconverter_rules/rules/all_base.tpl',
    }
    const localPath = fileMap[selectedTemplate.value] || selectedTemplate.value
    await fetch('/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: localPath, raw: tplContent.value })
    })
    ElMessage.success('已保存')
  } catch (e) {
    ElMessage.error('保存失败: ' + e.message)
  }
}

const pushTemplates = async () => {
  pushTplLoading.value = true
  try {
    const files = [
      { local: 'subconverter_groups.txt', remote: '/etc/subconverter/groups.txt' },
      { local: 'subconverter_pref.ini', remote: '/etc/subconverter/pref.ini' },
    ]
    const res = await routerAPI.push(files, false)
    if (res.success) {
      ElMessage.success(`已推送 ${res.pushed} 个文件`)
    } else {
      ElMessage.error('推送失败')
    }
  } catch (e) {
    ElMessage.error('推送出错: ' + e.message)
  } finally {
    pushTplLoading.value = false
  }
}

const showSaveAsDialog = async () => {
  try {
    const { value } = await ElMessageBox.prompt('新模板文件名', '另存为新模板', {
      inputPlaceholder: '例如: my_custom_groups.txt'
    })
    if (value) {
      await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: value, raw: tplContent.value })
      })
      ElMessage.success(`已保存为: ${value}`)
      templateList.value.push(value)
      selectedTemplate.value = value
    }
  } catch { /* cancelled */ }
}

const deleteTemplate = async (tpl) => {
  try {
    await ElMessageBox.confirm(`确定删除 "${tpl}"？`, '确认删除')
    const fileMap = {
      'groups.txt': 'subconverter_groups.txt',
      'pref.ini': 'subconverter_pref.ini',
      'emoji.txt': 'subconverter_emoji.txt',
      'all_base.tpl': 'subconverter_rules/rules/all_base.tpl',
    }
    const localPath = fileMap[tpl] || tpl
    await fetch(`/api/files/delete/${localPath}`, { method: 'DELETE' })
    templateList.value = templateList.value.filter(t => t !== tpl)
    if (selectedTemplate.value === tpl) {
      selectedTemplate.value = ''
      tplContent.value = ''
    }
    ElMessage.success('已删除')
  } catch { /* cancelled */ }
}

// ======== 上传文件 ========
const importFromUrl = async () => {
  if (!importUrl.value) {
    ElMessage.warning('请输入链接')
    return
  }
  urlLoading.value = true
  try {
    const resp = await fetch(importUrl.value)
    const text = await resp.text()
    const name = `imported_${Date.now()}.yaml`
    await fetch('/api/files/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: name, raw: text })
    })
    ElMessage.success(`已导入，保存为: ${name}`)
    importUrl.value = ''
  } catch (e) {
    ElMessage.error('导入失败: ' + e.message)
  } finally {
    urlLoading.value = false
  }
}

const handleLocalFile = (file) => {
  const reader = new FileReader()
  reader.onload = async (e) => {
    const text = e.target.result
    const name = file.name || `uploaded_${Date.now()}.yaml`
    try {
      await fetch('/api/files/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: name, raw: text })
      })
      ElMessage.success(`已上传: ${name}`)
    } catch (err) {
      ElMessage.error('上传失败: ' + err.message)
    }
  }
  reader.readAsText(file.raw)
}

const onTabChange = () => {
  // 切换标签时的逻辑
}

onMounted(() => {
  refreshAllStatus()
})
</script>

<style scoped>
.yaml-editor-app {
  padding: 16px 24px;
  height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
}
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e4e7ed;
}
.app-title {
  font-size: 22px;
  font-weight: 700;
  color: #303133;
}
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.status-tag {
  font-size: 11px;
}
.main-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.main-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
}
.tab-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.editor-wrapper {
  flex: 1;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  min-height: 400px;
  overflow: hidden;
}
.yaml-editor {
  width: 100%;
  height: 100%;
  min-height: 450px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  padding: 16px;
  border: none;
  outline: none;
  resize: vertical;
  background: #1e1e1e;
  color: #d4d4d4;
  tab-size: 2;
}
.bottom-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-start;
}
.url-import-section {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.file-upload-section {
  display: flex;
  justify-content: center;
  padding: 20px 0;
}
.upload-area {
  width: 100%;
  max-width: 600px;
}
</style>
