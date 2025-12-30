<template>
  <el-config-provider :locale="zhCn">
    <!-- 登录页面不显示侧边栏 -->
    <div v-if="isAuthPage" class="auth-layout">
      <router-view />
    </div>

    <!-- 主布局 -->
    <el-container v-else class="app-container">
      <!-- 移动端遮罩 -->
      <div v-if="sidebarOpen" class="sidebar-overlay" @click="sidebarOpen = false"></div>

      <!-- 侧边栏 -->
      <el-aside :width="sidebarWidth" class="aside" :class="{ 'aside-open': sidebarOpen }">
        <div class="logo">
          <span>校乒网管理后台</span>
        </div>
        <el-menu
          :default-active="route.path"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409eff"
          @select="handleMenuSelect"
        >
          <el-menu-item index="/dashboard">
            <el-icon><DataAnalysis /></el-icon>
            <span>数据概览</span>
          </el-menu-item>
          <el-menu-item v-if="hasPermission('events')" index="/events">
            <el-icon><Trophy /></el-icon>
            <span>赛事管理</span>
          </el-menu-item>
          <el-menu-item v-if="hasPermission('users') || hasPermission('users_readonly')" index="/users">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item v-if="hasPermission('scores')" index="/scores">
            <el-icon><Edit /></el-icon>
            <span>成绩审核</span>
          </el-menu-item>
          <el-menu-item v-if="hasPermission('announcements')" index="/announcements">
            <el-icon><Bell /></el-icon>
            <span>公告管理</span>
          </el-menu-item>
          <el-menu-item v-if="hasPermission('learning')" index="/learning">
            <el-icon><Reading /></el-icon>
            <span>学习资料</span>
          </el-menu-item>
          <el-menu-item v-if="hasPermission('checkin')" index="/checkin">
            <el-icon><Location /></el-icon>
            <span>签到点管理</span>
          </el-menu-item>
          <el-menu-item v-if="hasPermission('admins')" index="/admins">
            <el-icon><Setting /></el-icon>
            <span>管理员管理</span>
          </el-menu-item>
          <el-menu-item v-if="hasPermission('schools')" index="/schools">
            <el-icon><OfficeBuilding /></el-icon>
            <span>学校管理</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <!-- 主区域 -->
      <el-container class="main-container">
        <el-header class="header">
          <div class="header-left">
            <el-button class="menu-btn" text @click="sidebarOpen = !sidebarOpen">
              <el-icon :size="20"><Fold v-if="sidebarOpen" /><Expand v-else /></el-icon>
            </el-button>
            <div class="user-info">
              <span class="user-name">{{ userName }}</span>
              <el-tag v-for="role in roleNames" :key="role" size="small" class="role-tag">
                {{ role }}
              </el-tag>
            </div>
          </div>
          <div class="header-actions">
            <el-button text @click="handleChangePassword" class="action-btn">
              <el-icon><Lock /></el-icon>
              <span class="action-text">修改密码</span>
            </el-button>
            <el-button text type="danger" @click="handleLogout" class="action-btn">
              <el-icon><SwitchButton /></el-icon>
              <span class="action-text">退出</span>
            </el-button>
          </div>
        </el-header>
        <el-main class="main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </el-config-provider>
</template>

<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

const route = useRoute()
const router = useRouter()

// 用于触发权限重新读取的响应式变量
const authVersion = ref(0)

// 侧边栏状态
const sidebarOpen = ref(false)
const isMobile = ref(false)

// 检测屏幕尺寸
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) {
    sidebarOpen.value = false
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

// 侧边栏宽度
const sidebarWidth = computed(() => {
  if (isMobile.value) {
    return '200px'
  }
  return '200px'
})

// 菜单选择后关闭侧边栏（移动端）
const handleMenuSelect = () => {
  if (isMobile.value) {
    sidebarOpen.value = false
  }
}

// 判断是否是登录/修改密码页面
const isAuthPage = computed(() => {
  return route.path === '/login' || route.path === '/change-password'
})

// 监听路由变化，刷新权限
watch(() => route.path, () => {
  authVersion.value++
}, { immediate: true })

// 获取用户信息
const userName = computed(() => {
  authVersion.value // 依赖触发重新计算
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.name || '管理员'
})

// 获取角色名称
const roleNames = computed(() => {
  authVersion.value // 依赖触发重新计算
  const roles = JSON.parse(localStorage.getItem('adminRoles') || '[]')
  return roles.map(r => r.name)
})

// 获取权限列表
const permissions = computed(() => {
  authVersion.value // 依赖触发重新计算
  return JSON.parse(localStorage.getItem('adminPermissions') || '[]')
})

// 检查是否有权限
const hasPermission = (permission) => {
  return permissions.value.includes(permission)
}

// 修改密码
const handleChangePassword = () => {
  router.push('/change-password')
}

// 退出登录
const handleLogout = async () => {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    localStorage.removeItem('adminUser')
    localStorage.removeItem('adminRoles')
    localStorage.removeItem('adminPermissions')
    ElMessage.success('已退出登录')
    router.push('/login')
  } catch {
    // 取消退出
  }
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
}

.auth-layout {
  height: 100%;
}

.app-container {
  height: 100%;
}

.aside {
  background-color: #304156;
  transition: transform 0.3s ease;
  overflow-y: auto;
  overflow-x: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  border-bottom: 1px solid #3d4a5a;
  white-space: nowrap;
}

.header {
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: 60px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.menu-btn {
  display: none;
  padding: 8px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow: hidden;
}

.user-name {
  font-weight: 500;
  color: #333;
  white-space: nowrap;
}

.role-tag {
  margin-left: 5px;
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
}

.main {
  background-color: #f0f2f5;
  overflow-y: auto;
}

.main-container {
  flex: 1;
  overflow: hidden;
}

.sidebar-overlay {
  display: none;
}

/* 移动端样式 */
@media screen and (max-width: 768px) {
  .aside {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 1000;
    transform: translateX(-100%);
  }

  .aside-open {
    transform: translateX(0);
  }

  .sidebar-overlay {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
  }

  .menu-btn {
    display: flex !important;
  }

  .header {
    padding: 0 12px;
  }

  .user-info {
    gap: 6px;
  }

  .user-name {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .role-tag {
    display: none;
  }

  .header-actions {
    gap: 4px;
  }

  .action-text {
    display: none;
  }

  .action-btn {
    padding: 8px;
  }

  .main {
    padding: 12px !important;
  }

  /* 表格响应式 */
  :deep(.el-table) {
    font-size: 12px;
  }

  :deep(.el-table .cell) {
    padding: 8px 4px;
  }

  :deep(.el-card) {
    margin-bottom: 12px;
  }

  :deep(.el-card__body) {
    padding: 12px;
  }

  :deep(.el-dialog) {
    width: 90% !important;
    max-width: 90% !important;
    margin: 5vh auto !important;
  }

  :deep(.el-form-item) {
    margin-bottom: 12px;
  }

  :deep(.el-form-item__label) {
    padding-bottom: 4px;
  }

  :deep(.page-header) {
    flex-direction: column;
    align-items: flex-start !important;
    gap: 12px;
  }

  :deep(.page-header h2) {
    font-size: 18px;
  }
}

/* 平板样式 */
@media screen and (min-width: 769px) and (max-width: 1024px) {
  .aside {
    width: 180px !important;
  }

  .logo {
    font-size: 14px;
  }

  :deep(.el-menu-item) {
    font-size: 13px;
  }
}
</style>
