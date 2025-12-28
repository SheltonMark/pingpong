<template>
  <div class="change-password-container">
    <div class="change-box">
      <h2 class="title">{{ isFirst ? '设置新密码' : '修改密码' }}</h2>
      <p class="subtitle" v-if="isFirst">首次登录请修改初始密码</p>
      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleSubmit">
        <el-form-item prop="oldPassword">
          <el-input
            v-model="form.oldPassword"
            type="password"
            placeholder="原密码"
            prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        <el-form-item prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            placeholder="新密码（至少6位）"
            prefix-icon="Lock"
            size="large"
            show-password
          />
        </el-form-item>
        <el-form-item prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="确认新密码"
            prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="handleSubmit"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            @click="handleSubmit"
            class="submit-btn"
          >
            确认修改
          </el-button>
        </el-form-item>
        <el-form-item v-if="!isFirst">
          <el-button size="large" @click="router.back()" class="back-btn">
            返回
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const formRef = ref(null)
const loading = ref(false)

const isFirst = computed(() => route.query.first === '1')

const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const validateConfirm = (rule, value, callback) => {
  if (value !== form.newPassword) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules = {
  oldPassword: [
    { required: true, message: '请输入原密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: validateConfirm, trigger: 'blur' }
  ]
}

const handleSubmit = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  if (!user.id) {
    ElMessage.error('请先登录')
    router.push('/login')
    return
  }

  loading.value = true
  try {
    const response = await fetch('/api/admin/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        old_password: form.oldPassword,
        new_password: form.newPassword
      })
    })
    const result = await response.json()

    if (result.success) {
      ElMessage.success('密码修改成功')
      if (isFirst.value) {
        router.push('/events')
      } else {
        router.back()
      }
    } else {
      ElMessage.error(result.message || '修改失败')
    }
  } catch (error) {
    console.error('Change password error:', error)
    ElMessage.error('修改失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.change-password-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #e8e4df 0%, #d4cdc4 50%, #c9c1b6 100%);
}

.change-box {
  width: 380px;
  padding: 48px 40px;
  background: #fff;
  border-radius: 12px;
  box-shadow:
    0 4px 24px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.04);
}

.title {
  text-align: center;
  margin-bottom: 8px;
  color: #1a1a1a;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 1px;
}

.subtitle {
  text-align: center;
  margin-bottom: 32px;
  color: #888;
  font-size: 14px;
}

.title + .el-form {
  margin-top: 36px;
}

:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-input__wrapper) {
  border-radius: 8px;
  box-shadow: 0 0 0 1px #e5e5e5;
  padding: 4px 12px;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #c0c0c0;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px #1a1a1a;
}

:deep(.el-input__inner) {
  font-size: 15px;
  color: #333;
}

:deep(.el-input__inner::placeholder) {
  color: #999;
}

.submit-btn {
  width: 100%;
  height: 44px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  background: #1a1a1a;
  border-color: #1a1a1a;
}

.submit-btn:hover {
  background: #333;
  border-color: #333;
}

.back-btn {
  width: 100%;
  height: 44px;
  border-radius: 8px;
  font-size: 15px;
  background: #fff;
  border-color: #ddd;
  color: #666;
}

.back-btn:hover {
  border-color: #1a1a1a;
  color: #1a1a1a;
}

@media (max-width: 480px) {
  .change-box {
    width: calc(100% - 40px);
    margin: 20px;
    padding: 36px 28px;
  }
}
</style>
