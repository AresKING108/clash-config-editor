<template>
  <div class="proxy-group-table">
    <div class="table-header">
      <el-button type="primary" :icon="Plus" @click="showAddDialog">添加代理组</el-button>
      <el-tag type="info">拖拽 ⠿ 可排序</el-tag>
    </div>

    <div class="drag-list">
      <draggable v-model="localGroups" item-key="name" handle=".drag-handle" ghost-class="ghost" animation="200" @change="onDrag">
        <template #item="{ element: row, index }">
          <div class="drag-row" :class="{ 'has-exclude': row.exclude && row.exclude.length, 'has-use': row.use && row.use.length }">
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
                          <el-tag v-for="e in (row['exclude-filter']||'').split('`')" :key="e" size="small" type="danger" style="margin:1px 2px">{{ e }}</el-tag>
                        </div>
            <div class="drag-col use-col" v-if="hasUse">
              <el-tag v-for="u in (row.use||[])" :key="u" size="small" type="info" effect="plain" style="margin:1px 2px">{{ u }}</el-tag>
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
                  <el-input v-model="currentGroup['exclude-filter']" style="width:100%"
                    placeholder="填写关键词，匹配到的节点从本组剔除，如：香港丨 或 丨0.5x" />
                  <div style="font-size:12px;color:#909399;margin-top:4px">按关键词匹配节点名，支持多个关键词用 ` 分隔（反引号）；仅对本策略组生效</div>
                </el-form-item>
        <el-form-item label="Provider 引用">
          <el-select v-model="currentGroup.use" multiple filterable allow-create default-first-option style="width:100%"
            placeholder="选择或输入 Provider 名（use）">
            <el-option v-for="pn in providerNames" :key="pn" :label="pn" :value="pn" />
          </el-select>
          <div style="font-size:12px;color:#909399;margin-top:4px">use 引用 proxy-providers 中定义的 Provider；与「包含代理」至少填一个</div>
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

const defaultGroup = () => ({ name: '', type: 'select', proxies: [], 'exclude-filter': '', use: [], url: 'http://www.gstatic.com/generate_204', interval: 300, tolerance: 50 })

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

const providerNames = computed(() => {
  const pp = props.config['proxy-providers']
  if (!pp || typeof pp !== 'object') return []
  return Object.keys(pp)
})

// 剔除节点的动态选项：解析当前组实际包含的所有节点（use 的 Provider 按 filter 过滤 + 包含代理引用的策略组展开）
const providerNodesCache = ref(new Map()) // providerName -> string[]

// 按 filter 正则过滤节点（非法正则退化为包含匹配）
const applyFilter = (nodes, filter) => {
  if (!filter) return nodes
  try {
    const re = new RegExp(filter)
    return nodes.filter(n => re.test(n))
  } catch {
    return nodes.filter(n => n.includes(filter))
  }
}

// 递归展开策略组：返回该组实际包含的节点集合
const expandGroup = (groupName, seen = new Set()) => {
  if (seen.has(groupName)) return []
  seen.add(groupName)
  const group = proxyGroups.value.find(g => g.name === groupName)
  if (!group) return []
  const result = []
  // use 引用的 Provider → 按该组 filter 过滤
  if (group.use && group.use.length) {
    for (const pn of group.use) {
      const nodes = providerNodesCache.value.get(pn) || []
      result.push(...applyFilter(nodes, group.filter))
    }
  }
  // proxies 里的子项：策略组递归展开 / Provider 直接取节点 / 其他按直节点
  if (group.proxies && group.proxies.length) {
    for (const p of group.proxies) {
      const isSubGroup = proxyGroups.value.some(g => g.name === p)
      const isProvider = providerNames.value.includes(p)
      if (isSubGroup) {
        result.push(...expandGroup(p, seen))
      } else if (isProvider) {
        const nodes = providerNodesCache.value.get(p) || []
        result.push(...applyFilter(nodes, group.filter))
      } else {
        result.push(p)
      }
    }
  }
  return result
}

const excludeOptions = computed(() => {
  const result = []
  // 1. 当前组自身 use 引用的 Provider → 按当前组 filter 过滤
  if (currentGroup.value.use && currentGroup.value.use.length) {
    for (const pn of currentGroup.value.use) {
      const nodes = providerNodesCache.value.get(pn) || []
      result.push(...applyFilter(nodes, currentGroup.value.filter))
    }
  }
  // 2. 当前组「包含代理」中引用的策略组 → 递归展开；直接节点/其他 → 原样
  for (const name of (currentGroup.value.proxies || [])) {
    const isGroup = proxyGroups.value.some(g => g.name === name)
    if (isGroup) {
      result.push(...expandGroup(name))
    } else {
      result.push(name)
    }
  }
  // 3. 已有 exclude 字段的值（容错保留）
  if (currentGroup.value.exclude && currentGroup.value.exclude.length) {
    result.push(...currentGroup.value.exclude)
  }
  // 去重
  return [...new Set(result)]
})

// 当「包含代理」或「Provider引用」变化时，获取 provider 节点（immediate 保证打开对话框时立即加载）
watch(
  () => [currentGroup.value.proxies, currentGroup.value.use],
  async ([newProxies, newUse]) => {
    const groups = proxyGroups.value
    const providersToFetch = new Set()

    // 递归收集一个策略组及其嵌套子组引用的所有 provider
    const collectFromGroup = (group, seenGroups = new Set()) => {
      if (!group || seenGroups.has(group.name)) return
      seenGroups.add(group.name)
      if (group.use && group.use.length) {
        for (const pn of group.use) providersToFetch.add(pn)
      }
      if (group.proxies && group.proxies.length) {
        for (const name of group.proxies) {
          // proxies 里可能是 provider 名
          if (providerNames.value.includes(name)) {
            providersToFetch.add(name)
          }
          const sub = groups.find(g => g.name === name)
          if (sub) collectFromGroup(sub, seenGroups)
        }
      }
    }

    // 1. 从 use 字段获取
    if (newUse && newUse.length) {
      for (const pn of newUse) providersToFetch.add(pn)
    }
    // 2. 从 proxies 中选中的策略组递归获取其引用的 provider
    if (newProxies && newProxies.length) {
      for (const name of newProxies) {
        if (providerNames.value.includes(name)) {
          providersToFetch.add(name)
        }
        const group = groups.find(g => g.name === name)
        if (group) collectFromGroup(group)
      }
    }

    // 只取未缓存的
    const uncached = [...providersToFetch].filter(pn => !providerNodesCache.value.has(pn))
    if (!uncached.length) return

    // 并发获取未缓存的 provider 节点
    const fetches = uncached.map(async (pn) => {
      try {
        const res = await fetch(`/api/router/proxy-provider-nodes/${encodeURIComponent(pn)}`)
        if (res.ok) {
          const data = await res.json()
          providerNodesCache.value.set(pn, data.nodes || [])
        }
      } catch {}
    })
    await Promise.all(fetches)
    // 触发响应式更新
    providerNodesCache.value = new Map(providerNodesCache.value)
  },
  { immediate: true, deep: true }
)

const availableProxies = computed(() => {
  const proxies = allNodes.value
  const groups = (localGroups.value || [])
    .filter(g => g.name !== currentGroup.value.name)
    .map(g => g.name)
  return [...proxies, ...groups, 'DIRECT', 'REJECT', 'PASS']
})

const hasExcludes = computed(() =>
  (localGroups.value || []).some(g => g['exclude-filter'])
)

const hasUse = computed(() =>
  (localGroups.value || []).some(g => g.use && g.use.length)
)

const typeTag = (t) => {
  const map = { select: '', 'url-test': 'warning', fallback: 'danger', 'load-balance': 'info' }
  return map[t] || ''
}

const onTypeChange = () => {
  const n = currentGroup.value.name
  const p = currentGroup.value.proxies || []
  const ef = currentGroup.value['exclude-filter'] || ''
  const u = currentGroup.value.use || []
  const f = currentGroup.value.filter
  currentGroup.value = { ...defaultGroup(), name: n, type: currentGroup.value.type, proxies: p, 'exclude-filter': ef, use: u, ...(f !== undefined ? { filter: f } : {}) }
}

const showAddDialog = () => { isEdit.value = false; currentGroup.value = { ...defaultGroup() }; dialogVisible.value = true }

const editGroup = (row, index) => {
  isEdit.value = true; editIndex.value = index
  currentGroup.value = {
    name: row.name || '', type: row.type || 'select',
    proxies: [...(row.proxies || [])], 'exclude-filter': row['exclude-filter'] || '', use: [...(row.use || [])],
    url: row.url || 'http://www.gstatic.com/generate_204',
    interval: row.interval || 300, tolerance: row.tolerance || 50,
    ...(row.filter !== undefined ? { filter: row.filter } : {})
  }
  dialogVisible.value = true
}

const saveGroup = () => {
  if (!currentGroup.value.name) { ElMessage.error('请填写名称'); return }
  if ((!currentGroup.value.proxies || !currentGroup.value.proxies.length) && (!currentGroup.value.use || !currentGroup.value.use.length)) { ElMessage.error('请至少选择代理或 Provider 引用（use）之一'); return }
  const data = { ...currentGroup.value }
    // 剔除节点：exclude-filter 关键词字符串，原样保存（空则删除字段）
    if (!data['exclude-filter']) delete data['exclude-filter']
    if (!data.use || !data.use.length) delete data.use
    if (!data.filter) delete data.filter
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
        const ref = parts.length >= 2 ? parts[parts.length - 1] : r
        if (ref.trim() === oldName) {
          // 更新最后一个字段（策略位）为新组名
          if (parts.length >= 3) {
            parts[parts.length - 1] = data.name
            return parts.join(',')
          } else if (parts.length === 2) {
            // 2段规则，第2段是策略，直接替换
            parts[1] = data.name
            return parts.join(',')
          }
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
  // 解析规则的策略字段，精确提取策略位进行比较
  const refRules = allRules.filter(r => {
    const parts = r.split(',');
    const ref = parts.length >= 2 ? parts[parts.length - 1] : r;
    return ref === name;
  });
  let msg = `确定删除策略组 "${name}"？`
  if (refRules.length) msg += `\\n\\n将同时删除 ${refRules.length} 条引用此组的规则`
  try {
    await ElMessageBox.confirm(msg, '确认删除', { confirmButtonText: '删除', type: refRules.length ? 'warning' : 'info' })
    _syncing=true
    const filtered = localGroups.value.filter((_, i) => i !== index)
    localGroups.value = filtered
    emit("update", "proxy-groups", filtered)
    if (refRules.length) {
      // 同样使用解析后的逻辑过滤规则
      const remainingRules = allRules.filter(r => {
        const parts = r.split(',');
        const ref = parts.length >= 2 ? parts[parts.length - 1] : r;
        return ref !== name;
      });
      emit("update", "rules", remainingRules)
    }
    // 从其他策略组的 proxies 里移除对本组的引用
    for (const g of filtered) {
      if (g.proxies) {
        g.proxies = g.proxies.filter(p => p !== name)
      }
    }
    _syncing=false
    ElMessage.success(refRules.length ? `已删除策略组及 ${refRules.length} 条引用规则` : '已删除')
  } catch {}
}
const onDrag = () => { _syncing=true; emit("update", "proxy-groups", [...localGroups.value]); _syncing=false }
</script>

<style scoped>
.proxy-group-table {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  border-radius: 4px;
  padding: 16px;
}
.table-header { display:flex; justify-content:space-between; margin-bottom:12px; align-items:center; }

@media (max-width: 640px) {
  .proxy-group-table {
    max-width: 100%;
    padding: 12px;
  }
  .drag-row {
    flex-wrap: wrap;
    padding: 8px;
  }
  .drag-col {
    min-width: 100px;
    flex: 1 1 auto;
  }
  .name-col { min-width: 120px; }
  .type-col { min-width: 90px; }
  .proxies-col { min-width: 200px; }
  .exclude-col { min-width: 120px; }
  .use-col { min-width: 140px; }
  .actions-col {
    min-width: 140px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .actions-col .el-button {
    min-width: 32px;
    min-height: 32px;
    padding: 8px 10px;
    font-size: 16px;
  }
  .drag-handle {
    width: 32px;
    font-size: 20px;
    touch-action: none;
  }
  .drag-row {
    padding: 12px;
  }
}
.drag-list { border:1px solid #e4e7ed; border-radius:4px; overflow:hidden; }
.drag-row {
  display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #f0f0f0;
  transition:background 0.15s; gap:8px;
}
.drag-row:last-child { border-bottom:none; }
.drag-row:hover { background:#f5f7fa; }
.drag-row.has-use { border-left:3px solid #409eff; }
.drag-row.has-exclude { border-left:3px solid #e6a23c; }
.ghost { opacity:0.4; background:#e6f7ff; }
.drag-handle { cursor:grab; color:#bbb; font-size:18px; width:24px; text-align:center; user-select:none; flex-shrink:0; }
.drag-handle:active { cursor:grabbing; color:#409eff; }
.drag-col { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.name-col { width:180px; font-weight:500; }
.type-col { width:90px; flex-shrink:0; }
.proxies-col { flex:1; min-width:200px; }
.exclude-col { width:120px; flex-shrink:0; }
.use-col { width:140px; flex-shrink:0; }
.actions-col { width:160px; flex-shrink:0; text-align:right; }
</style>
