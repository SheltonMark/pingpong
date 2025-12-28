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
        <el-tab-pane label="视频" name="video" />
        <el-tab-pane label="PPT" name="ppt" />
        <el-tab-pane label="文档" name="document" />
      </el-tabs>

      <el-table :data="materials" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column prop="type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="typeColors[row.type]">{{ typeLabels[row.type] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="url" label="链接" min-width="200">
          <template #default="{ row }">
            <el-link :href="row.url" target="_blank" type="primary">{{ row.url }}</el-link>
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
        <el-table-column prop="created_at" label="创建时间" width="160" />
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
          <el-select v-model="form.type" placeholder="请选择类型">
            <el-option label="视频" value="video" />
            <el-option label="PPT" value="ppt" />
            <el-option label="文档" value="document" />
          </el-select>
        </el-form-item>
        <el-form-item label="链接" required>
          <el-input v-model="form.url" placeholder="请输入资料链接（视频/文件URL）" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="请输入资料描述" />
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
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const API_BASE = 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com'

const loading = ref(false)
const materials = ref([])
const activeTab = ref('video')
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)

const form = ref({
  title: '',
  type: 'video',
  url: '',
  description: ''
})

const typeLabels = { video: '视频', ppt: 'PPT', document: '文档' }
const typeColors = { video: 'danger', ppt: 'warning', document: '' }

const loadMaterials = async () => {
  loading.value = true
  try {
    const res = await axios.get(`${API_BASE}/api/admin/learning`)
    if (res.data.success) {
      const all = res.data.data || []
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
  form.value = { title: '', type: activeTab.value, url: '', description: '' }
  dialogVisible.value = true
}

const editMaterial = (row) => {
  isEdit.value = true
  form.value = { ...row }
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.value.title || !form.value.url) {
    ElMessage.warning('请填写标题和链接')
    return
  }

  submitting.value = true
  try {
    const url = isEdit.value
      ? `${API_BASE}/api/admin/learning/${form.value.id}`
      : `${API_BASE}/api/admin/learning`
    const method = isEdit.value ? 'put' : 'post'

    const res = await axios[method](url, form.value)
    if (res.data.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '添加成功')
      dialogVisible.value = false
      loadMaterials()
    } else {
      ElMessage.error(res.data.message || '操作失败')
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

    const res = await axios.delete(`${API_BASE}/api/admin/learning/${row.id}`)
    if (res.data.success) {
      ElMessage.success('删除成功')
      loadMaterials()
    } else {
      ElMessage.error(res.data.message || '删除失败')
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
</style>
