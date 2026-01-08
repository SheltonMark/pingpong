<template>
  <div class="schools-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>学校管理</span>
          <el-button type="primary" @click="showAddDialog = true">添加学校</el-button>
        </div>
      </template>

      <el-table :data="schools" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="学校名称" />
        <el-table-column prop="short_name" label="简称" width="120" />
        <el-table-column prop="province" label="省份" width="100" />
        <el-table-column prop="city" label="城市" width="100" />
        <el-table-column label="用户数" width="100">
          <template #default="{ row }">
            <span>{{ row.user_count || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="管理员" width="100">
          <template #default="{ row }">
            <span>{{ row.admin_count || 0 }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.is_active ? 'success' : 'info'" size="small">
              {{ row.is_active ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加/编辑学校对话框 -->
    <el-dialog v-model="dialogVisible" :title="editingSchool ? '编辑学校' : '添加学校'" width="500px">
      <el-form :model="schoolForm" :rules="rules" ref="formRef" label-width="100px">
        <el-form-item label="学校名称" prop="name">
          <el-input v-model="schoolForm.name" placeholder="请输入完整学校名称" />
        </el-form-item>
        <el-form-item label="简称" prop="short_name">
          <el-input v-model="schoolForm.short_name" placeholder="如：浙大、复旦" />
        </el-form-item>
        <el-form-item label="省份">
          <el-select v-model="schoolForm.province" placeholder="请选择省份" @change="handleProvinceChange">
            <el-option v-for="p in provinces" :key="p" :label="p" :value="p" />
          </el-select>
        </el-form-item>
        <el-form-item label="城市">
          <el-select v-model="schoolForm.city" placeholder="请选择城市">
            <el-option v-for="c in currentCities" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" v-if="editingSchool">
          <el-switch v-model="schoolForm.is_active" active-text="启用" inactive-text="禁用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitLoading">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const submitLoading = ref(false)
const schools = ref([])
const showAddDialog = ref(false)
const dialogVisible = ref(false)
const editingSchool = ref(null)
const formRef = ref(null)

// 省份和城市数据
const provinces = ['浙江省', '江苏省', '上海市', '安徽省', '福建省', '广东省', '北京市', '天津市', '其他']

const citiesByProvince = {
  '浙江省': ['杭州市', '宁波市', '温州市', '嘉兴市', '湖州市', '绍兴市', '金华市', '衢州市', '舟山市', '台州市', '丽水市'],
  '江苏省': ['南京市', '苏州市', '无锡市', '常州市', '南通市', '扬州市', '镇江市', '泰州市', '盐城市', '淮安市', '连云港市', '徐州市', '宿迁市'],
  '上海市': ['上海市'],
  '安徽省': ['合肥市', '芜湖市', '蚌埠市', '淮南市', '马鞍山市', '淮北市', '铜陵市', '安庆市', '黄山市', '阜阳市', '宿州市', '滁州市', '六安市', '宣城市', '池州市', '亳州市'],
  '福建省': ['福州市', '厦门市', '莆田市', '三明市', '泉州市', '漳州市', '南平市', '龙岩市', '宁德市'],
  '广东省': ['广州市', '深圳市', '珠海市', '汕头市', '佛山市', '韶关市', '湛江市', '肇庆市', '江门市', '茂名市', '惠州市', '梅州市', '汕尾市', '河源市', '阳江市', '清远市', '东莞市', '中山市', '潮州市', '揭阳市', '云浮市'],
  '北京市': ['北京市'],
  '天津市': ['天津市'],
  '其他': ['其他']
}

const currentCities = computed(() => {
  return citiesByProvince[schoolForm.province] || []
})

const handleProvinceChange = () => {
  // 切换省份时重置城市
  const cities = citiesByProvince[schoolForm.province]
  if (cities && cities.length > 0) {
    schoolForm.city = cities[0]
  } else {
    schoolForm.city = ''
  }
}

const schoolForm = reactive({
  name: '',
  short_name: '',
  province: '浙江省',
  city: '杭州市',
  is_active: true
})

const rules = {
  name: [{ required: true, message: '请输入学校名称', trigger: 'blur' }]
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const loadSchools = async () => {
  loading.value = true
  try {
    const response = await fetch(`/api/admin/schools?user_id=${getUserId()}&include_inactive=1`)
    const result = await response.json()
    if (result.success) {
      schools.value = result.data
    }
  } catch (error) {
    console.error('Load schools error:', error)
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  schoolForm.name = ''
  schoolForm.short_name = ''
  schoolForm.province = '浙江省'
  schoolForm.city = '杭州市'
  schoolForm.is_active = true
  editingSchool.value = null
}

const handleEdit = (school) => {
  editingSchool.value = school
  schoolForm.name = school.name
  schoolForm.short_name = school.short_name || ''
  schoolForm.province = school.province || ''
  schoolForm.city = school.city || ''
  schoolForm.is_active = !!school.is_active
  dialogVisible.value = true
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitLoading.value = true
  try {
    const url = editingSchool.value
      ? `/api/admin/schools/${editingSchool.value.id}`
      : '/api/admin/schools'
    const method = editingSchool.value ? 'PUT' : 'POST'

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...schoolForm,
        user_id: getUserId()
      })
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success(editingSchool.value ? '更新成功' : '添加成功')
      dialogVisible.value = false
      resetForm()
      loadSchools()
    } else {
      ElMessage.error(result.message || '操作失败')
    }
  } catch (error) {
    console.error('Submit error:', error)
    ElMessage.error('操作失败')
  } finally {
    submitLoading.value = false
  }
}

const handleDelete = async (school) => {
  try {
    await ElMessageBox.confirm(
      school.user_count > 0
        ? `该学校有 ${school.user_count} 个用户，删除后将改为禁用状态。确定继续？`
        : `确定要删除 ${school.name} 吗？`,
      '确认删除',
      { type: 'warning' }
    )

    const response = await fetch(`/api/admin/schools/${school.id}?user_id=${getUserId()}`, {
      method: 'DELETE'
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success(result.message || '已删除')
      loadSchools()
    } else {
      ElMessage.error(result.message || '删除失败')
    }
  } catch {
    // 取消操作
  }
}

// 监听 showAddDialog
import { watch } from 'vue'
watch(showAddDialog, (val) => {
  if (val) {
    resetForm()
    dialogVisible.value = true
    showAddDialog.value = false
  }
})

onMounted(() => {
  loadSchools()
})
</script>

<style scoped>
.schools-page {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media screen and (max-width: 768px) {
  .schools-page {
    padding: 12px;
  }
  .card-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .card-header span {
    font-size: 16px;
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
