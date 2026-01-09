<template>
  <div class="page">
    <div class="page-header">
      <h2>学习资料管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        添加资料
      </el-button>
    </div>

    <el-card>
      <el-tabs v-model="activeTab" @tab-change="loadMaterials">
        <el-tab-pane label="教学视频" name="video" />
        <el-tab-pane label="PDF文档" name="document" />
        <el-tab-pane label="PPT课件" name="ppt" />
      </el-tabs>

      <el-table :data="materials" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="typeColors[row.type]">{{ typeLabels[row.type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="文件" min-width="200">
          <template #default="{ row }">
            <el-link :href="getFullUrl(row.url)" target="_blank" type="primary">
              {{ row.original_name || '查看文件' }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column prop="view_count" label="浏览量" width="80" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '启用' : '禁用' }}
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
            <el-button size="small" @click="editMaterial(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteMaterial(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑资料' : '添加资料'" width="500px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="form.title" placeholder="请输入资料标题" />
        </el-form-item>
        <el-form-item label="类型" required>
          <el-radio-group v-model="form.type">
            <el-radio value="video">教学视频</el-radio>
            <el-radio value="document">PDF文档</el-radio>
            <el-radio value="ppt">PPT课件</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="上传文件" required>
          <el-upload
            ref="uploadRef"
            class="upload-demo"
            :action="uploadUrl"
            :limit="1"
            :on-success="onUploadSuccess"
            :on-error="onUploadError"
            :before-upload="beforeUpload"
            :file-list="fileList"
            :auto-upload="true"
            :accept="acceptTypes[form.type]"
            name="file"
          >
            <el-button type="primary">选择文件</el-button>
            <template #tip>
              <div class="el-upload__tip">
                {{ uploadTips[form.type] }}，最大100MB
              </div>
            </template>
          </el-upload>
          <div v-if="form.url && !fileList.length" class="current-file">
            当前文件：<el-link :href="getFullUrl(form.url)" target="_blank" type="primary">{{ form.original_name || '查看' }}</el-link>
          </div>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入资料描述（可选）" />
        </el-form-item>
        <el-form-item label="视频封面" v-if="form.type === 'video'">
          <el-upload
            class="cover-uploader"
            :action="uploadUrl"
            :show-file-list="false"
            :on-success="onCoverUploadSuccess"
            accept="image/*"
            name="file"
          >
            <img v-if="form.cover_url" :src="getFullUrl(form.cover_url)" class="cover-preview" />
            <div v-else class="cover-placeholder">
              <el-icon><Plus /></el-icon>
              <span>上传封面</span>
            </div>
          </el-upload>
          <div class="cover-tip">建议尺寸 16:9，用于视频列表展示</div>
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
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '../utils/format'

const loading = ref(false)
const materials = ref([])
const activeTab = ref('video')
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const uploadRef = ref(null)
const fileList = ref([])

const form = ref({
  title: '',
  type: 'video',
  url: '',
  original_name: '',
  description: '',
  cover_url: ''
})

const typeLabels = { video: '视频', document: 'PDF', ppt: 'PPT' }
const typeColors = { video: 'danger', document: '', ppt: 'warning' }

const acceptTypes = {
  video: 'video/*',
  document: 'application/pdf',
  ppt: '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation'
}

const uploadTips = {
  video: '支持 MP4、AVI 等视频格式',
  document: '仅支持 PDF 文件',
  ppt: '支持 PPT、PPTX 文件'
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const uploadUrl = computed(() => '/api/upload/file')

const getFullUrl = (url) => {
  if (!url) return ''
  if (url.startsWith('http')) return url
  // 相对路径需要拼接完整URL
  return window.location.origin + url
}

// 将完整URL转回相对路径（用于保存到数据库）
const toRelativePath = (url) => {
  if (!url) return url
  // 如果是完整URL，提取相对路径
  if (url.startsWith('http')) {
    const match = url.match(/\/uploads\/[^?#]+/)
    if (match) return match[0]
  }
  return url
}

const beforeUpload = (file) => {
  const isLt100M = file.size / 1024 / 1024 < 100
  if (!isLt100M) {
    ElMessage.error('文件大小不能超过 100MB')
    return false
  }

  // 检查文件类型
  if (form.value.type === 'video') {
    if (!file.type.startsWith('video/')) {
      ElMessage.error('请上传视频文件')
      return false
    }
  } else if (form.value.type === 'document') {
    if (file.type !== 'application/pdf') {
      ElMessage.error('请上传 PDF 文件')
      return false
    }
  } else if (form.value.type === 'ppt') {
    const validTypes = [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
    const isPPT = validTypes.includes(file.type) ||
                  file.name.endsWith('.ppt') ||
                  file.name.endsWith('.pptx')
    if (!isPPT) {
      ElMessage.error('请上传 PPT 或 PPTX 文件')
      return false
    }
  }

  return true
}

const onUploadSuccess = (response) => {
  if (response.success) {
    form.value.url = response.data.url
    form.value.original_name = response.data.originalName
    ElMessage.success('文件上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

const onUploadError = () => {
  ElMessage.error('文件上传失败')
}

const onCoverUploadSuccess = (response) => {
  if (response.success) {
    form.value.cover_url = response.data.url
    ElMessage.success('封面上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

const loadMaterials = async () => {
  loading.value = true
  try {
    const res = await fetch(`/api/admin/learning?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      const all = data.data || []
      materials.value = all.filter(m => m.type === activeTab.value)
    }
  } catch (error) {
    console.error('加载学习资料失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const showCreateDialog = () => {
  isEdit.value = false
  form.value = { title: '', type: activeTab.value, url: '', original_name: '', description: '', cover_url: '' }
  fileList.value = []
  dialogVisible.value = true
}

const editMaterial = (row) => {
  isEdit.value = true
  form.value = { ...row }
  fileList.value = []
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.value.title) {
    ElMessage.warning('请填写标题')
    return
  }
  if (!form.value.url) {
    ElMessage.warning('请上传文件')
    return
  }

  submitting.value = true
  try {
    const url = isEdit.value
      ? `/api/admin/learning/${form.value.id}`
      : '/api/admin/learning'
    const method = isEdit.value ? 'PUT' : 'POST'

    // 保存时将完整URL转回相对路径
    const saveData = {
      ...form.value,
      url: toRelativePath(form.value.url),
      cover_url: toRelativePath(form.value.cover_url),
      user_id: getUserId()
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saveData)
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '添加成功')
      dialogVisible.value = false
      loadMaterials()
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

const deleteMaterial = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这个资料吗？', '提示', { type: 'warning' })

    const res = await fetch(`/api/admin/learning/${row.id}?user_id=${getUserId()}`, { method: 'DELETE' })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('删除成功')
      loadMaterials()
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
  loadMaterials()
})
</script>

<style scoped>
.page { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }
.current-file { margin-top: 10px; color: #666; }
.upload-demo { width: 100%; }

.cover-uploader {
  width: 200px;
  height: 112px;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
}
.cover-uploader:hover {
  border-color: #409eff;
}
.cover-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #8c939d;
  background: #fafafa;
}
.cover-placeholder .el-icon {
  font-size: 28px;
  margin-bottom: 8px;
}
.cover-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}
</style>
