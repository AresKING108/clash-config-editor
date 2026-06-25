<template>
  <div class="router-sync">
    <el-alert v-if="statusMessage" :type="statusType" :title="statusMessage" show-icon :closable="true" @close="statusMessage=''" style="margin-bottom: 16px" />
    
    <el-card class="sync-card">
      <template #header>
        <div class="card-header">
          <span>路由器连接状态</span>
          <el-tag :type="connected ? 'success' : 'danger'" size="small">
            {{ connected ? '已连接' : '未连接' }}
          </el-tag>
        </div>
      </template>
      <div v-if="routerInfo" class="info-text">{{ routerInfo }}</div>
      <div v-if="subconverterVersion" class="info-text">Subconverter: {{ subconverterVersion }}</div>
      <el-button type="primary" size="small" @click="checkStatus" :loading="checking" style="margin-top: 8px">
        刷新状态
      </el-button>
    </el-card>

    <el-card class="sync-card">
      <template #header>
        <div class="card-header">
          <span>从路由器拉取配置</span>
          <el-tag v-if="activeConfig" type="info" size="small">当前激活: {{ activeConfig }}</el-tag>
        </div>
      </template>
      <p style="color: #909399; font-size: 13px">把路由器上的 subconverter 模板和 OpenClash 配置拉取到本地编辑器</p>
      <el-space>
        <el-button type="warning" @click="pullConfig('subconverter')" :loading="pulling">
          拉取 Subconverter 模板
        </el-button>
        <el-button type="warning" @click="pullConfig('openclash')" :loading="pulling">
          拉取 OpenClash 配置
        </el-button>
        <el-button type="warning" @click="pullConfig('all')" :loading="pulling">
          拉取全部
        </el-button>
      </el-space>
    </el-card>

    <el-card class="sync-card">
      <template #header>
        <span>推送到路由器</span>
      </template>
      <p style="color: #909399; font-size: 13px">把当前编辑的配置推送到路由器，自动触发服务重载</p>
      <el-space>
        <el-button type="success" @click="pushSubconverter" :loading="pushing">
          推送 Subconverter 模板
        </el-button>
        <el-button type="success" @click="pushOpenClash" :loading="pushing">
          推送 OpenClash 配置
        </el-button>
      </el-space>
    </el-card>

    <el-card class="sync-card">
      <template #header>
        <span>服务重载</span>
      </template>
      <el-space>
        <el-button @click="reloadService('subconverter')" :loading="reloading">
          重启 Subconverter
        </el-button>
        <el-button @click="reloadService('openclash')" :loading="reloading">
          重启 OpenClash
        </el-button>
        <el-button type="danger" @click="reloadService('all')" :loading="reloading">
          全部重启
        </el-button>
      </el-space>
    </el-card>

    <el-card class="sync-card">
      <template #header>
        <span>一键热重载</span>
      </template>
      <p style="color: #909399; font-size: 13px">推送当前配置 + 触发服务重载，一步到位</p>
      <el-button type="primary" size="large" @click="oneClickDeploy" :loading="deploying">
        🚀 一键部署并重载
      </el-button>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { routerAPI } from '@/api'

const statusMessage = ref('')
const statusType = ref('info')
const connected = ref(false)
const routerInfo = ref('')
const subconverterVersion = ref('')
const activeConfig = ref('')
const checking = ref(false)
const pulling = ref(false)
const pushing = ref(false)
const reloading = ref(false)
const deploying = ref(false)

const showMessage = (msg, type = 'info') => {
  statusMessage.value = msg
  statusType.value = type
  if (type === 'success') ElMessage.success(msg)
  else if (type === 'error') ElMessage.error(msg)
  else ElMessage.info(msg)
}

const checkStatus = async () => {
  checking.value = true
  try {
    const res = await routerAPI.status()
    if (res.connected) {
      connected.value = true
      routerInfo.value = res.info || '已连接'
    } else {
      connected.value = false
      routerInfo.value = '连接失败: ' + (res.error || '未知错误')
    }
    const svRes = await routerAPI.subconverterStatus()
    subconverterVersion.value = svRes.version || '无法连接'
  } catch (e) {
    connected.value = false
    routerInfo.value = '错误: ' + e.message
  } finally {
    checking.value = false
  }
}

const pullConfig = async (type) => {
  pulling.value = true
  try {
    const res = await routerAPI.pull(type)
    if (res.success) {
      // 提取激活配置名（格式: "active:糖果, openclash"）
      const parts = res.pulled.split(', ')
      const activePart = parts.find(p => p.startsWith('active:'))
      if (activePart) {
        activeConfig.value = activePart.replace('active:', '')
      }
      showMessage(`已拉取: ${parts.filter(p => !p.startsWith('active:')).join(', ')}`, 'success')
    } else {
      showMessage('拉取失败: ' + (res.error || ''), 'error')
    }
  } catch (e) {
    showMessage('拉取出错: ' + e.message, 'error')
  } finally {
    pulling.value = false
  }
}

const pushSubconverter = async () => {
  pushing.value = true
  try {
    const files = [
      { local: 'subconverter_groups.txt', remote: '/etc/subconverter/groups.txt' },
      { local: 'subconverter_pref.ini', remote: '/etc/subconverter/pref.ini' },
    ]
    const res = await routerAPI.push(files, false)
    if (res.success) {
      showMessage(`已推送 ${res.pushed} 个文件`, 'success')
    } else {
      showMessage('推送失败: ' + (res.error || ''), 'error')
    }
  } catch (e) {
    showMessage('推送出错: ' + e.message, 'error')
  } finally {
    pushing.value = false
  }
}

const pushOpenClash = async () => {
  pushing.value = true
  try {
    // 推送到 /etc/openclash/config/ 目录
    const files = [
      { local: 'openclash_新模板.yaml', remote: '/etc/openclash/config/新模板.yaml' },
      { local: 'openclash_糖果.yaml', remote: '/etc/openclash/config/糖果.yaml' },
    ]
    const res = await routerAPI.push(files, true)
    if (res.success) {
      showMessage(`已推送 ${res.pushed} 个文件，重载: ${res.reloaded}`, 'success')
    } else {
      showMessage('推送失败: ' + (res.error || ''), 'error')
    }
  } catch (e) {
    showMessage('推送出错: ' + e.message, 'error')
  } finally {
    pushing.value = false
  }
}

const reloadService = async (service) => {
  reloading.value = true
  try {
    const res = await routerAPI.reload(service)
    if (res.success) {
      showMessage(`重载完成: ${res.output}`, 'success')
    } else {
      showMessage('重载失败: ' + (res.error || ''), 'error')
    }
  } catch (e) {
    showMessage('重载出错: ' + e.message, 'error')
  } finally {
    reloading.value = false
  }
}

const oneClickDeploy = async () => {
  deploying.value = true
  try {
    // 推送 subconverter 模板 + OpenClash 配置 + 触发重载
    const files = [
      { local: 'subconverter_groups.txt', remote: '/etc/subconverter/groups.txt' },
    ]
    if (activeConfig.value) {
      files.push({ local: `openclash_${activeConfig.value}.yaml`, remote: `/etc/openclash/config/${activeConfig.value}.yaml` })
    }
    const res = await routerAPI.push(files, true)
    if (res.success) {
      showMessage(`🚀 部署成功！已推送 ${res.pushed} 个文件，服务已重载`, 'success')
    } else {
      showMessage('部署失败: ' + (res.error || ''), 'error')
    }
  } catch (e) {
    showMessage('部署出错: ' + e.message, 'error')
  } finally {
    deploying.value = false
  }
}

onMounted(() => {
  checkStatus()
})
</script>

<style scoped>
.router-sync {
  padding: 8px;
}
.sync-card {
  margin-bottom: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.info-text {
  color: #606266;
  font-size: 13px;
  margin-bottom: 4px;
}
</style>
