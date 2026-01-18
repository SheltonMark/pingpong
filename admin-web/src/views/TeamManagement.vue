<template>
  <div class="page">
    <div class="page-header">
      <h2>团体赛队伍管理</h2>
      <div class="header-actions">
        <el-select v-model="selectedEventId" placeholder="选择赛事" clearable @change="loadTeams">
          <el-option
            v-for="event in teamEvents"
            :key="event.id"
            :label="event.title"
            :value="event.id"
          />
        </el-select>
      </div>
    </div>

    <el-card>
      <el-table :data="teams" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="team_name" label="队伍名称" min-width="120" />
        <el-table-column label="领队" min-width="150">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <el-avatar :size="32" :src="row.captain_avatar" />
              <div>
                <div>{{ row.captain_name }}</div>
                <div style="font-size: 12px; color: #999;">{{ row.captain_phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="队员" min-width="200">
          <template #default="{ row }">
            <div v-if="row.members && row.members.length > 0" class="members-list">
              <el-tag
                v-for="member in row.members"
                :key="member.id"
                size="small"
                :type="member.status === 'confirmed' ? 'success' : 'warning'"
                style="margin: 2px;"
              >
                {{ member.name }}
                <span v-if="member.status !== 'confirmed'">(待确认)</span>
              </el-tag>
            </div>
            <span v-else style="color: #999;">暂无队员</span>
          </template>
        </el-table-column>
        <el-table-column prop="member_count" label="人数" width="80">
          <template #default="{ row }">
            {{ row.confirmed_count || 0 }}/{{ row.total_slots || 5 }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="teamStatusTypes[row.status]">
              {{ teamStatusLabels[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="viewTeamDetail(row)">详情</el-button>
            <el-button
              v-if="row.status !== 'cancelled'"
              size="small"
              type="danger"
              @click="cancelTeam(row)"
            >解散</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 20px; text-align: right;">
        <el-pagination
          v-model:current-page="page"
          :page-size="20"
          :total="total"
          layout="total, prev, pager, next"
          @current-change="loadTeams"
        />
      </div>
    </el-card>

    <div v-if="!selectedEventId" class="empty-state">
      <el-empty description="请选择一个团体赛事查看队伍情况" />
    </div>

    <!-- 队伍详情弹窗 -->
    <el-dialog v-model="showDetailDialog" title="队伍详情" width="600px">
      <div v-if="currentTeam" class="team-detail">
        <div class="detail-section">
          <h4>基本信息</h4>
          <el-descriptions :column="2" border>
            <el-descriptions-item label="队伍名称">{{ currentTeam.team_name }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="teamStatusTypes[currentTeam.status]">
                {{ teamStatusLabels[currentTeam.status] }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="领队">{{ currentTeam.captain_name }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ currentTeam.captain_phone }}</el-descriptions-item>
            <el-descriptions-item label="创建时间" :span="2">{{ formatDateTime(currentTeam.created_at) }}</el-descriptions-item>
          </el-descriptions>
        </div>

        <div class="detail-section">
          <h4>队员列表</h4>
          <el-table :data="currentTeam.members || []" stripe size="small">
            <el-table-column prop="name" label="姓名" />
            <el-table-column prop="phone" label="电话" />
            <el-table-column prop="position" label="位置" />
            <el-table-column prop="status" label="状态">
              <template #default="{ row }">
                <el-tag :type="row.status === 'confirmed' ? 'success' : 'warning'" size="small">
                  {{ row.status === 'confirmed' ? '已确认' : '待确认' }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '../utils/format'

const loading = ref(false)
const teams = ref([])
const teamEvents = ref([])
const selectedEventId = ref(null)
const page = ref(1)
const total = ref(0)
const showDetailDialog = ref(false)
const currentTeam = ref(null)

const teamStatusLabels = {
  pending: '组队中',
  confirmed: '已确认',
  cancelled: '已解散'
}

const teamStatusTypes = {
  pending: 'warning',
  confirmed: 'success',
  cancelled: 'danger'
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadTeamEvents = async () => {
  try {
    const res = await fetch(`/api/admin/events?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      teamEvents.value = (data.data || []).filter(e => e.event_type === 'team')
    }
  } catch (error) {
    console.error('加载团体赛事失败:', error)
  }
}

const loadTeams = async () => {
  if (!selectedEventId.value) {
    teams.value = []
    total.value = 0
    return
  }

  loading.value = true
  try {
    const res = await fetch(`/api/admin/teams?user_id=${getUserId()}&event_id=${selectedEventId.value}&page=${page.value}`)
    const data = await res.json()
    if (data.success) {
      teams.value = data.data || []
      total.value = data.total || 0
    }
  } catch (error) {
    console.error('加载队伍列表失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const viewTeamDetail = async (row) => {
  try {
    const res = await fetch(`/api/admin/teams/${row.id}?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      currentTeam.value = data.data
      showDetailDialog.value = true
    } else {
      ElMessage.error(data.message || '获取详情失败')
    }
  } catch (error) {
    console.error('获取队伍详情失败:', error)
    ElMessage.error('获取详情失败')
  }
}

const cancelTeam = async (row) => {
  try {
    await ElMessageBox.confirm(`确认解散队伍"${row.team_name}"吗？队伍中所有成员的报名都将被取消。`, '警告', {
      type: 'warning'
    })

    const res = await fetch(`/api/admin/teams/${row.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('队伍已解散')
      loadTeams()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('解散队伍失败:', error)
      ElMessage.error('操作失败')
    }
  }
}

onMounted(() => {
  loadTeamEvents()
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
.members-list {
  display: flex;
  flex-wrap: wrap;
}
.team-detail .detail-section {
  margin-bottom: 20px;
}
.team-detail .detail-section h4 {
  margin: 0 0 10px 0;
  color: #333;
}
</style>
