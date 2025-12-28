<template>
  <div class="change-password-container">
    <!-- 乒乓球桌线条装饰 -->
    <div class="table-lines">
      <div class="center-line"></div>
      <div class="net"></div>
    </div>

    <!-- 动态乒乓球 -->
    <div class="ball ball-1"></div>

    <!-- 修改密码卡片 -->
    <div class="change-card">
      <div class="card-header">
        <div class="logo-icon">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2"/>
            <path d="M14 20 L26 20 M20 14 L20 26" stroke="currentColor" stroke-width="2"/>
          </svg>
        </div>
        <h1 class="title">{{ isFirst ? '设置新密码' : '修改密码' }}</h1>
        <p class="subtitle">{{ isFirst ? '首次登录请修改初始密码' : '请输入新密码' }}</p>
      </div>

      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleSubmit" class="change-form">
        <el-form-item prop="oldPassword">
          <el-input
            v-model="form.oldPassword"
            type="password"
            placeholder="原密码"
            size="large"
            show-password
          >
            <template #prefix>
              <span class="input-icon">🔑</span>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            placeholder="新密码（至少6位）"
            size="large"
            show-password
          >
            <template #prefix>
              <span class="input-icon">🔐</span>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="确认新密码"
            size="large"
            show-password
            @keyup.enter="handleSubmit"
          >
            <template #prefix>
              <span class="input-icon">✓</span>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <button
            type="button"
            class="submit-btn"
            :class="{ loading }"
            :disabled="loading"
            @click="handleSubmit"
          >
            <span class="btn-text">{{ loading ? '提交中...' : '确认修改' }}</span>
          </button>
        </el-form-item>
        <el-form-item v-if="!isFirst">
          <button type="button" class="back-btn" @click="router.back()">
            ← 返回
          </button>
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
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');

.change-password-container {
  --table-green: #0D5132;
  --table-dark: #083322;
  --line-white: rgba(255, 255, 255, 0.9);
  --ball-orange: #FF6D00;
  --ball-glow: rgba(255, 109, 0, 0.4);

  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--table-green);
  font-family: 'Noto Sans SC', -apple-system, sans-serif;
  position: relative;
  overflow: hidden;
}

/* 乒乓球桌线条 */
.table-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.center-line {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: repeating-linear-gradient(
    to bottom,
    var(--line-white) 0,
    var(--line-white) 20px,
    transparent 20px,
    transparent 30px
  );
  opacity: 0.3;
}

.net {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--line-white) 20%,
    var(--line-white) 80%,
    transparent 100%
  );
  opacity: 0.2;
}

/* 乒乓球动画 */
.ball {
  position: absolute;
  width: 14px;
  height: 14px;
  background: radial-gradient(circle at 30% 30%, #FFA040, var(--ball-orange));
  border-radius: 50%;
  box-shadow:
    0 0 20px var(--ball-glow),
    inset -2px -2px 4px rgba(0,0,0,0.2);
}

.ball-1 {
  top: 25%;
  right: 20%;
  animation: float1 8s ease-in-out infinite;
}

@keyframes float1 {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(-20px, 15px); }
  50% { transform: translate(-40px, -10px); }
  75% { transform: translate(-15px, 20px); }
}

/* 修改密码卡片 */
.change-card {
  position: relative;
  width: 380px;
  padding: 48px 40px;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 4px;
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(255, 255, 255, 0.1);
  z-index: 10;
}

.change-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 40px;
  right: 40px;
  height: 3px;
  background: var(--ball-orange);
}

.card-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  width: 44px;
  height: 44px;
  margin: 0 auto 14px;
  color: var(--table-green);
}

.logo-icon svg {
  width: 100%;
  height: 100%;
}

.title {
  font-size: 24px;
  font-weight: 700;
  color: var(--table-dark);
  letter-spacing: 1px;
  margin: 0 0 6px;
}

.subtitle {
  font-size: 13px;
  color: #888;
  margin: 0;
}

/* 表单样式 */
.change-form {
  margin-top: 20px;
}

.change-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

.change-form :deep(.el-input__wrapper) {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  box-shadow: none;
  padding: 4px 12px;
  transition: all 0.2s ease;
}

.change-form :deep(.el-input__wrapper:hover) {
  border-color: #dee2e6;
}

.change-form :deep(.el-input__wrapper.is-focus) {
  border-color: var(--table-green);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(13, 81, 50, 0.1);
}

.change-form :deep(.el-input__inner) {
  font-size: 15px;
  color: #333;
}

.change-form :deep(.el-input__inner::placeholder) {
  color: #adb5bd;
}

.input-icon {
  font-size: 15px;
  margin-right: 4px;
}

/* 提交按钮 */
.submit-btn {
  width: 100%;
  height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--table-green);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.submit-btn:hover {
  background: var(--table-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.submit-btn:active {
  transform: translateY(0);
}

.submit-btn.loading {
  pointer-events: none;
  opacity: 0.8;
}

/* 返回按钮 */
.back-btn {
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #666;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.back-btn:hover {
  border-color: var(--table-green);
  color: var(--table-green);
}

/* 响应式 */
@media (max-width: 480px) {
  .change-card {
    width: calc(100% - 40px);
    margin: 20px;
    padding: 36px 28px;
  }
}
</style>
