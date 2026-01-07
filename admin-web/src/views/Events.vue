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
            <el-input-number v-model="form.best_of" :min="1" :max="21" placeholder="局数" />
            <span>局</span>
            <el-input-number v-model="form.games_to_win" :min="1" :max="11" placeholder="胜数" />
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
          <div class="rich-editor">
            <div class="toolbar">
              <el-button-group>
                <el-button size="small" @click="execCommand('bold')"><strong>B</strong></el-button>
                <el-button size="small" @click="execCommand('italic')"><em>I</em></el-button>
                <el-button size="small" @click="execCommand('underline')"><u>U</u></el-button>
              </el-button-group>
              <el-button-group style="margin-left: 8px">
                <el-button size="small" @click="execCommand('insertUnorderedList')">列表</el-button>
                <el-button size="small" @click="insertImage">图片</el-button>
              </el-button-group>
            </div>
            <div
              ref="editorRef"
              class="editor-content"
              contenteditable="true"
              @input="onEditorInput"
              v-html="form.description"
            ></div>
          </div>
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
const editorRef = ref(null)

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
  description: ''
})

// 富文本编辑器函数
const execCommand = (command) => {
  document.execCommand(command, false, null)
  editorRef.value?.focus()
}

const insertImage = () => {
  ElMessageBox.prompt('请输入图片URL', '插入图片', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPlaceholder: 'https://...'
  }).then(({ value }) => {
    if (value) {
      document.execCommand('insertImage', false, value)
    }
  }).catch(() => {})
}

const onEditorInput = (e) => {
  form.value.description = e.target.innerHTML
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

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadEvents = async () => {
  loading.value = true
  try {
    const res = await fetch(`/api/admin/events?user_id=${getUserId()}`)
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
    description: ''
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

  submitting.value = true
  try {
    const url = isEdit.value
      ? `/api/admin/events/${form.value.id}`
      : '/api/admin/events'
    const method = isEdit.value ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form.value,
        user_id: getUserId()
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

    const res = await fetch(`/api/admin/events/${row.id}?user_id=${getUserId()}`, {
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

.rich-editor {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  overflow: hidden;
}
.rich-editor .toolbar {
  padding: 8px;
  background: #f5f7fa;
  border-bottom: 1px solid #dcdfe6;
}
.rich-editor .editor-content {
  min-height: 150px;
  padding: 12px;
  outline: none;
  line-height: 1.6;
}
.rich-editor .editor-content:empty:before {
  content: '请输入赛事说明...';
  color: #c0c4cc;
}
.rich-editor .editor-content img {
  max-width: 100%;
  height: auto;
}
</style>
