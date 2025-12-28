<template>
  <div class="admins-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>管理员管理</span>
          <el-button type="primary" @click="showAddDialog = true">添加管理员</el-button>
        </div>
      </template>

      <el-table :data="admins" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="姓名" />
        <el-table-column prop="phone" label="手机号" />
        <el-table-column prop="school_name" label="学校" />
        <el-table-column label="角色">
          <template #default="{ row }">
            <el-tag
              v-for="role in row.role_names?.split(',')"
              :key="role"
              size="small"
              class="role-tag"
            >
              {{ role }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="密码状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.password_changed ? 'success' : 'warning'" size="small">
              {{ row.password_changed ? '已修改' : '初始' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" @click="handleResetPassword(row)">重置密码</el-button>
            <el-button size="small" type="danger" @click="handleRemoveRole(row)">移除角色</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 添加管理员对话框 -->
    <el-dialog v-model="showAddDialog" title="添加管理员" width="500px">
      <el-form :model="addForm" :rules="addRules" ref="addFormRef" label-width="100px">
        <el-form-item label="选择用户" prop="user_id">
          <el-select
            v-model="addForm.user_id"
            filterable
            remote
            :remote-method="searchUsers"
            placeholder="输入姓名或手机号搜索"
            :loading="searchLoading"
            style="width: 100%"
          >
            <el-option
              v-for="user in searchedUsers"
              :key="user.id"
              :label="`${user.name} (${user.phone})`"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="角色" prop="role_code">
          <el-select v-model="addForm.role_code" placeholder="选择角色" style="width: 100%" @change="onRoleChange">
            <el-option label="超级管理员" value="super_admin" />
            <el-option label="学校管理员" value="school_admin" />
            <el-option label="赛事管理员" value="event_manager" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属学校" prop="school_id" v-if="addForm.role_code === 'school_admin'">
          <el-select v-model="addForm.school_id" placeholder="选择学校" style="width: 100%" filterable>
            <el-option
              v-for="school in schools"
              :key="school.id"
              :label="school.name"
              :value="school.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="初始密码" prop="initial_password">
          <el-input v-model="addForm.initial_password" placeholder="设置初始密码（至少6位）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="handleAddAdmin" :loading="addLoading">确定</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码对话框 -->
    <el-dialog v-model="showResetDialog" title="重置密码" width="400px">
      <el-form :model="resetForm" :rules="resetRules" ref="resetFormRef" label-width="80px">
        <el-form-item label="新密码" prop="new_password">
          <el-input v-model="resetForm.new_password" placeholder="新初始密码（至少6位）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showResetDialog = false">取消</el-button>
        <el-button type="primary" @click="handleConfirmReset" :loading="resetLoading">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const admins = ref([])
const schools = ref([])
const showAddDialog = ref(false)
const showResetDialog = ref(false)
const addLoading = ref(false)
const resetLoading = ref(false)
const searchLoading = ref(false)
const searchedUsers = ref([])
const addFormRef = ref(null)
const resetFormRef = ref(null)
const selectedAdmin = ref(null)

const addForm = reactive({
  user_id: '',
  role_code: '',
  school_id: '',
  initial_password: ''
})

const resetForm = reactive({
  new_password: ''
})

const addRules = {
  user_id: [{ required: true, message: '请选择用户', trigger: 'change' }],
  role_code: [{ required: true, message: '请选择角色', trigger: 'change' }],
  school_id: [{ required: true, message: '请选择学校', trigger: 'change' }],
  initial_password: [
    { required: true, message: '请设置初始密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ]
}

const resetRules = {
  new_password: [
    { required: true, message: '请设置新密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ]
}

// 获取当前用户ID
const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

// 加载学校列表
const loadSchools = async () => {
  try {
    const response = await fetch(`/api/admin/schools?user_id=${getUserId()}`)
    const result = await response.json()
    if (result.success) {
      schools.value = result.data
    }
  } catch (error) {
    console.error('Load schools error:', error)
  }
}

// 角色变更时清空学校选择
const onRoleChange = () => {
  addForm.school_id = ''
}

// 加载管理员列表
const loadAdmins = async () => {
  loading.value = true
  try {
    const response = await fetch(`/api/admin/admins?user_id=${getUserId()}`)
    const result = await response.json()
    if (result.success) {
      admins.value = result.data
    }
  } catch (error) {
    console.error('Load admins error:', error)
  } finally {
    loading.value = false
  }
}

// 搜索用户
const searchUsers = async (keyword) => {
  if (!keyword) {
    searchedUsers.value = []
    return
  }
  searchLoading.value = true
  try {
    const response = await fetch(`/api/admin/users?user_id=${getUserId()}&keyword=${keyword}&limit=10`)
    const result = await response.json()
    if (result.success) {
      searchedUsers.value = result.data
    }
  } catch (error) {
    console.error('Search users error:', error)
  } finally {
    searchLoading.value = false
  }
}

// 添加管理员
const handleAddAdmin = async () => {
  const valid = await addFormRef.value.validate().catch(() => false)
  if (!valid) return

  addLoading.value = true
  try {
    const response = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...addForm,
        granted_by: getUserId()
      })
    })
    const result = await response.json()
    if (result.success) {
      ElMessage.success('添加成功')
      showAddDialog.value = false
      addForm.user_id = ''
      addForm.role_code = ''
      addForm.school_id = ''
      addForm.initial_password = ''
      loadAdmins()
    } else {
      ElMessage.error(result.message || '添加失败')
    }
  } catch (error) {
    console.error('Add admin error:', error)
    ElMessage.error('添加失败')
  } finally {
    addLoading.value = false
  }
}

// 重置密码
const handleResetPassword = (admin) => {
  selectedAdmin.value = admin
  resetForm.new_password = ''
  showResetDialog.value = true
}

const handleConfirmReset = async () => {
  const valid = await resetFormRef.value.validate().catch(() => false)
  if (!valid) return

  resetLoading.value = true
  try {
    const response = await fetch(`/api/admin/admins/${selectedAdmin.value.id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: getUserId(),
        new_password: resetForm.new_password
      })
    })
    const result = await response.json()
    if (result.success) {
      ElMessage.success('密码已重置')
      showResetDialog.value = false
      loadAdmins()
    } else {
      ElMessage.error(result.message || '重置失败')
    }
  } catch (error) {
    console.error('Reset password error:', error)
    ElMessage.error('重置失败')
  } finally {
    resetLoading.value = false
  }
}

// 移除角色
const handleRemoveRole = async (admin) => {
  const roleCodes = admin.role_codes?.split(',') || []
  if (roleCodes.length === 0) return

  // 如果只有一个角色，直接移除
  const roleToRemove = roleCodes[0]

  try {
    await ElMessageBox.confirm(
      `确定要移除 ${admin.name} 的管理员角色吗？`,
      '确认移除',
      { type: 'warning' }
    )

    const response = await fetch(`/api/admin/admins/${admin.id}/role/${roleToRemove}?user_id=${getUserId()}`, {
      method: 'DELETE'
    })
    const result = await response.json()
    if (result.success) {
      ElMessage.success('已移除')
      loadAdmins()
    } else {
      ElMessage.error(result.message || '移除失败')
    }
  } catch {
    // 取消操作
  }
}

onMounted(() => {
  loadAdmins()
  loadSchools()
})
</script>

<style scoped>
.admins-page {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.role-tag {
  margin-right: 5px;
}
</style>
