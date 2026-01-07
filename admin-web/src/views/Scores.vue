<template>
  <div class="page">
    <div class="page-header">
      <h2>成绩审核</h2>
    </div>

    <el-card>
      <el-tabs v-model="activeTab" @tab-change="loadMatches">
        <el-tab-pane label="待审核" name="pending" />
        <el-tab-pane label="已审核" name="confirmed" />
        <el-tab-pane label="有争议" name="disputed" />
      </el-tabs>

      <el-table :data="matches" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="event_title" label="赛事" min-width="120" />
        <el-table-column prop="round_name" label="轮次" width="80" />
        <el-table-column label="比赛双方" min-width="200">
          <template #default="{ row }">
            <span :class="{ winner: row.winner_id === row.player1_id }">
              {{ row.player1_name }}
            </span>
            <span style="margin: 0 8px">vs</span>
            <span :class="{ winner: row.winner_id === row.player2_id }">
              {{ row.player2_name }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="score" label="比分" width="100" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTypes[row.status]">
              {{ statusLabels[row.status] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="录入时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending'">
              <el-button size="small" type="success" @click="confirmMatch(row)">确认</el-button>
              <el-button size="small" type="warning" @click="disputeMatch(row)">标记争议</el-button>
            </template>
            <template v-else-if="row.status === 'disputed'">
              <el-button size="small" @click="editScore(row)">修改比分</el-button>
              <el-button size="small" type="success" @click="confirmMatch(row)">确认</el-button>
            </template>
            <template v-else>
              <el-button size="small" disabled>已审核</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 修改比分对话框 -->
    <el-dialog v-model="scoreDialogVisible" title="修改比分" width="400px">
      <el-form :model="scoreForm" label-width="80px">
        <el-form-item label="比赛">
          <span>{{ scoreForm.player1_name }} vs {{ scoreForm.player2_name }}</span>
        </el-form-item>
        <el-form-item label="比分">
          <el-input v-model="scoreForm.score" placeholder="如: 3:2" />
        </el-form-item>
        <el-form-item label="胜者">
          <el-radio-group v-model="scoreForm.winner_id">
            <el-radio :label="scoreForm.player1_id">{{ scoreForm.player1_name }}</el-radio>
            <el-radio :label="scoreForm.player2_id">{{ scoreForm.player2_name }}</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="scoreDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitScore" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '../utils/format'

const loading = ref(false)
const matches = ref([])
const activeTab = ref('pending')
const submitting = ref(false)
const scoreDialogVisible = ref(false)

const scoreForm = ref({
  id: null,
  player1_id: null,
  player1_name: '',
  player2_id: null,
  player2_name: '',
  score: '',
  winner_id: null
})

const statusLabels = {
  pending: '待审核',
  confirmed: '已确认',
  disputed: '有争议'
}

const statusTypes = {
  pending: 'warning',
  confirmed: 'success',
  disputed: 'danger'
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadMatches = async () => {
  loading.value = true
  try {
    const res = await fetch(`/api/admin/matches?user_id=${getUserId()}&status=${activeTab.value}`)
    const data = await res.json()
    if (data.success) {
      matches.value = data.data || []
    }
  } catch (error) {
    console.error('加载比赛失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const confirmMatch = async (row) => {
  try {
    await ElMessageBox.confirm('确认这场比赛的成绩吗？', '提示')

    const res = await fetch(`/api/admin/matches/${row.id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('成绩已确认')
      loadMatches()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('确认失败:', error)
      ElMessage.error('操作失败')
    }
  }
}

const disputeMatch = async (row) => {
  try {
    const { value } = await ElMessageBox.prompt('请输入争议原因', '标记争议', {
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })

    const res = await fetch(`/api/admin/matches/${row.id}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: value, user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('已标记争议')
      loadMatches()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('标记失败:', error)
    }
  }
}

const editScore = (row) => {
  scoreForm.value = {
    id: row.id,
    player1_id: row.player1_id,
    player1_name: row.player1_name,
    player2_id: row.player2_id,
    player2_name: row.player2_name,
    score: row.score,
    winner_id: row.winner_id
  }
  scoreDialogVisible.value = true
}

const submitScore = async () => {
  if (!scoreForm.value.score || !scoreForm.value.winner_id) {
    ElMessage.warning('请填写完整信息')
    return
  }

  submitting.value = true
  try {
    const res = await fetch(`/api/admin/matches/${scoreForm.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        score: scoreForm.value.score,
        winner_id: scoreForm.value.winner_id,
        user_id: getUserId()
      })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('比分已更新')
      scoreDialogVisible.value = false
      loadMatches()
    } else {
      ElMessage.error(data.message || '更新失败')
    }
  } catch (error) {
    console.error('更新失败:', error)
    ElMessage.error('更新失败')
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadMatches()
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
.winner {
  color: #67c23a;
  font-weight: bold;
}
</style>
