<template>
  <div class="yaml-editor-app">
    <!-- 顶栏 -->
    <div class="top-bar">
      <div class="app-title">YAML编辑器</div>
      <div class="top-actions">
        <el-tag v-if="routerConnected" type="success" size="small" effect="dark">
          {{ routerInfo }}
        </el-tag>
        <el-tag v-else type="danger" size="small" effect="dark">路由器未连接</el-tag>
        <el-button size="small" @click="refreshAllStatus" :loading="statusLoading">刷新状态</el-button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="main-tabs">
      <!-- ============ OpenClash 热重载 ============ -->
      <el-tab-pane label="OpenClash 热重载" name="openclash">
        <div class="oc-header">
          <div class="oc-header-left">
            <el-button type="primary" @click="pullOpenClash" :loading="ocLoading">拉取文件</el-button>
            <el-button type="success" @click="applyOpenClash" :loading="applyOCLoading">应用修改</el-button>
          <el-button @click="validateConfig" :loading="validating">校验</el-button>
          </div>
          <el-tag v-if="ocActiveConfig" type="info" effect="plain">
            当前: {{ ocActiveConfig }}
          </el-tag>
        </div>
        <div v-if="showEditor" class="config-editor-container">
          <ConfigEditor embedded />
        </div>
        <div v-else class="placeholder">
          <p>点击「拉取文件」获取路由器上当前 OpenClash 的 YAML 配置</p>
          <p class="sub">之后可在下方标签页中可视化编辑节点、策略组、规则等</p>
        </div>
      </el-tab-pane>

      <!-- ============ Subconverter 模板 ============ -->
      <el-tab-pane label="Subconverter 模板" name="subconverter">
        <div class="tab-section">
          <div class="sc-header">
            <el-space>
              <el-button type="primary" @click="pullTemplates" :loading="tplLoading">拉取模板</el-button>
              <el-select v-model="selectedTemplate" placeholder="选择模板" style="width: 240px" @change="loadTemplateFile">
                <el-option v-for="tpl in templateList" :key="tpl" :label="tpl" :value="tpl">
                  <span>{{ tpl }}</span>
                  <el-button type="danger" size="small" circle style="float:right;padding:2px;min-width:20px;font-size:11px" @click.stop="deleteTemplate(tpl)">✕</el-button>
                </el-option>
              </el-select>
              <el-button type="warning" @click="pushTemplates" :loading="pushTplLoading">推送模板</el-button>
            </el-space>
          </div>
          <div v-if="selectedTemplate === 'groups.txt'" class="tpl-editor-area" style="overflow:auto;background:#fff;padding:12px">
            <GroupsEditor v-model="tplContent" @save="onGroupsSave" />
          </div>
          <div v-else class="tpl-editor-area">
            <textarea v-model="tplContent" class="code-textarea" spellcheck="false" placeholder="点击「拉取模板」获取 Subconverter 模板文件..."></textarea>
          </div>
          <div class="tpl-bottom">
            <el-space>
              <el-button type="primary" @click="saveTemplate" :disabled="!selectedTemplate">保存修改</el-button>
              <el-button @click="showSaveAsDialog">另添加为新模板</el-button>
            </el-space>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ 上传文件 ============ -->
      <el-tab-pane label="上传文件" name="upload">
        <div class="tab-section" style="padding: 24px;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
            <span style="font-weight:600;">从链接导入</span>
            <el-input v-model="importUrl" placeholder="输入订阅链接或 YAML 直链..." style="width:500px" clearable />
            <el-button type="primary" @click="importFromUrl" :loading="urlLoading">拉取</el-button>
          </div>
          <el-divider>或</el-divider>
          <div style="display:flex;justify-content:center;padding:20px;">
            <el-upload drag :auto-upload="false" :on-change="handleLocalFile" :limit="1" accept=".yaml,.yml,.txt">
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">拖拽文件到此处 或 <em>点击选择本地文件</em></div>
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
import { routerAPI, fileAPI } from '@/api'
import { useConfigStore } from '@/stores/config'
import ConfigEditor from './ConfigEditor.vue'
import GroupsEditor from '@/components/GroupsEditor.vue'

const configStore = useConfigStore()

const activeTab = ref('openclash')
const statusLoading = ref(false)
const routerConnected = ref(false)
const routerInfo = ref('')

// OpenClash
const ocLoading = ref(false)
const applyOCLoading = ref(false)
const ocActiveConfig = ref('')
const showEditor = ref(false)

// Subconverter
const tplLoading = ref(false)
const pushTplLoading = ref(false)
const selectedTemplate = ref('')
const templateList = ref([])
const tplContent = ref('')

// 上传
const importUrl = ref('')
const validating = ref(false)
const urlLoading = ref(false)

const onGroupsSave = (serialized) => {
  tplContent.value = serialized
  ElMessage.success('策略组已更新')
}

// ===== 刷新状态 =====
const refreshAllStatus = async () => {
  statusLoading.value = true
  try {
    const res = await routerAPI.status()
    if (res.connected) { routerConnected.value = true; routerInfo.value = res.info || '已连接' }
    else { routerConnected.value = false; routerInfo.value = '未连接' }
  } catch { routerConnected.value = false }
  finally { statusLoading.value = false }
}

// ===== OpenClash =====
const pullOpenClash = async () => {
  ocLoading.value = true
  try {
    const res = await routerAPI.pull('openclash')
    if (!res.success) { ElMessage.error('拉取失败'); return }
    const parts = res.pulled.split(', ')
    const activePart = parts.find(p => p.startsWith('active:'))
    ocActiveConfig.value = activePart ? activePart.replace('active:', '') : ''

    if (ocActiveConfig.value) {
      const fn = `openclash_${ocActiveConfig.value}.yaml`
      // 把文件加载到 ConfigEditor
      configStore.currentFile = fn
      configStore.loading = true
      const fileRes = await fileAPI.read(fn)
      if (fileRes && fileRes.success) {
        configStore.setConfig(fileRes.config)
        configStore.loading = false
        showEditor.value = true
        ElMessage.success(`已加载: ${ocActiveConfig.value}`)
      } else {
        ElMessage.error('解析配置文件失败')
      }
    }
  } catch (e) { ElMessage.error('出错: ' + e.message) }
  finally { ocLoading.value = false }
}

const applyOpenClash = async () => {
  if (!ocActiveConfig.value) { ElMessage.warning('请先拉取文件'); return }
  applyOCLoading.value = true
  try {
    const fn = `openclash_${ocActiveConfig.value}.yaml`
    // 去掉编辑器特有字段，Clash 不认
    const cleanConfig = JSON.parse(JSON.stringify(configStore.config))
    if (cleanConfig["proxy-groups"]) {
      cleanConfig["proxy-groups"] = cleanConfig["proxy-groups"].map(g => { const {exclude, ...rest} = g; return rest })
    }
    await fileAPI.save(fn, cleanConfig)
    const pushRes = await routerAPI.push([
      { local: fn, remote: `/etc/openclash/config/${ocActiveConfig.value}.yaml` }
    ], true)
    if (pushRes.success) ElMessage.success('✅ 已应用并重载')
    else ElMessage.error('推送失败')
  } catch (e) { ElMessage.error('操作失败: ' + e.message) }
  finally { applyOCLoading.value = false }
}

// ===== Subconverter 模板 =====
const refreshTemplateList = () => { templateList.value = ['groups.txt', 'pref.ini', 'emoji.txt', 'all_base.tpl'] }

const pullTemplates = async () => {
  tplLoading.value = true
  try {
    const res = await routerAPI.pull('subconverter')
    if (res.success) {
      refreshTemplateList()
      if (templateList.value.length > 0) { selectedTemplate.value = templateList.value[0]; await loadTemplateFile() }
      ElMessage.success('模板已拉取')
    } else { ElMessage.error('拉取失败') }
  } catch (e) { ElMessage.error('出错: ' + e.message) }
  finally { tplLoading.value = false }
}

const loadTemplateFile = async () => {
  if (!selectedTemplate.value) return
  const map = { 'groups.txt':'subconverter_groups.txt', 'pref.ini':'subconverter_pref.ini', 'emoji.txt':'subconverter_emoji.txt', 'all_base.tpl':'subconverter_rules/rules/all_base.tpl' }
  const localPath = map[selectedTemplate.value] || selectedTemplate.value
  try {
    const resp = await fetch(`/api/files/read/${localPath}`)
    const data = await resp.json()
    tplContent.value = (data.success && data.content) ? data.content : '# 文件为空'
  } catch (e) { tplContent.value = '# 加载失败' }
}

const saveTemplate = async () => {
  if (!selectedTemplate.value) return
  const map = { 'groups.txt':'subconverter_groups.txt', 'pref.ini':'subconverter_pref.ini', 'emoji.txt':'subconverter_emoji.txt', 'all_base.tpl':'subconverter_rules/rules/all_base.tpl' }
  try {
    await fetch('/api/files/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({filename:map[selectedTemplate.value]||selectedTemplate.value, raw:tplContent.value}) })
    ElMessage.success('已保存')
  } catch (e) { ElMessage.error('保存失败') }
}

const pushTemplates = async () => {
  pushTplLoading.value = true
  try {
    const res = await routerAPI.push([
      { local:'subconverter_groups.txt', remote:'/etc/subconverter/groups.txt' },
      { local:'subconverter_pref.ini', remote:'/etc/subconverter/pref.ini' }
    ], false)
    if (res.success) ElMessage.success(`已推送 ${res.pushed} 个文件`)
    else ElMessage.error('推送失败')
  } finally { pushTplLoading.value = false }
}

const showSaveAsDialog = async () => {
  try {
    const { value } = await ElMessageBox.prompt('新模板文件名', '另存为新模板')
    if (value) {
      await fetch('/api/files/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({filename:value, raw:tplContent.value}) })
      ElMessage.success(`已保存为: ${value}`)
      templateList.value.push(value)
      selectedTemplate.value = value
    }
  } catch {}
}

const deleteTemplate = async (tpl) => {
  try {
    await ElMessageBox.confirm(`确定删除 "${tpl}"？`)
    const map = { 'groups.txt':'subconverter_groups.txt', 'pref.ini':'subconverter_pref.ini', 'emoji.txt':'subconverter_emoji.txt', 'all_base.tpl':'subconverter_rules/rules/all_base.tpl' }
    await fetch(`/api/files/delete/${map[tpl]||tpl}`, { method:'DELETE' })
    templateList.value = templateList.value.filter(t => t !== tpl)
    if (selectedTemplate.value === tpl) { selectedTemplate.value = ''; tplContent.value = '' }
    ElMessage.success('已删除')
  } catch {}
}

// ===== 上传文件 =====
const validateConfig = async () => {
  validating.value = true
  try {
    const resp = await fetch('/api/config/validate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({config: configStore.config})
    })
    const res = await resp.json()
    if (res.success) {
      if (res.errors && res.errors.length) ElMessage.warning(`发现 ${res.errors.length} 个错误`)
      else if (res.warnings && res.warnings.length) ElMessage.warning(`${res.warnings.length} 个警告`)
      else ElMessage.success('✅ 配置校验通过')
    } else ElMessage.error('校验失败')
  } catch (e) { ElMessage.error('校验出错: ' + e.message) }
  finally { validating.value = false }
}

const importFromUrl = async () => {
  if (!importUrl.value) return
  urlLoading.value = true
  try {
    const resp = await fetch(importUrl.value); const text = await resp.text()
    const name = `imported_${Date.now()}.yaml`
    await fetch('/api/files/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({filename:name, raw:text}) })
    ElMessage.success(`已导入: ${name}`); importUrl.value = ''
  } catch (e) { ElMessage.error('导入失败') }
  finally { urlLoading.value = false }
}

const handleLocalFile = async (file) => {
  const reader = new FileReader()
  reader.onload = async (e) => {
    const name = file.name || `uploaded_${Date.now()}.yaml`
    try {
      await fetch('/api/files/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({filename:name, raw:e.target.result}) })
      ElMessage.success(`已上传: ${name}`)
    } catch { ElMessage.error('上传失败') }
  }
  reader.readAsText(file.raw)
}

onMounted(() => { refreshAllStatus() })
</script>

<style scoped>
.yaml-editor-app { padding: 12px 20px; height: calc(100vh - 32px); display:flex; flex-direction:column; }
.top-bar { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #e4e7ed; }
.app-title { font-size:22px; font-weight:700; color:#303133; }
.top-actions { display:flex; align-items:center; gap:8px; }
.main-tabs { flex:1; display:flex; flex-direction:column; }
.main-tabs :deep(.el-tabs__content) { flex:1; overflow:auto; }
.main-tabs :deep(.el-tab-pane) { height:100%; }

.oc-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
.oc-header-left { display:flex; gap:8px; }
.config-editor-container { flex:1; border:1px solid #e4e7ed; border-radius:4px; overflow:auto; padding:8px; background:#fff; }
.placeholder { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#909399; }
.placeholder p { font-size:16px; margin:8px 0; }
.placeholder .sub { font-size:13px; color:#c0c4cc; }

.tab-section { display:flex; flex-direction:column; height:100%; }
.sc-header { margin-bottom:12px; }
.tpl-editor-area { flex:1; border:1px solid #dcdfe6; border-radius:4px; overflow:hidden; min-height:350px; }
.code-textarea { width:100%; height:100%; min-height:350px; font-family:'Cascadia Code','Fira Code','Consolas',monospace; font-size:13px; line-height:1.6; padding:16px; border:none; outline:none; resize:vertical; background:#1e1e1e; color:#d4d4d4; tab-size:2; }
.tpl-bottom { margin-top:12px; }
</style>
