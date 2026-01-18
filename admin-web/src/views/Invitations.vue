<template>
  <div class="page">
    <div class="page-header">
      <h2>邀请管理</h2>
      <div class="header-actions">
        <el-select v-model="selectedEventId" placeholder="选择赛事" clearable @change="loadInvitations">
          <el-option
            v-for="event in events"
            :key="event.id"
            :label="event.title"
            :value="event.id"
          />
        </el-select>
        <el-select v-model="selectedType" placeholder="邀请类型" clearable @change="loadInvitations">
          <el-option label="双打邀请" value="doubles" />
          <el-option label="团体赛邀请" value="team" />
        </el-select>
        <el-select v-model="selectedStatus" placeholder="状态" clearable @change="loadInvitations">
          <el-option label="待处理" value="pending" />
          <el-option label="已接受" value="accepted" />
          <el-option label="已拒绝" value="rejected" />
          <el-option label="已过期" value="expired" />
        </el-select>
      </div>
    </div>

    <el-card>
      <el-tabs v-model="activeTab" @tab-change="loadInvitations">
        <el-tab-pane label="待处理" name="pending" />
        <el-tab-pane label="已接受" name="accepted" />
        <el-tab-pane label="已拒绝" name="rejected" />
        <el-tab-pane label="全部" name="all" />
      </el-tabs>

      <el-table :data="invitations" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="赛事" min-width="150">
          <template #default="{ row }">
            <div>
              <div>{{ row.event_title }}</div>
              <el-tag size="small" :type="row.type === 'doubles' ? 'primary' : 'success'">
                {{ row.type === 'doubles' ? '双打' : '团体' }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="邀请人" min-width="140">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-avatar :size="28" :src="row.inviter_avatar" />
              <div>
                <div>{{ row.inviter_name }}</div>
                <div style="font-size: 12px; color: #999;">{{ row.inviter_phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="被邀请人" min-width="140">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-avatar :size="28" :src="row.invitee_avatar" />
              <div>
                <div>{{ row.invitee_name }}</div>
                <div style="font-size: 12px; color: #999;">{{ row.invitee_phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="备注" min-width="120">
          <template #default="{ row }">
            {{ row.message || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTypes[row.status]">
              {{ statusLabels[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button size="small" type="success" @click="handleInvitation(row, 'accept')">代为接受</el-button>
              <el-button size="small" type="danger" @click="handleInvitation(row, 'reject')">代为拒绝</el-button>
            </template>
            <template v-else>
              <span style="color: #999; font-size: 12px;">
                {{ row.status === 'accepted' ? '已接受' : row.status === 'rejected' ? '已拒绝' : '已过期' }}
              </span>
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
          @current-change="loadInvitations"
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
const invitations = ref([])
const events = ref([])
const selectedEventId = ref(null)
const selectedType = ref(null)
const selectedStatus = ref(null)
const activeTab = ref('pending')
const page = ref(1)
const total = ref(0)

const statusLabels = {
  pending: '待处理',
  accepted: '已接受',
  rejected: '已拒绝',
  expired: '已过期'
}

const statusTypes = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  expired: 'info'
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadEvents = async () => {
  try {
    const res = await fetch(`/api/admin/events?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      // 只加载双打和团体赛事
      events.value = (data.data || []).filter(e => e.event_type === 'doubles' || e.event_type === 'team')
    }
  } catch (error) {
    console.error('加载赛事列表失败:', error)
  }
}

const loadInvitations = async () => {
  loading.value = true
  try {
    let url = `/api/admin/invitations?user_id=${getUserId()}&page=${page.value}`

    if (selectedEventId.value) {
      url += `&event_id=${selectedEventId.value}`
    }
    if (selectedType.value) {
      url += `&type=${selectedType.value}`
    }
    if (activeTab.value !== 'all') {
      url += `&status=${activeTab.value}`
    } else if (selectedStatus.value) {
      url += `&status=${selectedStatus.value}`
    }

    const res = await fetch(url)
    const data = await res.json()
    if (data.success) {
      invitations.value = data.data || []
      total.value = data.total || 0
    }
  } catch (error) {
    console.error('加载邀请列表失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const handleInvitation = async (row, action) => {
  const actionLabel = action === 'accept' ? '接受' : '拒绝'
  try {
    await ElMessageBox.confirm(
      `确认代为${actionLabel}这个邀请吗？这将以被邀请人的身份${actionLabel}邀请。`,
      '提示'
    )

    const res = await fetch(`/api/admin/invitations/${row.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(`已${actionLabel}`)
      loadInvitations()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error(`${actionLabel}邀请失败:`, error)
      ElMessage.error('操作失败')
    }
  }
}

onMounted(() => {
  loadEvents()
  loadInvitations()
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
  gap: 10px;
}
.page-header h2 {
  margin: 0;
}
.header-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
