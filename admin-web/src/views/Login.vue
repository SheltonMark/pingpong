<template>
  <div class="login-container">
    <div class="login-box">
      <h2 class="title">校乒网管理后台</h2>
      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin">
        <el-form-item prop="phone">
          <el-input
            v-model="form.phone"
            placeholder="手机号"
            prefix-icon="User"
            size="large"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            @click="handleLogin"
            class="login-btn"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)

const form = reactive({
  phone: '',
  password: ''
})

const rules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const response = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const result = await response.json()

    if (result.success) {
      // 先保存到 localStorage
      localStorage.setItem('adminUser', JSON.stringify(result.data.user))
      localStorage.setItem('adminRoles', JSON.stringify(result.data.roles))
      localStorage.setItem('adminPermissions', JSON.stringify(result.data.permissions))

      ElMessage.success('登录成功')

      // 等待下一个 tick 确保 localStorage 完全写入
      await nextTick()

      // 使用 replace 而不是 push，避免返回到登录页
      if (result.data.needChangePassword) {
        router.replace('/change-password?first=1')
      } else {
        router.replace('/dashboard')
      }
    } else {
      ElMessage.error(result.message || '登录失败')
    }
  } catch (error) {
    console.error('Login error:', error)
    ElMessage.error('登录失败，请重试')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #e8e4df 0%, #d4cdc4 50%, #c9c1b6 100%);
}

.login-box {
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
  margin-bottom: 36px;
  color: #1a1a1a;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 1px;
}

:deep(.el-form-item) {
  margin-bottom: 22px;
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

.login-btn {
  width: 100%;
  height: 44px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  background: #1a1a1a;
  border-color: #1a1a1a;
}

.login-btn:hover {
  background: #333;
  border-color: #333;
}

@media (max-width: 480px) {
  .login-box {
    width: calc(100% - 40px);
    margin: 20px;
    padding: 36px 28px;
  }
}
</style>
