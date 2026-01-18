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
        <el-table-column label="操作" width="240">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openCollegeDrawer(row)">管理学院</el-button>
            <el-button size="small" @click="handleEdit(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 学院管理抽屉 -->
    <el-drawer
      v-model="collegeDrawerVisible"
      :title="currentSchool ? `${currentSchool.name} - 学院管理` : '学院管理'"
      direction="rtl"
      size="450px"
    >
      <div class="college-drawer-content">
        <!-- 添加学院表单 -->
        <div class="add-college-form">
          <el-input
            v-model="newCollegeName"
            placeholder="输入新学院名称"
            @keyup.enter="handleAddCollege"
            :disabled="collegeSubmitting"
          >
            <template #append>
              <el-button type="primary" @click="handleAddCollege" :loading="collegeSubmitting">
                添加
              </el-button>
            </template>
          </el-input>
        </div>

        <!-- 学院列表 -->
        <div class="college-list" v-loading="collegeLoading">
          <div v-if="colleges.length === 0" class="empty-tip">
            暂无学院，请添加
          </div>
          <div v-else class="college-items">
            <div
              v-for="college in colleges"
              :key="college.id"
              class="college-item"
              :class="{ inactive: !college.is_active }"
            >
              <div class="college-info">
                <template v-if="editingCollegeId === college.id">
                  <el-input
                    v-model="editingCollegeName"
                    size="small"
                    @keyup.enter="handleUpdateCollege(college)"
                    @keyup.esc="cancelEditCollege"
                  />
                </template>
                <template v-else>
                  <span class="college-name">{{ college.name }}</span>
                  <el-tag v-if="!college.is_active" size="small" type="info" class="status-tag">已禁用</el-tag>
                </template>
              </div>
              <div class="college-meta">
                <span class="user-count">{{ college.user_count || 0 }} 人</span>
              </div>
              <div class="college-actions">
                <template v-if="editingCollegeId === college.id">
                  <el-button size="small" type="primary" @click="handleUpdateCollege(college)" :loading="collegeSubmitting">
                    保存
                  </el-button>
                  <el-button size="small" @click="cancelEditCollege">取消</el-button>
                </template>
                <template v-else>
                  <el-button size="small" text type="primary" @click="startEditCollege(college)">编辑</el-button>
                  <el-button size="small" text type="danger" @click="handleDeleteCollege(college)">删除</el-button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- 显示已禁用学院开关 -->
        <div class="show-inactive-toggle" v-if="hasInactiveColleges">
          <el-checkbox v-model="showInactiveColleges" @change="loadColleges">
            显示已禁用的学院
          </el-checkbox>
        </div>
      </div>
    </el-drawer>

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
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const submitLoading = ref(false)
const schools = ref([])
const showAddDialog = ref(false)
const dialogVisible = ref(false)
const editingSchool = ref(null)
const formRef = ref(null)

// 学院管理相关
const collegeDrawerVisible = ref(false)
const currentSchool = ref(null)
const colleges = ref([])
const collegeLoading = ref(false)
const collegeSubmitting = ref(false)
const newCollegeName = ref('')
const editingCollegeId = ref(null)
const editingCollegeName = ref('')
const showInactiveColleges = ref(false)
const hasInactiveColleges = ref(false)

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

// ============ 学院管理功能 ============

// 打开学院管理抽屉
const openCollegeDrawer = (school) => {
  currentSchool.value = school
  collegeDrawerVisible.value = true
  showInactiveColleges.value = false
  loadColleges()
}

// 加载学院列表
const loadColleges = async () => {
  if (!currentSchool.value) return

  collegeLoading.value = true
  try {
    const includeInactive = showInactiveColleges.value ? '1' : ''
    const response = await fetch(
      `/api/admin/schools/${currentSchool.value.id}/colleges?user_id=${getUserId()}&include_inactive=${includeInactive}`
    )
    const result = await response.json()
    if (result.success) {
      colleges.value = result.data

      // 检查是否有已禁用的学院（用于显示开关）
      if (!showInactiveColleges.value) {
        const checkResponse = await fetch(
          `/api/admin/schools/${currentSchool.value.id}/colleges?user_id=${getUserId()}&include_inactive=1`
        )
        const checkResult = await checkResponse.json()
        if (checkResult.success) {
          hasInactiveColleges.value = checkResult.data.some(c => !c.is_active)
        }
      }
    }
  } catch (error) {
    console.error('Load colleges error:', error)
    ElMessage.error('加载学院列表失败')
  } finally {
    collegeLoading.value = false
  }
}

// 添加学院
const handleAddCollege = async () => {
  if (!newCollegeName.value.trim()) {
    ElMessage.warning('请输入学院名称')
    return
  }

  collegeSubmitting.value = true
  try {
    const response = await fetch(`/api/admin/schools/${currentSchool.value.id}/colleges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newCollegeName.value.trim(),
        user_id: getUserId()
      })
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success('添加成功')
      newCollegeName.value = ''
      loadColleges()
    } else {
      ElMessage.error(result.message || '添加失败')
    }
  } catch (error) {
    console.error('Add college error:', error)
    ElMessage.error('添加失败')
  } finally {
    collegeSubmitting.value = false
  }
}

// 开始编辑学院
const startEditCollege = (college) => {
  editingCollegeId.value = college.id
  editingCollegeName.value = college.name
}

// 取消编辑
const cancelEditCollege = () => {
  editingCollegeId.value = null
  editingCollegeName.value = ''
}

// 更新学院
const handleUpdateCollege = async (college) => {
  if (!editingCollegeName.value.trim()) {
    ElMessage.warning('学院名称不能为空')
    return
  }

  collegeSubmitting.value = true
  try {
    const response = await fetch(`/api/admin/colleges/${college.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editingCollegeName.value.trim(),
        is_active: college.is_active,
        user_id: getUserId()
      })
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success('更新成功')
      cancelEditCollege()
      loadColleges()
    } else {
      ElMessage.error(result.message || '更新失败')
    }
  } catch (error) {
    console.error('Update college error:', error)
    ElMessage.error('更新失败')
  } finally {
    collegeSubmitting.value = false
  }
}

// 删除学院
const handleDeleteCollege = async (college) => {
  try {
    const confirmMsg = college.user_count > 0
      ? `该学院有 ${college.user_count} 个用户，删除后将改为禁用状态。确定继续？`
      : `确定要删除「${college.name}」吗？`

    await ElMessageBox.confirm(confirmMsg, '确认删除', { type: 'warning' })

    const response = await fetch(`/api/admin/colleges/${college.id}?user_id=${getUserId()}`, {
      method: 'DELETE'
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success(result.message || '已删除')
      loadColleges()
    } else {
      ElMessage.error(result.message || '删除失败')
    }
  } catch {
    // 取消操作
  }
}

// 监听 showAddDialog
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

/* 学院管理抽屉样式 */
.college-drawer-content {
  padding: 0 10px;
}

.add-college-form {
  margin-bottom: 20px;
}

.college-list {
  min-height: 200px;
}

.empty-tip {
  text-align: center;
  color: #909399;
  padding: 40px 0;
}

.college-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.college-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 8px;
  transition: all 0.2s;
}

.college-item:hover {
  background: #ecf5ff;
}

.college-item.inactive {
  opacity: 0.6;
  background: #fafafa;
}

.college-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.college-name {
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-tag {
  flex-shrink: 0;
}

.college-meta {
  margin-right: 12px;
}

.user-count {
  font-size: 12px;
  color: #909399;
}

.college-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.show-inactive-toggle {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
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
  :deep(.el-drawer) {
    width: 100% !important;
  }
}
</style>
