<template>
  <div class="page">
    <div class="page-header">
      <h2>公告管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        发布公告
      </el-button>
    </div>

    <el-card>
      <el-table :data="announcements" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column prop="priority" label="优先级" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.priority === 'high'" type="danger">高</el-tag>
            <el-tag v-else-if="row.priority === 'medium'" type="warning">中</el-tag>
            <el-tag v-else type="info">低</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="is_active" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'">
              {{ row.is_active ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editAnnouncement(row)">编辑</el-button>
            <el-button
              size="small"
              :type="row.is_active ? 'warning' : 'success'"
              @click="toggleActive(row)"
            >
              {{ row.is_active ? '禁用' : '启用' }}
            </el-button>
            <el-button size="small" type="danger" @click="deleteAnnouncement(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑公告' : '发布公告'" width="600px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="请输入公告标题" />
        </el-form-item>
        <el-form-item label="内容" required>
          <el-input v-model="form.content" type="textarea" :rows="5" placeholder="请输入公告内容" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="form.priority">
            <el-option label="高" value="high" />
            <el-option label="中" value="medium" />
            <el-option label="低" value="low" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联赛事">
          <el-select v-model="form.link_event_id" clearable placeholder="可选">
            <el-option v-for="e in events" :key="e.id" :label="e.title" :value="e.id" />
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
const announcements = ref([])
const events = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)

const form = ref({
  title: '',
  content: '',
  priority: 'medium',
  link_event_id: null
})

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadAnnouncements = async () => {
  loading.value = true
  try {
    const res = await fetch(`/api/admin/announcements?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      announcements.value = data.data || []
    }
  } catch (error) {
    console.error('加载公告失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadEvents = async () => {
  try {
    const res = await fetch(`/api/admin/events?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      events.value = data.data || []
    }
  } catch (error) {
    console.error('加载赛事失败:', error)
  }
}

const showCreateDialog = () => {
  isEdit.value = false
  form.value = {
    title: '',
    content: '',
    priority: 'medium',
    link_event_id: null
  }
  dialogVisible.value = true
}

const editAnnouncement = (row) => {
  isEdit.value = true
  form.value = { ...row }
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.value.title || !form.value.content) {
    ElMessage.warning('请填写标题和内容')
    return
  }

  submitting.value = true
  try {
    const url = isEdit.value
      ? `/api/admin/announcements/${form.value.id}`
      : '/api/admin/announcements'
    const method = isEdit.value ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form.value, user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '发布成功')
      dialogVisible.value = false
      loadAnnouncements()
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

const toggleActive = async (row) => {
  try {
    const res = await fetch(`/api/admin/announcements/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...row, status: row.status === 'active' ? 'inactive' : 'active', user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('状态已更新')
      loadAnnouncements()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error('操作失败')
  }
}

const deleteAnnouncement = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这条公告吗？', '提示', {
      type: 'warning'
    })

    const res = await fetch(`/api/admin/announcements/${row.id}?user_id=${getUserId()}`, {
      method: 'DELETE'
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('删除成功')
      loadAnnouncements()
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
  loadAnnouncements()
  loadEvents()
})
</script>

<style scoped>
.page {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
}
</style>
