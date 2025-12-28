<template>
  <div class="login-container">
    <!-- 乒乓球桌线条装饰 -->
    <div class="table-lines">
      <div class="center-line"></div>
      <div class="side-line left"></div>
      <div class="side-line right"></div>
      <div class="net"></div>
    </div>

    <!-- 动态乒乓球 -->
    <div class="ball ball-1"></div>
    <div class="ball ball-2"></div>
    <div class="ball-trail"></div>

    <!-- 登录卡片 -->
    <div class="login-card">
      <div class="card-header">
        <div class="logo-icon">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2"/>
            <path d="M8 20 Q20 8, 32 20" stroke="currentColor" stroke-width="1.5" fill="none" stroke-dasharray="3 2"/>
          </svg>
        </div>
        <h1 class="title">校乒网</h1>
        <p class="subtitle">管理后台</p>
      </div>

      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin" class="login-form">
        <el-form-item prop="phone">
          <el-input
            v-model="form.phone"
            placeholder="手机号"
            size="large"
            class="custom-input"
          >
            <template #prefix>
              <span class="input-icon">📱</span>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            class="custom-input"
            @keyup.enter="handleLogin"
          >
            <template #prefix>
              <span class="input-icon">🔐</span>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <button
            type="button"
            class="login-btn"
            :class="{ loading }"
            :disabled="loading"
            @click="handleLogin"
          >
            <span class="btn-text">{{ loading ? '登录中...' : '进入系统' }}</span>
            <span class="btn-arrow">→</span>
          </button>
        </el-form-item>
      </el-form>
    </div>

    <!-- 底部装饰 -->
    <div class="footer-decoration">
      <span class="dot"></span>
      <span class="line"></span>
      <span class="dot"></span>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
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
      // 保存登录信息
      localStorage.setItem('adminUser', JSON.stringify(result.data.user))
      localStorage.setItem('adminRoles', JSON.stringify(result.data.roles))
      localStorage.setItem('adminPermissions', JSON.stringify(result.data.permissions))

      ElMessage.success('登录成功')

      // 检查是否需要修改密码
      if (result.data.needChangePassword) {
        router.push('/change-password?first=1')
      } else {
        router.push('/events')
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
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap');

.login-container {
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

.side-line {
  position: absolute;
  top: 10%;
  bottom: 10%;
  width: 2px;
  background: var(--line-white);
  opacity: 0.15;
}

.side-line.left { left: 8%; }
.side-line.right { right: 8%; }

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

.net::before {
  content: '';
  position: absolute;
  left: 20%;
  right: 20%;
  top: -3px;
  height: 7px;
  background: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent 8px,
    rgba(255,255,255,0.1) 8px,
    rgba(255,255,255,0.1) 10px
  );
}

/* 乒乓球动画 */
.ball {
  position: absolute;
  width: 16px;
  height: 16px;
  background: radial-gradient(circle at 30% 30%, #FFA040, var(--ball-orange));
  border-radius: 50%;
  box-shadow:
    0 0 20px var(--ball-glow),
    inset -2px -2px 4px rgba(0,0,0,0.2);
}

.ball-1 {
  top: 20%;
  left: 15%;
  animation: float1 8s ease-in-out infinite;
}

.ball-2 {
  bottom: 25%;
  right: 20%;
  width: 12px;
  height: 12px;
  animation: float2 10s ease-in-out infinite;
  opacity: 0.7;
}

.ball-trail {
  position: absolute;
  top: 30%;
  left: 10%;
  width: 200px;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--ball-glow), transparent);
  transform: rotate(-15deg);
  opacity: 0.3;
  animation: trail 6s ease-in-out infinite;
}

@keyframes float1 {
  0%, 100% { transform: translate(0, 0); }
  25% { transform: translate(30px, -20px); }
  50% { transform: translate(50px, 10px); }
  75% { transform: translate(20px, 30px); }
}

@keyframes float2 {
  0%, 100% { transform: translate(0, 0); }
  33% { transform: translate(-40px, 20px); }
  66% { transform: translate(-20px, -30px); }
}

@keyframes trail {
  0%, 100% { opacity: 0.3; transform: rotate(-15deg) translateX(0); }
  50% { opacity: 0.1; transform: rotate(-10deg) translateX(50px); }
}

/* 登录卡片 */
.login-card {
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

.login-card::before {
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
  margin-bottom: 36px;
}

.logo-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 16px;
  color: var(--table-green);
}

.logo-icon svg {
  width: 100%;
  height: 100%;
}

.title {
  font-size: 28px;
  font-weight: 700;
  color: var(--table-dark);
  letter-spacing: 2px;
  margin: 0 0 4px;
}

.subtitle {
  font-size: 13px;
  color: #888;
  letter-spacing: 4px;
  text-transform: uppercase;
  margin: 0;
}

/* 表单样式 */
.login-form {
  margin-top: 24px;
}

.login-form :deep(.el-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.el-input__wrapper) {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  box-shadow: none;
  padding: 4px 12px;
  transition: all 0.2s ease;
}

.login-form :deep(.el-input__wrapper:hover) {
  border-color: #dee2e6;
}

.login-form :deep(.el-input__wrapper.is-focus) {
  border-color: var(--table-green);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(13, 81, 50, 0.1);
}

.login-form :deep(.el-input__inner) {
  font-size: 15px;
  color: #333;
}

.login-form :deep(.el-input__inner::placeholder) {
  color: #adb5bd;
}

.input-icon {
  font-size: 16px;
  margin-right: 4px;
}

/* 登录按钮 */
.login-btn {
  width: 100%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--table-green);
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.login-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
  transition: left 0.5s ease;
}

.login-btn:hover {
  background: var(--table-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.login-btn:hover::before {
  left: 100%;
}

.login-btn:active {
  transform: translateY(0);
}

.login-btn.loading {
  pointer-events: none;
  opacity: 0.8;
}

.btn-arrow {
  transition: transform 0.2s ease;
}

.login-btn:hover .btn-arrow {
  transform: translateX(4px);
}

/* 底部装饰 */
.footer-decoration {
  position: absolute;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
}

.footer-decoration .dot {
  width: 6px;
  height: 6px;
  background: var(--ball-orange);
  border-radius: 50%;
  opacity: 0.6;
}

.footer-decoration .line {
  width: 60px;
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
}

/* 响应式 */
@media (max-width: 480px) {
  .login-card {
    width: calc(100% - 40px);
    margin: 20px;
    padding: 36px 28px;
  }

  .side-line { display: none; }
}
</style>
