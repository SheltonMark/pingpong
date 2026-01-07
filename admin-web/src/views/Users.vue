<template>
  <div class="page">
    <div class="page-header">
      <h2>用户管理</h2>
    </div>

    <el-card>
      <!-- 搜索栏 -->
      <div class="search-bar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索用户名/手机号"
          style="width: 250px"
          @keyup.enter="searchUsers"
        >
          <template #append>
            <el-button @click="searchUsers">
              <el-icon><Search /></el-icon>
            </el-button>
          </template>
        </el-input>
      </div>

      <el-table :data="users" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="姓名" width="100" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="user_type" label="身份" width="80">
          <template #default="{ row }">
            {{ typeLabels[row.user_type] || row.user_type }}
          </template>
        </el-table-column>
        <el-table-column prop="school_name" label="学校" width="150" />
        <el-table-column prop="college_name" label="学院" width="120" />
        <el-table-column prop="rating" label="积分" width="80" />
        <el-table-column prop="role" label="角色" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.role === 'super_admin'" type="danger">超级管理</el-tag>
            <el-tag v-else-if="row.role === 'school_admin'" type="warning">校管理员</el-tag>
            <el-tag v-else-if="row.role === 'event_manager'" type="success">赛事管理</el-tag>
            <el-tag v-else type="info">普通用户</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="adjustRating(row)">调整积分</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 20"
        class="pagination"
        :current-page="page"
        :page-size="20"
        :total="total"
        layout="prev, pager, next"
        @current-change="handlePageChange"
      />
    </el-card>

    <!-- 积分调整对话框 -->
    <el-dialog v-model="ratingDialogVisible" title="调整用户积分" width="400px">
      <el-form :model="ratingForm" label-width="80px">
        <el-form-item label="用户">
          <span>{{ ratingForm.name }}</span>
        </el-form-item>
        <el-form-item label="当前积分">
          <span>{{ ratingForm.currentRating }}</span>
        </el-form-item>
        <el-form-item label="调整值">
          <el-input-number v-model="ratingForm.adjustment" :min="-1000" :max="1000" />
          <span style="margin-left: 10px; color: #999">正数增加，负数减少</span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="ratingForm.remark" placeholder="调整原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ratingDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRating" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { formatDateTime } from '../utils/format'

const loading = ref(false)
const users = ref([])
const page = ref(1)
const total = ref(0)
const searchKeyword = ref('')
const submitting = ref(false)

const ratingDialogVisible = ref(false)

const ratingForm = ref({ id: null, name: '', currentRating: 0, adjustment: 0, remark: '' })

const typeLabels = {
  student: '在校生',
  graduate: '毕业生',
  teacher: '老师',
  staff: '教职工'
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadUsers = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      limit: 20,
      user_id: getUserId()
    })
    if (searchKeyword.value) {
      params.append('keyword', searchKeyword.value)
    }

    const res = await fetch(`/api/admin/users?${params}`)
    const data = await res.json()
    if (data.success) {
      users.value = data.data || []
      total.value = data.total || users.value.length
    }
  } catch (error) {
    console.error('加载用户失败:', error)
    ElMessage.error('加载用户失败')
  } finally {
    loading.value = false
  }
}

const searchUsers = () => {
  page.value = 1
  loadUsers()
}

const handlePageChange = (newPage) => {
  page.value = newPage
  loadUsers()
}

const adjustRating = (row) => {
  ratingForm.value = {
    id: row.id,
    name: row.name,
    currentRating: row.rating || 0,
    adjustment: 0,
    remark: ''
  }
  ratingDialogVisible.value = true
}

const submitRating = async () => {
  if (ratingForm.value.adjustment === 0) {
    ElMessage.warning('请输入调整值')
    return
  }

  submitting.value = true
  try {
    const res = await fetch(`/api/admin/users/${ratingForm.value.id}/adjust-rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adjustment: ratingForm.value.adjustment,
        remark: ratingForm.value.remark,
        user_id: getUserId()
      })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('积分调整成功')
      ratingDialogVisible.value = false
      loadUsers()
    } else {
      ElMessage.error(data.message || '调整失败')
    }
  } catch (error) {
    console.error('调整积分失败:', error)
    ElMessage.error('调整失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadUsers()
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
.search-bar {
  margin-bottom: 20px;
}
.pagination {
  margin-top: 20px;
  justify-content: center;
}

@media screen and (max-width: 768px) {
  .page {
    padding: 12px;
  }
  .page-header h2 {
    font-size: 18px;
  }
  .search-bar :deep(.el-input) {
    width: 100% !important;
  }
  :deep(.el-table) {
    font-size: 12px;
  }
  :deep(.el-button--small) {
    padding: 5px 8px;
    font-size: 12px;
  }
}
</style>
