<template>
  <div class="page">
    <div class="page-header">
      <h2>赛事管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        创建赛事
      </el-button>
    </div>

    <el-card>
      <el-table :data="events" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="赛事名称" min-width="150" />
        <el-table-column prop="event_type" label="类型" width="100">
          <template #default="{ row }">
            {{ typeLabels[row.event_type] || row.event_type }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTypes[row.status]">
              {{ statusLabels[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.event_start) }}
          </template>
        </el-table-column>
        <el-table-column prop="location" label="地点" width="120" />
        <el-table-column prop="participant_count" label="报名人数" width="100" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editEvent(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteEvent(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑赛事' : '创建赛事'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="赛事名称" required>
          <el-input v-model="form.title" placeholder="请输入赛事名称" />
        </el-form-item>
        <el-form-item label="赛事类型" required>
          <el-select v-model="form.event_type" placeholder="请选择类型">
            <el-option label="单打" value="singles" />
            <el-option label="双打" value="doubles" />
            <el-option label="团体" value="team" />
          </el-select>
        </el-form-item>
        <el-form-item label="赛制" required>
          <el-select v-model="form.event_format" placeholder="请选择赛制">
            <el-option label="淘汰赛" value="knockout" />
            <el-option label="循环赛" value="round_robin" />
            <el-option label="小组+淘汰" value="group_knockout" />
          </el-select>
        </el-form-item>
        <el-form-item label="几局几胜">
          <div style="display: flex; align-items: center; gap: 10px;">
            <el-input-number v-model="form.best_of" :min="1" :max="21" />
            <span>局</span>
            <el-input-number v-model="form.games_to_win" :min="1" :max="11" />
            <span>胜</span>
          </div>
        </el-form-item>
        <el-form-item label="计入积分">
          <el-switch v-model="form.counts_for_ranking" />
          <span style="margin-left: 10px; color: #909399">开启后比赛结果将计入用户积分</span>
        </el-form-item>
        <el-form-item label="开始时间" required>
          <el-date-picker
            v-model="form.event_start"
            type="datetime"
            placeholder="选择日期时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="地点">
          <el-input v-model="form.location" placeholder="请输入比赛地点" />
        </el-form-item>
        <el-form-item label="最大人数">
          <el-input-number v-model="form.max_participants" :min="2" :max="256" />
        </el-form-item>
        <el-form-item label="报名截止">
          <el-date-picker
            v-model="form.registration_end"
            type="datetime"
            placeholder="选择报名截止时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="赛事说明">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            placeholder="请输入赛事说明"
          />
        </el-form-item>
        <el-form-item label="说明图片">
          <el-upload
            class="desc-image-uploader"
            action="/api/upload/file"
            :show-file-list="false"
            :on-success="onImageUploadSuccess"
            accept="image/*"
            name="file"
          >
            <img v-if="form.description_image" :src="form.description_image" class="desc-image-preview" />
            <div v-else class="desc-image-placeholder">
              <el-icon><Plus /></el-icon>
              <span>上传图片</span>
            </div>
          </el-upload>
          <el-button v-if="form.description_image" size="small" type="danger" style="margin-left: 10px" @click="form.description_image = ''">删除图片</el-button>
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
import { formatDateTime } from '../utils/format'

const loading = ref(false)
const events = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)

const form = ref({
  title: '',
  event_type: 'singles',
  event_format: 'knockout',
  best_of: 5,
  games_to_win: 3,
  counts_for_ranking: true,
  event_start: '',
  location: '',
  max_participants: 32,
  registration_end: '',
  description: '',
  description_image: ''
})

const onImageUploadSuccess = (response) => {
  if (response.success) {
    form.value.description_image = response.data.url
    ElMessage.success('图片上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

const typeLabels = {
  singles: '单打',
  doubles: '双打',
  team: '团体'
}

const statusLabels = {
  draft: '草稿',
  registration: '报名中',
  ongoing: '进行中',
  finished: '已结束'
}

const statusTypes = {
  draft: 'info',
  registration: 'warning',
  ongoing: 'success',
  finished: ''
}

const getAdminUser = () => {
  return JSON.parse(localStorage.getItem('adminUser') || '{}')
}

const loadEvents = async () => {
  loading.value = true
  try {
    const user = getAdminUser()
    const res = await fetch(`/api/admin/events?user_id=${user.id}`)
    const data = await res.json()
    if (data.success) {
      events.value = data.data || []
    }
  } catch (error) {
    console.error('加载赛事失败:', error)
    ElMessage.error('加载赛事失败')
  } finally {
    loading.value = false
  }
}

const showCreateDialog = () => {
  isEdit.value = false
  form.value = {
    title: '',
    event_type: 'singles',
    event_format: 'knockout',
    best_of: 5,
    games_to_win: 3,
    counts_for_ranking: true,
    event_start: '',
    location: '',
    max_participants: 32,
    registration_end: '',
    description: '',
    description_image: ''
  }
  dialogVisible.value = true
}

const editEvent = (row) => {
  isEdit.value = true
  form.value = { ...row }
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.value.title) {
    ElMessage.warning('请输入赛事名称')
    return
  }
  if (!form.value.event_start) {
    ElMessage.warning('请选择开始时间')
    return
  }

  submitting.value = true
  try {
    const user = getAdminUser()
    const url = isEdit.value
      ? `/api/admin/events/${form.value.id}`
      : '/api/admin/events'
    const method = isEdit.value ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form.value,
        user_id: user.id,
        school_id: user.school_id || null
      })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
      dialogVisible.value = false
      loadEvents()
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

const deleteEvent = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这个赛事吗？', '提示', {
      type: 'warning'
    })

    const user = getAdminUser()
    const res = await fetch(`/api/admin/events/${row.id}?user_id=${user.id}`, {
      method: 'DELETE'
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('删除成功')
      loadEvents()
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

.desc-image-uploader {
  display: inline-block;
}
.desc-image-preview {
  width: 200px;
  height: 112px;
  object-fit: cover;
  border-radius: 4px;
}
.desc-image-placeholder {
  width: 200px;
  height: 112px;
  border: 1px dashed #d9d9d9;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8c939d;
  background: #fafafa;
  cursor: pointer;
}
.desc-image-placeholder:hover {
  border-color: #409eff;
}
.desc-image-placeholder .el-icon {
  font-size: 28px;
  margin-bottom: 8px;
}
</style>
