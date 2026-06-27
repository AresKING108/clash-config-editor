<template>
  <div class="proxy-group-table">
    <div class="table-header">
      <el-button type="primary" :icon="Plus" @click="showAddDialog">添加代理组</el-button>
      <el-tag type="info">拖拽 ⠿ 可排序</el-tag>
    </div>

    <div class="drag-list">
      <draggable v-model="localGroups" item-key="name" handle=".drag-handle" ghost-class="ghost" animation="200" @change="onDrag">
        <template #item="{ element: row, index }">
          <div class="drag-row" :class="{ 'has-exclude': row.exclude && row.exclude.length }">
            <div class="drag-handle" title="拖拽排序">⠿</div>
            <div class="drag-col name-col">{{ row.name }}</div>
            <div class="drag-col type-col">
              <el-tag :type="typeTag(row.type)" size="small">{{ row.type }}</el-tag>
            </div>
            <div class="drag-col proxies-col">
              <el-tag v-for="p in (row.proxies||[])" :key="p" size="small"
                :type="p === 'DIRECT' ? 'success' : p === 'REJECT' ? 'danger' : ''"
                style="margin:1px 2px">{{ p }}</el-tag>
            </div>
            <div class="drag-col exclude-col" v-if="hasExcludes">
              <el-tag v-for="e in (row.exclude||[])" :key="e" size="small" type="danger" style="margin:1px 2px">{{ e }}</el-tag>
            </div>
            <div class="drag-col actions-col">
              <el-button size="small" @click="editGroup(row, index)">编辑</el-button>
              <el-button size="small" type="danger" @click="deleteGroup(index)">删除</el-button>
            </div>
          </div>
        </template>
      </draggable>
    </div>

    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑代理组' : '添加代理组'" width="650px" :close-on-click-modal="false">
      <el-form :model="currentGroup" label-width="120px">
        <el-form-item label="名称">
          <el-input v-model="currentGroup.name" placeholder="如：🔰 节点选择" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="currentGroup.type" @change="onTypeChange">
            <el-option v-for="t in groupTypes" :key="t.type" :label="t.label" :value="t.type" />
          </el-select>
        </el-form-item>
        <el-form-item label="包含代理">
          <el-select v-model="currentGroup.proxies" multiple filterable style="width:100%"
            placeholder="选择策略组/节点/DIRECT/REJECT">
            <el-option v-for="proxy in availableProxies" :key="proxy" :label="proxy" :value="proxy" />
          </el-select>
        </el-form-item>
        <el-form-item label="剔除节点">
          <el-select v-model="currentGroup.exclude" multiple filterable style="width:100%"
            placeholder="选择要排除的节点">
            <el-option v-for="proxy in allNodes" :key="proxy" :label="proxy" :value="proxy" />
          </el-select>
          <div style="font-size:12px;color:#909399;margin-top:4px">选中的节点不会出现在本组的可选列表</div>
        </el-form-item>
        <template v-if="currentGroup.type !== 'select'">
          <el-form-item label="测试 URL">
            <el-input v-model="currentGroup.url" placeholder="http://www.gstatic.com/generate_204" />
          </el-form-item>
          <el-form-item label="测试间隔(秒)">
            <el-input-number v-model="currentGroup.interval" :min="10" :max="3600" style="width:100%" />
          </el-form-item>
          <el-form-item v-if="currentGroup.type === 'url-test'" label="容差(ms)">
            <el-input-number v-model="currentGroup.tolerance" :min="0" :max="1000" style="width:100%" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'

const props = defineProps({ category: Object, config: Object })
const emit = defineEmits(['update'])

const groupTypes = computed(() => props.category.types || [])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editIndex = ref(-1)

const defaultGroup = () => ({ name: '', type: 'select', proxies: [], exclude: [], url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50 })

const currentGroup = ref(defaultGroup())

// Local copy of proxy groups for drag reordering
const localGroups = ref([])

// Sync localGroups from config
let _syncing=false
watch(() => props.config['proxy-groups'], (val) => {
  if(_syncing)return
  localGroups.value = val ? [...val] : []
}, { immediate: true, deep: true })


const proxyGroups = computed(() => props.config['proxy-groups'] || [])

const allNodes = computed(() => (props.config.proxies || []).map(p => p.name))

const availableProxies = computed(() => {
  const proxies = allNodes.value
  const groups = (localGroups.value || [])
    .filter(g => g.name !== currentGroup.value.name)
    .map(g => g.name)
  return [...proxies, ...groups, 'DIRECT', 'REJECT', 'PASS']
})

const hasExcludes = computed(() =>
  (localGroups.value || []).some(g => g.exclude && g.exclude.length)
)

const typeTag = (t) => {
  const map = { select: '', 'url-test': 'warning', fallback: 'danger', 'load-balance': 'info' }
  return map[t] || ''
}

const onTypeChange = () => {
  const n = currentGroup.value.name
  const p = currentGroup.value.proxies || []
  const e = currentGroup.value.exclude || []
  currentGroup.value = { ...defaultGroup(), name: n, type: currentGroup.value.type, proxies: p, exclude: e }
}

const showAddDialog = () => { isEdit.value = false; currentGroup.value = { ...defaultGroup() }; dialogVisible.value = true }

const editGroup = (row, index) => {
  isEdit.value = true; editIndex.value = index
  currentGroup.value = {
    name: row.name || '', type: row.type || 'select',
    proxies: [...(row.proxies || [])], exclude: [...(row.exclude || [])],
    url: row.url || 'http://www.gstatic.com/generate_204',
    interval: row.interval || 300, tolerance: row.tolerance || 50
  }
  dialogVisible.value = true
}

const saveGroup = () => {
  if (!currentGroup.value.name) { ElMessage.error('请填写名称'); return }
  if (!currentGroup.value.proxies || !currentGroup.value.proxies.length) { ElMessage.error('请选择至少一个代理'); return }
  const data = { ...currentGroup.value }
  if (!data.exclude || !data.exclude.length) delete data.exclude
  if (data.type === 'select') { delete data.url; delete data.interval; delete data.tolerance }
  if (data.type !== 'url-test') delete data.tolerance
  const newGroups = [...localGroups.value]
  // 检测重命名：更新规则和其他策略组中的引用
  if (isEdit.value && editIndex.value >= 0) {
    const oldName = newGroups[editIndex.value].name
    newGroups[editIndex.value] = data
    if (oldName !== data.name) {
      // 先设锁，再发规则更新（防止规则更新触发 proxy-groups 回写）
      _syncing=true
      // 更新 rules 中的引用
      const allRules = props.config.rules || []
      const updatedRules = allRules.map(r => {
        const parts = r.split(',')
        if (parts.length >= 3 && parts[2].trim() === oldName) {
          parts[2] = data.name
          return parts.join(',')
        }
        if (r === oldName) return data.name
        return r
      })
      emit("update", "rules", updatedRules)
      // 更新其他策略组中的引用
      for (let i = 0; i < newGroups.length; i++) {
        if (i === editIndex.value) continue
        const g = newGroups[i]
        if (g.proxies) {
          g.proxies = g.proxies.map(p => p === oldName ? data.name : p)
        }
      }
    }
  } else {
    _syncing=true
    newGroups.push(data)
  }
  localGroups.value = newGroups; emit("update", "proxy-groups", newGroups); _syncing=false
  dialogVisible.value = false; ElMessage.success(isEdit.value ? '修改成功' : '添加成功')
}

const deleteGroup = async (index) => {
  const name = localGroups.value[index].name
  const allRules = props.config.rules || []
  const refRules = allRules.filter(r => r.endsWith(',' + name) || r === name)
  let msg = `确定删除策略组 "${name}"？`
  if (refRules.length) msg += `\\n\\n将同时删除 ${refRules.length} 条引用此组的规则`
  try {
    await ElMessageBox.confirm(msg, '确认删除', { confirmButtonText: '删除', type: refRules.length ? 'warning' : 'info' })
    _syncing=true
    const filtered = localGroups.value.filter((_, i) => i !== index)
    localGroups.value = filtered
    emit("update", "proxy-groups", filtered)
    if (refRules.length) {
      const remainingRules = allRules.filter(r => !r.endsWith(',' + name) && r !== name)
      emit("update", "rules", remainingRules)
    }
    _syncing=false
    ElMessage.success(refRules.length ? `已删除策略组及 ${refRules.length} 条引用规则` : '已删除')
  } catch {}
}
const onDrag = () => { _syncing=true; emit("update", "proxy-groups", [...localGroups.value]); _syncing=false }
</script>

<style scoped>
.proxy-group-table { width: 100%; }
.table-header { display:flex; justify-content:space-between; margin-bottom:12px; align-items:center; }
.drag-list { border:1px solid #e4e7ed; border-radius:4px; overflow:hidden; }
.drag-row {
  display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #f0f0f0;
  transition:background 0.15s; gap:8px;
}
.drag-row:last-child { border-bottom:none; }
.drag-row:hover { background:#f5f7fa; }
.drag-row.has-exclude { border-left:3px solid #e6a23c; }
.ghost { opacity:0.4; background:#e6f7ff; }
.drag-handle { cursor:grab; color:#bbb; font-size:18px; width:24px; text-align:center; user-select:none; flex-shrink:0; }
.drag-handle:active { cursor:grabbing; color:#409eff; }
.drag-col { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.name-col { width:180px; font-weight:500; }
.type-col { width:90px; flex-shrink:0; }
.proxies-col { flex:1; min-width:200px; }
.exclude-col { width:120px; flex-shrink:0; }
.actions-col { width:160px; flex-shrink:0; text-align:right; }
</style>
