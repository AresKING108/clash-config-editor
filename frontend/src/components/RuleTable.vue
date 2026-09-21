<template>
  <div class="rule-table">
    <div class="table-header">
      <el-space>
        <el-button type="primary" :icon="Plus" @click="showAddDialog">添加规则</el-button>
        <el-button type="warning" :icon="Search" @click="findDuplicates" :disabled="!allRules.length">
          查找重复规则
        </el-button>
      </el-space>
      <el-input v-model="searchText" placeholder="搜索规则" clearable style="width: 320px" :prefix-icon="Search" />
      <el-tag type="info">拖拽 ⠿ 可排序</el-tag>
    </div>

    <div class="drag-list">
      <draggable v-model="localParsedRules" item-key="id" handle=".drag-handle" ghost-class="ghost" animation="200" @change="onDrag" :disabled="!!searchText">
        <template #item="{ element: row, index }">
          <div class="drag-row" v-show="isVisible(row)">
            <div class="drag-handle" title="拖拽排序">⠿</div>
            <div class="drag-col type-col">
              <el-tag size="small">{{ row.type }}</el-tag>
            </div>
            <div class="drag-col value-col">
              <code v-if="row.value" style="color:#409eff;font-size:13px">{{ row.value }}</code>
            </div>
            <div class="drag-col policy-col">
              <el-tag size="small" :type="row.policy==='DIRECT'?'success':row.policy==='REJECT'?'danger':''">{{ row.policy }}</el-tag>
            </div>
            <div class="drag-col actions-col">
              <el-space>
                <el-button size="small" :icon="Edit" @click="editRule(row)" circle/>
                <el-button size="small" :icon="Top" @click="topRule(row)" circle/>
                <el-button size="small" :icon="Bottom" @click="bottomRule(row)" circle/>
                <el-button size="small" :icon="Delete" type="danger" @click="deleteRule(row)" circle/>
              </el-space>
            </div>
          </div>
        </template>
      </draggable>
    </div>

    <!-- 添加/编辑规则对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑规则' : '添加规则'" width="500px" :close-on-click-modal="false">
      <el-form :model="currentRule" label-width="100px">
        <el-form-item label="规则类型">
          <el-select v-model="currentRule.type" @change="onRuleTypeChange" style="width:100%" filterable>
            <el-option v-for="rt in ruleTypes" :key="rt.type" :label="rt.label" :value="rt.type" />
          </el-select>
        </el-form-item>
        <el-form-item label="匹配值" v-if="needsValue">
          <el-input v-model="currentRule.value" placeholder="域名/IP/关键词" />
        </el-form-item>
        <el-form-item label="策略">
          <el-select v-model="currentRule.policy" placeholder="输入或选择策略" style="width:100%" filterable allow-create default-first-option>
            <el-option label="DIRECT" value="DIRECT" />
            <el-option label="REJECT" value="REJECT" />
            <el-option v-for="g in proxyGroups" :key="g.name" :label="g.name" :value="g.name" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveRule">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重复规则对话框 -->
    <el-dialog v-model="dupDialogVisible" title="重复规则" width="700px" :close-on-click-modal="false">
      <template v-if="dupGroups.length">
        <p style="color:#909399;margin-bottom:12px">找到 {{ dupCount }} 条重复规则：</p>
        <div v-for="(g, gi) in dupGroups" :key="gi" class="dup-group">
          <div class="dup-header">
            <el-tag size="small">{{ g.type }}</el-tag>
            <code v-if="g.value" style="margin:0 8px">{{ g.value }}</code>
            <el-tag size="small" type="success">{{ g.policy }}</el-tag>
            <span style="margin-left:12px;color:#e6a23c">重复 {{ g.count }} 次</span>
          </div>
          <div class="dup-indices">
            <el-tag v-for="(idx, ii) in g.indices" :key="ii" size="small"
              :type="ii === 0 ? 'success' : 'danger'"
              style="cursor:pointer;margin:2px" @click="removeDup(idx)">
              #{{ idx + 1 }}{{ ii === 0 ? ' (保留)' : ' ✕' }}
            </el-tag>
          </div>
        </div>
        <div style="margin-top:16px">
          <el-button type="danger" @click="removeAllDups">删除全部重复（每组保留第1条）</el-button>
        </div>
      </template>
      <p v-else style="color:#67c23a;font-size:16px">✅ 没有找到重复规则</p>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onActivated, onMounted } from 'vue'
import { Plus, Search, Edit, Top, Bottom, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import draggable from 'vuedraggable'

const props = defineProps({ category: Object, config: Object })
const emit = defineEmits(['update'])

const ruleTypes = computed(() => props.category.ruleTypes || [])

// Handle component activation and mount to ensure rules are populated
const handleActivation = () => {
  if (props.config.rules) {
    // Use watch-like behavior to populate localRules and localParsedRules
    populateFromProps()
  }
}

onMounted(() => {
  handleActivation()
})

onActivated(() => {
  handleActivation()
})
const searchText = ref('')
const dialogVisible = ref(false)
const isEdit = ref(false)
const editIdx = ref(-1)
const currentRule = ref({ type: 'DOMAIN-SUFFIX', value: '', policy: 'DIRECT' })
const dupDialogVisible = ref(false)
const dupGroups = ref([])

const allRules = computed(() => props.config.rules || [])
const proxyGroups = computed(() => props.config['proxy-groups'] || [])

// Raw rule strings for parent config
const localRules = ref([])

// Parsed rule objects for UI display with unique ids
let nextId = 1

// Helper function to check if a rule row should be visible based on search text
const isVisible = (row) => {
  if (!searchText.value) return true
  const q = searchText.value.toLowerCase()
  return row.type.toLowerCase().includes(q) || (row.value && row.value.toLowerCase().includes(q)) || row.policy.toLowerCase().includes(q)
}

// Internal array of parsed rules (not filtered by search) - v-model binding for draggable
const localParsedRules = ref([])

// Sync raw rules from config and rebuild parsed objects - simplified approach like ProxyGroupTable.vue
const populateFromProps = () => {
  const val = props.config.rules
  if (!val) {
    localRules.value = []
    localParsedRules.value = []
    return
  }
  // Direct copy and rebuild both arrays
  localRules.value = [...val]
  const newParsed = localRules.value.map((raw, idx) => {
    const parsed = parseRule(raw)
    return {
      id: idx + nextId++,
      type: parsed.type,
      value: parsed.value,
      policy: parsed.policy,
      raw: raw,
      originalIndex: idx
    }
  })
  localParsedRules.value = newParsed
}

// Watch for config changes using simple array comparison like ProxyGroupTable.vue
const prevRulesRef = ref([])
watch(() => props.config.rules, (val) => {
  if (!val) {
    // No rules - clear arrays
    if (localRules.value.length > 0) {
      localRules.value = []
      localParsedRules.value = []
    }
    return
  }

  // Simple array comparison (check if rules are different)
  const currentRules = localRules.value
  const isDifferent = currentRules.length !== val.length ||
    currentRules.some((rule, idx) => rule !== val[idx])

  if (isDifferent) {
    // Rebuild both arrays from scratch
    localRules.value = [...val]
    localParsedRules.value = localRules.value.map((raw, idx) => {
      const parsed = parseRule(raw)
      return {
        id: idx + nextId++,
        type: parsed.type,
        value: parsed.value,
        policy: parsed.policy,
        raw: raw,
        originalIndex: idx
      }
    })
  }
}, { immediate: true, deep: true })

const onDrag = () => {
  // Rebuild localRules from reordered parsedRules
  const reordered = localParsedRules.value.map(p => p.raw)
  emit('update', 'rules', [...reordered])
  localRules.value = [...reordered]
  // Rebuild localParsedRules from reordered raw rules
  localParsedRules.value = reordered.map((raw, idx) => {
    const parsed = parseRule(raw)
    return {
      id: idx + nextId++,
      type: parsed.type,
      value: parsed.value,
      policy: parsed.policy,
      raw: raw,
      originalIndex: idx
    }
  })
}

const parseRule = (ruleStr) => {
  const parts = ruleStr.split(',')
  const type = parts[0]
  const rt = ruleTypes.value.find(r => r.type === type)
  if (rt?.hasValue === false) return { type, value: null, policy: parts[1] || 'DIRECT' }
  return { type, value: parts[1] || '', policy: parts[2] || 'DIRECT' }
}

const formatRule = (rule) => rule.value ? `${rule.type},${rule.value},${rule.policy}` : `${rule.type},${rule.policy}`

const needsValue = computed(() => {
  const rt = ruleTypes.value.find(r => r.type === currentRule.value.type)
  return rt?.hasValue !== false
})

const findRealIndex = (row) => {
  if (!row.raw) return -1
  return localRules.value.findIndex(r => r === row.raw)
}

const onRuleTypeChange = () => {
  const rt = ruleTypes.value.find(r => r.type === currentRule.value.type)
  if (rt?.hasValue === false) currentRule.value.value = ''
}

const showAddDialog = () => {
  isEdit.value = false; editIdx.value = -1
  currentRule.value = { type: 'DOMAIN-SUFFIX', value: '', policy: 'DIRECT' }
  dialogVisible.value = true
}

const editRule = (row) => {
  const idx = findRealIndex(row)
  if (idx < 0) { ElMessage.error('未找到该规则'); return }
  isEdit.value = true; editIdx.value = idx
  currentRule.value = { ...row }
  dialogVisible.value = true
}

const saveRule = () => {
  if (needsValue.value && !currentRule.value.value) { ElMessage.error('请输入匹配值'); return }
  if (!currentRule.value.policy) { ElMessage.error('请选择策略'); return }
  const ruleStr = formatRule(currentRule.value)
  if (isEdit.value && editIdx.value >= 0) {
    const newRules = [...localRules.value]
    newRules[editIdx.value] = ruleStr
    emit('update', 'rules', newRules)
    localRules.value = newRules
    // Rebuild localParsedRules for editing
    localParsedRules.value = newRules.map((raw, idx) => {
      const parsed = parseRule(raw)
      return {
        id: idx + nextId++,
        type: parsed.type,
        value: parsed.value,
        policy: parsed.policy,
        raw: raw,
        originalIndex: idx
      }
    })
  } else {
    // 新添加的规则应该在规则列表里优先，在全配置文件里也是优先
    // 直接插入到数组最前，确保新规则的最高优先级
    const newRules = [ruleStr, ...localRules.value]
    emit('update', 'rules', newRules)
    localRules.value = newRules
    // Rebuild localParsedRules for new rule prioritization
    localParsedRules.value = newRules.map((raw, idx) => {
      const parsed = parseRule(raw)
      return {
        id: idx + nextId++,
        type: parsed.type,
        value: parsed.value,
        policy: parsed.policy,
        raw: raw,
        originalIndex: idx
      }
    })
  }
  dialogVisible.value = false
  ElMessage.success(isEdit.value ? '修改成功' : '添加成功')
}

const deleteRule = async (row) => {
  const realIdx = findRealIndex(row)
  if (realIdx < 0) { ElMessage.error('未找到该规则'); return }
  try {
    await ElMessageBox.confirm(`确定删除规则 #${realIdx + 1}？\n${localRules.value[realIdx]}`, '确认删除')
    emit('update', 'rules', localRules.value.filter((_, i) => i !== realIdx))
    localRules.value = localRules.value.filter((_, i) => i !== realIdx)
    // Rebuild localParsedRules for deletion
    localParsedRules.value = localRules.value.map((raw, idx) => {
      const parsed = parseRule(raw)
      return {
        id: idx + nextId++,
        type: parsed.type,
        value: parsed.value,
        policy: parsed.policy,
        raw: raw,
        originalIndex: idx
      }
    })
    ElMessage.success('已删除')
  } catch {}
}

const topRule = (row) => {
  const i = findRealIndex(row)
  if (i <= 0) return
  const nr = [...localRules.value]
  const item = nr[i]
  nr.splice(i, 1)
  nr.unshift(item)
  emit('update', 'rules', nr)
  localRules.value = nr
  // Rebuild localParsedRules for reordering
  localParsedRules.value = nr.map((raw, idx) => {
    const parsed = parseRule(raw)
    return {
      id: idx + nextId++,
      type: parsed.type,
      value: parsed.value,
      policy: parsed.policy,
      raw: raw,
      originalIndex: idx
    }
  })
}

const bottomRule = (row) => {
  const i = findRealIndex(row)
  if (i < 0 || i >= localRules.value.length - 1) return
  const nr = [...localRules.value]
  const item = nr[i]
  nr.splice(i, 1)
  nr.push(item)
  emit('update', 'rules', nr)
  localRules.value = nr
  // Rebuild localParsedRules for reordering
  localParsedRules.value = nr.map((raw, idx) => {
    const parsed = parseRule(raw)
    return {
      id: idx + nextId++,
      type: parsed.type,
      value: parsed.value,
      policy: parsed.policy,
      raw: raw,
      originalIndex: idx
    }
  })
}

const findDuplicates = () => {
  const seen = {}; const groups = []
  localParsedRules.value.forEach((rp, i) => {
    if (!seen[rp.raw]) seen[rp.raw] = []; seen[rp.raw].push(i)
  })
  for (const [raw, indices] of Object.entries(seen)) {
    if (indices.length > 1) groups.push({ ...parseRule(raw), count: indices.length, indices })
  }
  dupGroups.value = groups; dupDialogVisible.value = true
}

const dupCount = computed(() => dupGroups.value.reduce((s, g) => s + g.count - 1, 0))

const removeDup = (idx) => {
  emit('update', 'rules', localRules.value.filter((_, i) => i !== idx))
  localRules.value = localRules.value.filter((_, i) => i !== idx)
  ElMessage.success(`已删除 #${idx + 1}`); findDuplicates()
}

const removeAllDups = async () => {
  try {
    await ElMessageBox.confirm(`将删除 ${dupCount.value} 条重复规则，每组保留第1条`, '批量删除')
    const keep = new Set(); const seen = {}
    localParsedRules.value.forEach((rp, i) => { if (!seen[rp.raw]) { seen[rp.raw] = true; keep.add(i) } })
    // Get the raw rules to emit
    const filteredRules = localParsedRules.value.filter((_, i) => keep.has(i)).map(rp => rp.raw)
    emit('update', 'rules', filteredRules)
    localRules.value = filteredRules
    // Rebuild localParsedRules for the filtered result
    localParsedRules.value = filteredRules.map((raw, idx) => {
      const parsed = parseRule(raw)
      return {
        id: idx + nextId++,
        type: parsed.type,
        value: parsed.value,
        policy: parsed.policy,
        raw: raw,
        originalIndex: idx
      }
    })
    dupDialogVisible.value = false
    ElMessage.success(`已删除 ${dupCount.value} 条重复规则，保留 ${keep.size} 条`)
  } catch {}
}
</script>

<style scoped>
.rule-table {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  border-radius: 4px;
  padding: 16px;
}
.table-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:8px; flex-wrap:wrap; }

@media (max-width: 640px) {
  .rule-table {
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
  .type-col { min-width: 100px; }
  .value-col { min-width: 160px; }
  .policy-col { min-width: 100px; }
  .actions-col {
    min-width: 160px;
    display: flex;
    justify-content: flex-end;
    gap: 6px;
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
  .dup-group {
    padding: 12px;
  }
  .dup-indices {
    justify-content: center;
  }
}
.dup-group { border:1px solid #e4e7ed; border-radius:6px; padding:12px; margin-bottom:12px; }
.dup-header { margin-bottom:8px; }
.dup-indices { display:flex; flex-wrap:wrap; }

/* Drag row styles */
.drag-list { border:1px solid #e4e7ed; border-radius:4px; overflow:hidden; }
.drag-row {
  display:flex; align-items:center; padding:8px 12px; border-bottom:1px solid #f0f0f0;
  transition:background 0.15s; gap:8px;
}
.drag-row:last-child { border-bottom:none; }
.drag-row:hover { background:#f5f7fa; }
.drag-handle { cursor:grab; color:#bbb; font-size:18px; width:24px; text-align:center; user-select:none; flex-shrink:0; }
.drag-handle:active { cursor:grabbing; color:#409eff; }
.drag-col { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.type-col { width:120px; flex-shrink:0; }
.value-col { flex:1; min-width:200px; }
.policy-col { width:100px; flex-shrink:0; }
.actions-col { width:200px; flex-shrink:0; text-align:right; }
.ghost { opacity:0.4; background:#e6f7ff; }
</style>
