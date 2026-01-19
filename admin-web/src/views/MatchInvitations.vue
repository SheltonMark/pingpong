<template>
  <div class="page">
    <div class="page-header">
      <h2>约球管理</h2>
    </div>
    <div class="filter-row">
      <el-select v-model="filters.status" placeholder="状态筛选" clearable @change="loadInvitations" style="width: 150px;">
        <el-option label="全部状态" value="" />
        <el-option label="开放中" value="open" />
        <el-option label="已满员" value="full" />
        <el-option label="进行中" value="ongoing" />
        <el-option label="已结束" value="finished" />
        <el-option label="已取消" value="cancelled" />
      </el-select>
      <el-select v-model="filters.standalone" placeholder="类型筛选" clearable @change="loadInvitations" style="width: 150px;">
        <el-option label="全部" value="" />
        <el-option label="独立约球" value="true" />
        <el-option label="关联帖子" value="false" />
      </el-select>
      <el-select v-model="filters.school_id" placeholder="学校筛选" clearable filterable @change="loadInvitations" style="width: 200px;">
        <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
      </el-select>
    </div>

    <el-card>
      <el-table :data="invitations" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="发起人" width="150">
          <template #default="{ row }">
            <div class="author-cell">
              <el-avatar :src="row.creator_avatar" :size="32" />
              <span>{{ row.creator_name || '未知用户' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="150" />
        <el-table-column label="时间地点" min-width="200">
          <template #default="{ row }">
            <div class="location-cell">
              <p v-if="row.location">📍 {{ row.location }}</p>
              <p v-if="row.scheduled_time">🕐 {{ formatDateTime(row.scheduled_time) }}</p>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="参与人数" width="100">
          <template #default="{ row }">
            {{ row.participant_count || 1 }}/{{ row.max_participants }}
          </template>
        </el-table-column>
        <el-table-column prop="school_name" label="学校" width="120" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.post_id ? 'primary' : 'info'" size="small">
              {{ row.post_id ? '关联帖子' : '独立约球' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)" size="small">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'open' || row.status === 'full'"
              size="small"
              type="warning"
              @click="updateStatus(row, 'cancelled')"
            >
              取消
            </el-button>
            <el-button
              v-if="row.status === 'cancelled'"
              size="small"
              type="success"
              @click="updateStatus(row, 'open')"
            >
              恢复
            </el-button>
            <el-button
              v-if="row.status === 'open' || row.status === 'full'"
              size="small"
              type="primary"
              @click="updateStatus(row, 'finished')"
            >
              结束
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.limit"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadInvitations"
          @current-change="loadInvitations"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '../utils/format'

const loading = ref(false)
const invitations = ref([])
const schools = ref([])

const filters = reactive({
  status: '',
  standalone: '',
  school_id: ''
})

const pagination = reactive({
  page: 1,
  limit: 20,
  total: 0
})

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadInvitations = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      user_id: getUserId(),
      page: pagination.page,
      limit: pagination.limit
    })
    if (filters.status) params.append('status', filters.status)
    if (filters.standalone) params.append('standalone', filters.standalone)
    if (filters.school_id) params.append('school_id', filters.school_id)

    const res = await fetch(`/api/admin/match-invitations?${params}`)
    const data = await res.json()
    if (data.success) {
      invitations.value = data.data.list || []
      pagination.total = data.data.total || 0
    } else {
      ElMessage.error(data.message || '加载失败')
    }
  } catch (error) {
    console.error('加载约球失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadSchools = async () => {
  try {
    const res = await fetch(`/api/admin/schools?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      schools.value = data.data || []
    }
  } catch (error) {
    console.error('加载学校列表失败:', error)
  }
}

const updateStatus = async (row, newStatus) => {
  const statusLabels = { open: '恢复', cancelled: '取消', finished: '结束' }
  const action = statusLabels[newStatus]

  try {
    await ElMessageBox.confirm(`确定要${action}这个约球吗？`, '提示', {
      type: newStatus === 'cancelled' ? 'warning' : 'info'
    })

    const res = await fetch(`/api/admin/match-invitations/${row.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(`已${action}`)
      loadInvitations()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('更新状态失败:', error)
      ElMessage.error('操作失败')
    }
  }
}

const getStatusType = (status) => {
  const types = {
    open: 'success',
    full: 'warning',
    ongoing: 'primary',
    finished: 'info',
    cancelled: 'danger'
  }
  return types[status] || 'info'
}

const getStatusLabel = (status) => {
  const labels = {
    open: '开放中',
    full: '已满员',
    ongoing: '进行中',
    finished: '已结束',
    cancelled: '已取消'
  }
  return labels[status] || status
}

onMounted(() => {
  loadInvitations()
  loadSchools()
})
</script>

<style scoped>
.page {
  padding: 20px;
}
.page-header {
  margin-bottom: 16px;
}
.page-header h2 {
  margin: 0;
}
.filter-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.author-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.location-cell {
  font-size: 13px;
}
.location-cell p {
  margin: 2px 0;
}
.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
