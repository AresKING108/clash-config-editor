<template>
  <div class="rule-table">
    <div class="table-header">
      <el-space>
        <el-button type="primary" :icon="Plus" @click="showAddDialog">添加规则</el-button>
        <el-button type="warning" :icon="Search" @click="findDuplicates" :disabled="!allRules.length">
          查找重复规则
        </el-button>
      </el-space>
      <el-space>
        <el-tag type="info" size="small">{{ totalFiltered }} 条规则</el-tag>
        <el-input
          v-model="searchText"
          placeholder="搜索规则 (类型/域名/策略)"
          clearable
          style="width: 320px"
          :prefix-icon="Search"
          @input="searchText = $event; currentPage = 1"
        />
      </el-space>
    </div>

    <el-table :data="pageRules" style="width: 100%" highlight-current-row size="small">
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
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ $index }">
          <el-space>
            <el-button size="small" @click="moveUp(pageOffset + $index)" :disabled="pageOffset + $index === 0">
              上移
            </el-button>
            <el-button size="small" @click="moveDown(pageOffset + $index)" :disabled="pageOffset + $index === allRules.length - 1">
              下移
            </el-button>
            <el-button size="small" type="danger" @click="deleteRule(pageOffset + $index)">删除</el-button>
          </el-space>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :total="totalFiltered"
        :page-sizes="[50, 100, 200, 500]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        small
      />
    </div>

    <!-- 添加规则对话框 -->
    <el-dialog v-model="dialogVisible" title="添加规则" width="500px" :close-on-click-modal="false">
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
          <el-select v-model="currentRule.policy" placeholder="选择策略" style="width:100%" filterable>
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
        <p style="color:#909399;margin-bottom:12px">找到 {{ dupCount }} 条重复规则，按规则内容分组如下：</p>
        <div v-for="(group, gi) in dupGroups" :key="gi" class="dup-group">
          <div class="dup-header">
            <el-tag size="small">{{ group.type }}</el-tag>
            <code v-if="group.value" style="margin:0 8px">{{ group.value }}</code>
            <el-tag size="small" type="success">{{ group.policy }}</el-tag>
            <span style="margin-left:12px;color:#e6a23c">重复 {{ group.count }} 次</span>
          </div>
          <div class="dup-indices">
            <el-tag
              v-for="(idx, ii) in group.indices"
              :key="ii"
              size="small"
              :type="ii === 0 ? 'success' : 'danger'"
              style="cursor:pointer;margin:2px"
              @click="removeDup(idx)"
            >
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
import { ref, computed } from 'vue'
import { Plus, Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({ category: Object, config: Object })
const emit = defineEmits(['update'])

const ruleTypes = computed(() => props.category.ruleTypes || [])
const searchText = ref('')
const currentPage = ref(1)
const pageSize = ref(100)

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

const parsedRules = computed(() => allRules.value.map(parseRule))

const filteredRules = computed(() => {
  if (!searchText.value) return parsedRules.value
  const q = searchText.value.toLowerCase()
  return parsedRules.value.filter(r =>
    r.type.toLowerCase().includes(q) ||
    (r.value && r.value.toLowerCase().includes(q)) ||
    r.policy.toLowerCase().includes(q)
  )
})

const totalFiltered = computed(() => filteredRules.value.length)

const pageOffset = computed(() => (currentPage.value - 1) * pageSize.value)

const pageRules = computed(() => {
  const start = pageOffset.value
  return filteredRules.value.slice(start, start + pageSize.value)
})

const needsValue = computed(() => {
  const rt = ruleTypes.value.find(r => r.type === currentRule.value.type)
  return rt?.hasValue !== false
})

const formatRule = (rule) => rule.value ? `${rule.type},${rule.value},${rule.policy}` : `${rule.type},${rule.policy}`

const onRuleTypeChange = () => {
  const rt = ruleTypes.value.find(r => r.type === currentRule.value.type)
  if (rt?.hasValue === false) currentRule.value.value = ''
}

const showAddDialog = () => {
  currentRule.value = { type: 'DOMAIN-SUFFIX', value: '', policy: 'DIRECT' }
  dialogVisible.value = true
}

const saveRule = () => {
  if (needsValue.value && !currentRule.value.value) { ElMessage.error('请输入匹配值'); return }
  if (!currentRule.value.policy) { ElMessage.error('请选择策略'); return }
  const newRules = [...allRules.value, formatRule(currentRule.value)]
  emit('update', 'rules', newRules)
  dialogVisible.value = false
  ElMessage.success('添加成功')
}

const deleteRule = async (realIndex) => {
  const rule = parsedRules.value[realIndex]
  const ruleStr = allRules.value[realIndex]
  try {
    await ElMessageBox.confirm(`确定删除规则 #${realIndex + 1}？\n${ruleStr}`, '确认删除')
    const newRules = allRules.value.filter((_, i) => i !== realIndex)
    emit('update', 'rules', newRules)
    ElMessage.success('已删除')
  } catch {}
}

const moveUp = (realIndex) => {
  if (realIndex === 0) return
  const nr = [...allRules.value]; [nr[realIndex - 1], nr[realIndex]] = [nr[realIndex], nr[realIndex - 1]]
  emit('update', 'rules', nr)
}

const moveDown = (realIndex) => {
  if (realIndex >= allRules.value.length - 1) return
  const nr = [...allRules.value]; [nr[realIndex], nr[realIndex + 1]] = [nr[realIndex + 1], nr[realIndex]]
  emit('update', 'rules', nr)
}

// ===== 查重去重 =====
const findDuplicates = () => {
  const seen = {}
  const groups = []
  allRules.value.forEach((ruleStr, idx) => {
    const key = ruleStr
    if (!seen[key]) { seen[key] = [] }
    seen[key].push(idx)
  })
  for (const [key, indices] of Object.entries(seen)) {
    if (indices.length > 1) {
      const parsed = parseRule(key)
      groups.push({ ...parsed, count: indices.length, indices })
    }
  }
  dupGroups.value = groups
  dupDialogVisible.value = true
}

const dupCount = computed(() => dupGroups.value.reduce((s, g) => s + g.count - 1, 0))

const removeDup = (idx) => {
  const nr = allRules.value.filter((_, i) => i !== idx)
  emit('update', 'rules', nr)
  ElMessage.success(`已删除 #${idx + 1}`)
  // 重新计算重复
  findDuplicates()
}

const removeAllDups = async () => {
  try {
    await ElMessageBox.confirm(`将删除 ${dupCount.value} 条重复规则，每组保留第1条`, '批量删除')
    const keep = new Set()
    const seen = {}
    allRules.value.forEach((ruleStr, idx) => {
      if (!seen[ruleStr]) {
        seen[ruleStr] = true
        keep.add(idx)
      }
    })
    const nr = allRules.value.filter((_, i) => keep.has(i))
    emit('update', 'rules', nr)
    dupDialogVisible.value = false
    ElMessage.success(`已删除 ${dupCount.value} 条重复规则，保留 ${nr.length} 条`)
  } catch {}
}
</script>

<style scoped>
.rule-table { width: 100%; }
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}
.pagination-bar {
  display: flex;
  justify-content: center;
  margin-top: 16px;
  padding: 8px 0;
}
.dup-group {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}
.dup-header { margin-bottom: 8px; }
.dup-indices { display: flex; flex-wrap: wrap; }
</style>
