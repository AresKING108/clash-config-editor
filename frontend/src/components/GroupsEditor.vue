<template>
  <div class="groups-editor">
    <el-table :data="groups" style="width:100%" stripe highlight-current-row>
      <el-table-column label="#" width="50">
        <template #default="{ $index }"><span class="drag-hint">⠿</span> {{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="name" label="策略组名称" width="200" />
      <el-table-column prop="type" label="类型" width="110">
        <template #default="{ row }">
          <el-tag :type="typeTag(row.type)" size="small">{{ row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="内容" min-width="400">
        <template #default="{ row }">
          <template v-if="row.type === 'select'">
            <el-tag v-for="p in row.proxies" :key="p" size="small" style="margin:1px 3px 1px 0">
              {{ p }}
            </el-tag>
            <el-tag v-if="row.matchPattern" size="small" type="info" effect="plain">
              兜底: {{ row.matchPattern }}
            </el-tag>
          </template>
          <template v-else>
            <span style="color:#606266;font-size:13px">
              匹配 {{ row.matchPattern }} | {{ row.url }} | {{ row.interval }}s
              <template v-if="row.tolerance"> | ±{{ row.tolerance }}</template>
            </span>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row, $index }">
          <el-button size="small" @click="editGroup(row, $index)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteGroup($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div style="margin-top:12px">
      <el-button type="primary" @click="showAddDialog">添加策略组</el-button>
      <el-button type="success" @click="emitSave" :disabled="!changed">保存修改</el-button>
    </div>

    <!-- 编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑策略组' : '添加策略组'" width="650px" :close-on-click-modal="false">
      <el-form :model="form" label-width="120px">
        <el-form-item label="策略组名称">
          <el-input v-model="form.name" placeholder="如：🔰 节点选择" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" @change="onTypeChange">
            <el-option label="手动选择 (select)" value="select" />
            <el-option label="自动测速 (url-test)" value="url-test" />
            <el-option label="故障转移 (fallback)" value="fallback" />
            <el-option label="负载均衡 (load-balance)" value="load-balance" />
          </el-select>
        </el-form-item>
        <el-form-item label="节点匹配规则">
          <el-input v-model="form.matchPattern" placeholder="如：.* 匹配全部，(港|hk|HK) 匹配香港节点" />
          <div style="font-size:12px;color:#909399;margin-top:4px">留空用 .* 匹配全部</div>
        </el-form-item>

        <template v-if="form.type === 'select'">
          <el-form-item label="可选策略">
            <el-select v-model="form.proxies" multiple filterable allow-create default-first-option style="width:100%"
              placeholder="输入或选择策略组/节点名，支持 DIRECT/REJECT">
              <el-option v-for="opt in allSelectable" :key="opt" :label="opt" :value="opt" />
            </el-select>
          </el-form-item>
        </template>

        <template v-if="form.type !== 'select'">
          <el-form-item label="测试 URL">
            <el-input v-model="form.url" placeholder="http://www.gstatic.com/generate_204" />
          </el-form-item>
          <el-form-item label="测试间隔(秒)">
            <el-input-number v-model="form.interval" :min="30" :max="3600" />
          </el-form-item>
          <el-form-item v-if="form.type === 'url-test'" label="容差(ms)">
            <el-input-number v-model="form.tolerance" :min="0" :max="1000" />
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
import { ElMessage, ElMessageBox } from 'element-plus'

const props = defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue', 'save'])

const groups = ref([])
const changed = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const editIndex = ref(-1)
const form = ref({ name: '', type: 'select', matchPattern: '.*', proxies: [], url: '', interval: 300, tolerance: 50 })

// 可选的策略/节点名（从所有组名提取）
const allSelectable = computed(() => {
  const names = groups.value.map(g => g.name).filter(Boolean)
  return [...new Set([...names, 'DIRECT', 'REJECT', 'PASS'])]
})

const typeTag = (t) => {
  const map = { 'select': '', 'url-test': 'warning', 'fallback': 'danger', 'load-balance': 'info' }
  return map[t] || ''
}

// 解析 groups.txt 格式
const parseLine = (line) => {
  line = line.trim()
  if (!line || line.startsWith('#')) return null
  const parts = line.split('`')
  if (parts.length < 2) return null
  const name = parts[0]
  const type = parts[1]

  if (type === 'select') {
    // name`select`[...proxies]`matchPattern
    const last = parts[parts.length - 1]
    const proxies = parts.slice(2, -1).map(p => p.replace(/^\[?\]?/, '')).filter(Boolean)
    return { name, type, matchPattern: last.startsWith('.') || last.startsWith('(') ? last : '.*', proxies }
  } else {
    // name`type`matchPattern`url`interval`[tolerance]
    return { name, type, matchPattern: parts[2] || '.*', url: parts[3] || '', interval: parseInt(parts[4]) || 300, tolerance: parts[5] ? parseInt(parts[5]) : undefined, proxies: [] }
  }
}

const serializeGroup = (g) => {
  if (g.type === 'select') {
    const proxyStr = g.proxies && g.proxies.length ? g.proxies.map(p => `[]${p}`).join('`') : ''
    const match = g.matchPattern || '.*'
    return `${g.name}\`${g.type}\`${proxyStr}\`${match}`
  } else {
    const parts = [g.name, g.type, g.matchPattern || '.*', g.url || '', g.interval || 300]
    if (g.type === 'url-test' && g.tolerance !== undefined) parts.push(g.tolerance)
    return parts.join('`')
  }
}

const parseAll = (text) => {
  return text.split('\n').map(parseLine).filter(Boolean)
}

const serializeAll = (gs) => gs.map(serializeGroup).join('\n') + '\n'

// 监听外部输入变化
watch(() => props.modelValue, (val) => {
  if (val) {
    groups.value = parseAll(val)
    changed.value = false
  }
}, { immediate: true })

const onTypeChange = () => {
  if (form.value.type !== 'select') form.value.proxies = []
}

const showAddDialog = () => {
  isEdit.value = false
  editIndex.value = -1
  form.value = { name: '', type: 'select', matchPattern: '.*', proxies: [], url: '', interval: 300, tolerance: 50 }
  dialogVisible.value = true
}

const editGroup = (row, idx) => {
  isEdit.value = true
  editIndex.value = idx
  form.value = { ...row, proxies: [...(row.proxies || [])] }
  dialogVisible.value = true
}

const saveGroup = () => {
  if (!form.value.name) { ElMessage.error('请填写策略组名称'); return }
  const data = { ...form.value, proxies: [...(form.value.proxies || [])] }
  if (isEdit.value && editIndex.value >= 0) {
    groups.value[editIndex.value] = data
  } else {
    groups.value.push(data)
  }
  changed.value = true
  emit('update:modelValue', serializeAll(groups.value))
  dialogVisible.value = false
  ElMessage.success(isEdit.value ? '已修改' : '已添加')
}

const deleteGroup = async (idx) => {
  try {
    await ElMessageBox.confirm(`确定删除 "${groups.value[idx].name}"？`)
    groups.value.splice(idx, 1)
    changed.value = true
    emit('update:modelValue', serializeAll(groups.value))
    ElMessage.success('已删除')
  } catch {}
}

const emitSave = () => {
  emit('save', serializeAll(groups.value))
  changed.value = false
}
</script>

<style scoped>
.groups-editor { padding: 4px 0; }
.drag-hint { color:#999; cursor:grab; margin-right:4px; }
</style>
