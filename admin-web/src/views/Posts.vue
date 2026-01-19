<template>
  <div class="page">
    <div class="page-header">
      <h2>帖子管理</h2>
      <div class="filters">
        <el-select v-model="filters.status" placeholder="状态筛选" clearable @change="loadPosts">
          <el-option label="全部" value="" />
          <el-option label="启用" value="active" />
          <el-option label="隐藏" value="hidden" />
          <el-option label="已删除" value="deleted" />
        </el-select>
        <el-select v-model="filters.school_id" placeholder="学校筛选" clearable @change="loadPosts">
          <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
        </el-select>
      </div>
    </div>

    <el-card>
      <el-table :data="posts" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="作者" width="150">
          <template #default="{ row }">
            <div class="author-cell">
              <el-avatar :src="row.author_avatar" :size="32" />
              <span>{{ row.author_name || '未知用户' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="300">
          <template #default="{ row }">
            <div class="content-cell">
              <p class="content-text">{{ truncateText(row.content, 100) }}</p>
              <div v-if="row.images && row.images.length" class="image-count">
                <el-icon><Picture /></el-icon>
                {{ row.images.length }} 张图片
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="school_name" label="学校" width="120" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ getStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="like_count" label="点赞" width="70" />
        <el-table-column prop="comment_count" label="评论" width="70" />
        <el-table-column prop="created_at" label="发布时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'active'"
              size="small"
              type="warning"
              @click="updateStatus(row, 'hidden')"
            >
              隐藏
            </el-button>
            <el-button
              v-else-if="row.status === 'hidden'"
              size="small"
              type="success"
              @click="updateStatus(row, 'active')"
            >
              启用
            </el-button>
            <el-button
              v-if="row.status !== 'deleted'"
              size="small"
              type="danger"
              @click="updateStatus(row, 'deleted')"
            >
              删除
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
          @size-change="loadPosts"
          @current-change="loadPosts"
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
const posts = ref([])
const schools = ref([])

const filters = reactive({
  status: '',
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

const loadPosts = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      user_id: getUserId(),
      page: pagination.page,
      limit: pagination.limit
    })
    if (filters.status) params.append('status', filters.status)
    if (filters.school_id) params.append('school_id', filters.school_id)

    const res = await fetch(`/api/admin/posts?${params}`)
    const data = await res.json()
    if (data.success) {
      posts.value = data.data.list || []
      pagination.total = data.data.total || 0
    } else {
      ElMessage.error(data.message || '加载失败')
    }
  } catch (error) {
    console.error('加载帖子失败:', error)
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
  const statusLabels = { active: '启用', hidden: '隐藏', deleted: '删除' }
  const action = statusLabels[newStatus]

  try {
    await ElMessageBox.confirm(`确定要${action}这条帖子吗？`, '提示', {
      type: newStatus === 'deleted' ? 'warning' : 'info'
    })

    const res = await fetch(`/api/admin/posts/${row.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(`已${action}`)
      loadPosts()
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
  const types = { active: 'success', hidden: 'warning', deleted: 'danger' }
  return types[status] || 'info'
}

const getStatusLabel = (status) => {
  const labels = { active: '启用', hidden: '隐藏', deleted: '已删除' }
  return labels[status] || status
}

const truncateText = (text, maxLength) => {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

onMounted(() => {
  loadPosts()
  loadSchools()
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
  flex-wrap: wrap;
  gap: 12px;
}
.page-header h2 {
  margin: 0;
}
.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.author-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.content-cell {
  max-width: 100%;
}
.content-text {
  margin: 0;
  word-break: break-word;
}
.image-count {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
}
.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
</style>
