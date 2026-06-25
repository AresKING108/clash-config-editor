<template>
  <div class="proxy-group-table">
    <div class="table-header">
      <el-button type="primary" :icon="Plus" @click="showAddDialog">添加代理组</el-button>
      <el-tag type="info">拖拽左侧手柄可排序</el-tag>
    </div>

    <el-table :data="proxyGroups" style="width: 100%" row-key="name">
      <el-table-column label="#" width="50">
        <template #default="{ $index }">
          <span class="drag-handle" title="拖拽排序">⠿</span>
          <span style="margin-left: 4px">{{ $index + 1 }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="200" />
      <el-table-column prop="type" label="类型" width="120" />
      <el-table-column label="代理列表" min-width="350">
        <template #default="{ row }">
          <el-tag
            v-for="proxy in row.proxies"
            :key="proxy"
            size="small"
            :type="proxy === 'DIRECT' ? 'success' : proxy === 'REJECT' ? 'danger' : ''"
            style="margin-right: 4px; margin-bottom: 2px"
          >
            {{ proxy }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row, $index }">
          <el-button size="small" @click="editGroup(row, $index)">编辑</el-button>
          <el-button size="small" type="danger" @click="deleteGroup($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑代理组' : '添加代理组'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="currentGroup" label-width="120px">
        <el-form-item label="名称">
          <el-input v-model="currentGroup.name" placeholder="策略组名称" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="currentGroup.type" @change="onTypeChange" :disabled="isEdit">
            <el-option
              v-for="type in groupTypes"
              :key="type.type"
              :label="type.label"
              :value="type.type"
            />
          </el-select>
        </el-form-item>

        <el-form-item
          v-for="field in currentFields"
          :key="field.key"
          :label="field.label"
          :required="field.required"
        >
          <el-input
            v-if="field.type === 'string'"
            v-model="currentGroup[field.key]"
            :placeholder="field.default || field.label"
          />
          <el-input-number
            v-else-if="field.type === 'number'"
            v-model="currentGroup[field.key]"
            :placeholder="field.default"
            style="width: 100%"
          />
          <el-select
            v-else-if="field.type === 'select'"
            v-model="currentGroup[field.key]"
          >
            <el-option
              v-for="option in field.options"
              :key="option"
              :label="option"
              :value="option"
            />
          </el-select>
          <el-select
            v-else-if="field.type === 'array' && field.key === 'proxies'"
            v-model="currentGroup[field.key]"
            multiple
            placeholder="选择代理（可搜索）"
            filterable
            style="width: 100%"
          >
            <el-option
              v-for="proxy in availableProxies"
              :key="proxy"
              :label="proxy"
              :value="proxy"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  category: Object,
  config: Object
})

const emit = defineEmits(['update'])

const groupTypes = computed(() => props.category.types || [])
const dialogVisible = ref(false)
const isEdit = ref(false)
const currentGroup = ref({})
const editIndex = ref(-1)
const currentFields = ref([])

const proxyGroups = computed(() => props.config['proxy-groups'] || [])
const availableProxies = computed(() => {
  const proxies = (props.config.proxies || []).map(p => p.name)
  const groups = (props.config['proxy-groups'] || [])
    .filter(g => g.name !== currentGroup.value.name)
    .map(g => g.name)
  return [...proxies, ...groups, 'DIRECT', 'REJECT', 'PASS']
})

const onTypeChange = () => {
  const type = groupTypes.value.find(t => t.type === currentGroup.value.type)
  currentFields.value = type?.fields || []

  const newGroup = { type: currentGroup.value.type }
  currentFields.value.forEach(field => {
    if (field.default !== undefined) {
      newGroup[field.key] = field.default
    } else if (field.type === 'array') {
      newGroup[field.key] = []
    }
  })
  // 保留名称
  if (currentGroup.value.name) newGroup.name = currentGroup.value.name
  currentGroup.value = newGroup
}

const showAddDialog = () => {
  isEdit.value = false
  currentGroup.value = { type: 'select', name: '' }
  const type = groupTypes.value.find(t => t.type === 'select')
  currentFields.value = type?.fields || []
  dialogVisible.value = true
}

const editGroup = (row, index) => {
  isEdit.value = true
  editIndex.value = index
  currentGroup.value = { ...row }
  const type = groupTypes.value.find(t => t.type === row.type)
  currentFields.value = type?.fields || []
  dialogVisible.value = true
}

const saveGroup = () => {
  if (!currentGroup.value.name) {
    ElMessage.error('请填写代理组名称')
    return
  }

  if (!currentGroup.value.proxies || currentGroup.value.proxies.length === 0) {
    ElMessage.error('请选择至少一个代理')
    return
  }

  const newGroups = [...proxyGroups.value]
  if (isEdit.value) {
    newGroups[editIndex.value] = { ...currentGroup.value }
  } else {
    newGroups.push({ ...currentGroup.value })
  }

  emit('update', 'proxy-groups', newGroups)
  dialogVisible.value = false
  ElMessage.success(isEdit.value ? '修改成功' : '添加成功')
}

const deleteGroup = (index) => {
  const newGroups = proxyGroups.value.filter((_, i) => i !== index)
  emit('update', 'proxy-groups', newGroups)
  ElMessage.success('删除成功')
}
</script>

<style scoped>
.proxy-group-table {
  width: 100%;
}

.table-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
  align-items: center;
}

.drag-handle {
  cursor: grab;
  color: #999;
  font-size: 16px;
  user-select: none;
}
.drag-handle:active {
  cursor: grabbing;
}
</style>
