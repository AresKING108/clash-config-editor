<template>
  <div class="rule-table">
    <div class="table-header">
      <el-space>
        <el-button type="primary" :icon="Plus" @click="showAddDialog">添加规则</el-button>
        <el-button type="warning" :icon="Search" @click="findDuplicates" :disabled="!allRules.length">
          查找重复规则
        </el-button>
      </el-space>
      <el-input
        v-model="searchText"
        placeholder="搜索规则 (类型/域名/策略)"
        clearable
        style="width: 320px"
        :prefix-icon="Search"
      />
    </div>

    <div class="table-scroll">
      <el-table :data="pageRules" style="width: 100%" highlight-current-row size="small" max-height="calc(100vh - 260px)">
        <el-table-column type="index" label="#" width="50" />
        <el-table-column label="规则" min-width="450">
          <template #default="{ row }">
            <el-tag size="small">{{ row.type }}</el-tag>
            <code v-if="row.value" style="margin: 0 8px; color:#409eff; font-size:13px">{{ row.value }}</code>
            <el-tag size="small" :type="row.policy === 'DIRECT' ? 'success' : row.policy === 'REJECT' ? 'danger' : ''">
              {{ row.policy }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <el-space>
              <el-button size="small" @click="moveUp(row)">上移</el-button>
              <el-button size="small" @click="moveDown(row)">下移</el-button>
              <el-button size="small" type="danger" @click="deleteRule(row)">删除</el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>
    </div>
    <!-- ... dialogs same as before ... -->
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({ category: Object, config: Object })
const emit = defineEmits(['update'])

const ruleTypes = computed(() => props.category.ruleTypes || [])
const searchText = ref('')
const dialogVisible = ref(false)
const currentRule = ref({ type: 'DOMAIN-SUFFIX', value: '', policy: 'DIRECT' })
const dupDialogVisible = ref(false)
const dupGroups = ref([])

const allRules = computed(() => props.config.rules || [])
const proxyGroups = computed(() => props.config['proxy-groups'] || [])

const parseRule = (ruleStr) => {
  const parts = ruleStr.split(',')
  const type = parts[0]
  const rt = ruleTypes.value.find(r => r.type === type)
  if (rt?.hasValue === false) return { type, value: null, policy: parts[1] || 'DIRECT' }
  return { type, value: parts[1] || '', policy: parts[2] || 'DIRECT' }
}

const ruleToKey = (r) => `${r.type},${r.value||''},${r.policy}`

const parsedRules = computed(() => allRules.value.map(parseRule))

const pageRules = computed(() => {
  if (!searchText.value) return parsedRules.value
  const q = searchText.value.toLowerCase()
  return parsedRules.value.filter(r =>
    r.type.toLowerCase().includes(q) ||
    (r.value && r.value.toLowerCase().includes(q)) ||
    r.policy.toLowerCase().includes(q)
  )
})

const needsValue = computed(() => {
  const rt = ruleTypes.value.find(r => r.type === currentRule.value.type)
  return rt?.hasValue !== false
})

const formatRule = (rule) => rule.value ? `${rule.type},${rule.value},${rule.policy}` : `${rule.type},${rule.policy}`

const findRealIndex = (row) => {
  // 用规则内容在 allRules 里找真实索引
  const key = formatRule(row)
  return allRules.value.findIndex(r => r === key)
}

const onRuleTypeChange = () => {
  const rt = ruleTypes.value.find(r => r.type === currentRule.value.type)
  if (rt?.hasValue === false) currentRule.value.value = ''
}

const showAddDialog = () => { currentRule.value = { type: 'DOMAIN-SUFFIX', value: '', policy: 'DIRECT' }; dialogVisible.value = true }

const saveRule = () => {
  if (needsValue.value && !currentRule.value.value) { ElMessage.error('请输入匹配值'); return }
  if (!currentRule.value.policy) { ElMessage.error('请选择策略'); return }
  emit('update', 'rules', [...allRules.value, formatRule(currentRule.value)])
  dialogVisible.value = false; ElMessage.success('添加成功')
}

const deleteRule = async (row) => {
  const realIdx = findRealIndex(row)
  if (realIdx < 0) { ElMessage.error('未找到该规则'); return }
  try {
    await ElMessageBox.confirm(`确定删除规则 #${realIdx + 1}？\n${allRules.value[realIdx]}`, '确认删除')
    emit('update', 'rules', allRules.value.filter((_, i) => i !== realIdx))
    ElMessage.success('已删除')
  } catch {}
}

const moveUp = (row) => {
  const i = findRealIndex(row)
  if (i <= 0) return
  const nr = [...allRules.value]; [nr[i-1], nr[i]] = [nr[i], nr[i-1]]
  emit('update', 'rules', nr)
}

const moveDown = (row) => {
  const i = findRealIndex(row)
  if (i < 0 || i >= allRules.value.length - 1) return
  const nr = [...allRules.value]; [nr[i], nr[i+1]] = [nr[i+1], nr[i]]
  emit('update', 'rules', nr)
}

const findDuplicates = () => {
  const seen = {}; const groups = []
  allRules.value.forEach((ruleStr, idx) => {
    if (!seen[ruleStr]) seen[ruleStr] = []
    seen[ruleStr].push(idx)
  })
  for (const [key, indices] of Object.entries(seen)) {
    if (indices.length > 1) groups.push({ ...parseRule(key), count: indices.length, indices })
  }
  dupGroups.value = groups; dupDialogVisible.value = true
}

const dupCount = computed(() => dupGroups.value.reduce((s, g) => s + g.count - 1, 0))

const removeDup = (idx) => {
  emit('update', 'rules', allRules.value.filter((_, i) => i !== idx))
  ElMessage.success(`已删除 #${idx + 1}`); findDuplicates()
}

const removeAllDups = async () => {
  try {
    await ElMessageBox.confirm(`将删除 ${dupCount.value} 条重复规则，每组保留第1条`, '批量删除')
    const keep = new Set(); const seen = {}
    allRules.value.forEach((rs, i) => { if (!seen[rs]) { seen[rs] = true; keep.add(i) } })
    emit('update', 'rules', allRules.value.filter((_, i) => keep.has(i)))
    dupDialogVisible.value = false
    ElMessage.success(`已删除 ${dupCount.value} 条重复规则，保留 ${keep.size} 条`)
  } catch {}
}
</script>

<style scoped>
.rule-table { width: 100%; }
.table-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
.dup-group { border:1px solid #e4e7ed; border-radius:6px; padding:12px; margin-bottom:12px; }
.dup-header { margin-bottom:8px; }
.dup-indices { display:flex; flex-wrap:wrap; }
</style>
