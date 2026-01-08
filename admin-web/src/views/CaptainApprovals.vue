<template>
  <div class="page">
    <div class="page-header">
      <h2>领队申请审批</h2>
    </div>

    <el-card>
      <el-tabs v-model="activeTab" @tab-change="loadApplications">
        <el-tab-pane label="待审批" name="pending" />
        <el-tab-pane label="已通过" name="approved" />
        <el-tab-pane label="已拒绝" name="rejected" />
      </el-tabs>

      <el-table :data="applications" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="event_title" label="赛事" min-width="150" />
        <el-table-column prop="school_name" label="学校" width="120" />
        <el-table-column label="申请人" width="120">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-avatar :size="24" :src="row.applicant_avatar" />
              <span>{{ row.applicant_name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="applicant_phone" label="手机号" width="120" />
        <el-table-column prop="reason" label="申请理由" min-width="150">
          <template #default="{ row }">
            {{ row.reason || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="statusTypes[row.status]">
              {{ statusLabels[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button size="small" type="success" @click="approveApplication(row)">通过</el-button>
              <el-button size="small" type="danger" @click="rejectApplication(row)">拒绝</el-button>
            </template>
            <template v-else-if="row.status === 'approved'">
              <span style="color: #67c23a">已通过</span>
            </template>
            <template v-else>
              <el-tooltip :content="row.reject_reason || '无'" placement="top">
                <span style="color: #f56c6c">已拒绝</span>
              </el-tooltip>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 20px; text-align: right;">
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadApplications"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '../utils/format'

const loading = ref(false)
const applications = ref([])
const activeTab = ref('pending')
const page = ref(1)
const total = ref(0)

const statusLabels = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝'
}

const statusTypes = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger'
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadApplications = async () => {
  loading.value = true
  try {
    const res = await fetch(`/api/admin/captain-applications?user_id=${getUserId()}&status=${activeTab.value}&page=${page.value}`)
    const data = await res.json()
    if (data.success) {
      applications.value = data.data || []
      total.value = data.total || 0
    }
  } catch (error) {
    console.error('加载申请列表失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const approveApplication = async (row) => {
  try {
    await ElMessageBox.confirm(`确认批准 ${row.applicant_name} 成为赛事"${row.event_title}"的领队吗？`, '提示')

    const res = await fetch(`/api/admin/captain-applications/${row.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('已批准')
      loadApplications()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('审批失败:', error)
      ElMessage.error('操作失败')
    }
  }
}

const rejectApplication = async (row) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入拒绝理由（可选）', '拒绝申请', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPlaceholder: '请输入拒绝理由'
    })

    const res = await fetch(`/api/admin/captain-applications/${row.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: getUserId(), reject_reason: value })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('已拒绝')
      loadApplications()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('审批失败:', error)
    }
  }
}

onMounted(() => {
  loadApplications()
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
