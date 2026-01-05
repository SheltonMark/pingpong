<template>
  <div class="page">
    <div class="page-header">
      <h2>签到点管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        添加签到点
      </el-button>
    </div>

    <el-card>
      <el-table :data="points" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column prop="latitude" label="纬度" width="120" />
        <el-table-column prop="longitude" label="经度" width="120" />
        <el-table-column prop="radius" label="有效半径(米)" width="120" />
        <el-table-column prop="school_name" label="所属学校" width="150" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editPoint(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deletePoint(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑签到点' : '添加签到点'" width="500px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：体育馆一楼" />
        </el-form-item>
        <el-form-item label="纬度" required>
          <el-input v-model="form.latitude" placeholder="如：30.123456" />
        </el-form-item>
        <el-form-item label="经度" required>
          <el-input v-model="form.longitude" placeholder="如：120.123456" />
        </el-form-item>
        <el-form-item label="有效半径">
          <el-input-number v-model="form.radius" :min="10" :max="1000" />
          <span style="margin-left: 10px; color: #999">米</span>
        </el-form-item>
        <el-form-item label="所属学校">
          <el-select v-model="form.school_id" clearable placeholder="请选择">
            <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const points = ref([])
const schools = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)

const form = ref({
  name: '',
  latitude: '',
  longitude: '',
  radius: 100,
  school_id: null
})

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadPoints = async () => {
  loading.value = true
  try {
    const res = await fetch(`/api/admin/checkin-points?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      points.value = data.data || []
    }
  } catch (error) {
    console.error('加载签到点失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadSchools = async () => {
  try {
    const res = await fetch('/api/common/schools')
    const data = await res.json()
    if (data.success) {
      schools.value = data.data || []
    }
  } catch (error) {
    console.error('加载学校失败:', error)
  }
}

const showCreateDialog = () => {
  isEdit.value = false
  form.value = { name: '', latitude: '', longitude: '', radius: 100, school_id: null }
  dialogVisible.value = true
}

const editPoint = (row) => {
  isEdit.value = true
  form.value = { ...row }
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.value.name || !form.value.latitude || !form.value.longitude) {
    ElMessage.warning('请填写名称和坐标')
    return
  }

  submitting.value = true
  try {
    const url = isEdit.value
      ? `/api/admin/checkin-points/${form.value.id}`
      : '/api/admin/checkin-points'
    const method = isEdit.value ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form.value, user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '添加成功')
      dialogVisible.value = false
      loadPoints()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    console.error('提交失败:', error)
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const deletePoint = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这个签到点吗？', '提示', { type: 'warning' })

    const res = await fetch(`/api/admin/checkin-points/${row.id}?user_id=${getUserId()}`, { method: 'DELETE' })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('删除成功')
      loadPoints()
    } else {
      ElMessage.error(data.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  loadPoints()
  loadSchools()
})
</script>

<style scoped>
.page { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
</style>
