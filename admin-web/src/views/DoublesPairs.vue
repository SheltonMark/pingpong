<template>
  <div class="page">
    <div class="page-header">
      <h2>双打配对管理</h2>
      <div class="header-actions">
        <el-select v-model="selectedEventId" placeholder="选择赛事" clearable @change="loadPairs">
          <el-option
            v-for="event in doublesEvents"
            :key="event.id"
            :label="event.title"
            :value="event.id"
          />
        </el-select>
      </div>
    </div>

    <el-card>
      <el-table :data="pairs" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="选手1" min-width="150">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-avatar :size="32" :src="row.player1_avatar" />
              <div>
                <div>{{ row.player1_name }}</div>
                <div style="font-size: 12px; color: #999;">{{ row.player1_phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="选手2" min-width="150">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-avatar :size="32" :src="row.player2_avatar" />
              <div>
                <div>{{ row.player2_name }}</div>
                <div style="font-size: 12px; color: #999;">{{ row.player2_phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="team_name" label="组合名称" width="120">
          <template #default="{ row }">
            {{ row.team_name || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTypes[row.status]">
              {{ statusLabels[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="报名时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              size="small"
              type="danger"
              @click="cancelPair(row)"
            >取消配对</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 20px; text-align: right;">
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadPairs"
        />
      </div>
    </el-card>

    <div v-if="!selectedEventId" class="empty-state">
      <el-empty description="请选择一个双打赛事查看配对情况" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '../utils/format'

const loading = ref(false)
const pairs = ref([])
const doublesEvents = ref([])
const selectedEventId = ref(null)
const page = ref(1)
const total = ref(0)

const statusLabels = {
  pending: '待确认',
  confirmed: '已确认',
  waiting_partner: '待配对',
  cancelled: '已取消'
}

const statusTypes = {
  pending: 'warning',
  confirmed: 'success',
  waiting_partner: 'info',
  cancelled: 'danger'
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadDoublesEvents = async () => {
  try {
    const res = await fetch(`/api/admin/events?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      doublesEvents.value = (data.data || []).filter(e => e.event_type === 'doubles')
    }
  } catch (error) {
    console.error('加载双打赛事失败:', error)
  }
}

const loadPairs = async () => {
  if (!selectedEventId.value) {
    pairs.value = []
    total.value = 0
    return
  }

  loading.value = true
  try {
    const res = await fetch(`/api/admin/doubles-pairs?user_id=${getUserId()}&event_id=${selectedEventId.value}&page=${page.value}`)
    const data = await res.json()
    if (data.success) {
      pairs.value = data.data || []
      total.value = data.total || 0
    }
  } catch (error) {
    console.error('加载双打配对失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const cancelPair = async (row) => {
  try {
    await ElMessageBox.confirm(`确认取消 ${row.player1_name} 和 ${row.player2_name} 的配对吗？`, '提示')

    const res = await fetch(`/api/admin/doubles-pairs/${row.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('已取消配对')
      loadPairs()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('取消配对失败:', error)
      ElMessage.error('操作失败')
    }
  }
}

onMounted(() => {
  loadDoublesEvents()
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
.header-actions {
  display: flex;
  gap: 10px;
}
.empty-state {
  margin-top: 40px;
}
</style>
