<template>
  <el-config-provider :locale="zhCn">
    <!-- 登录页面不显示侧边栏 -->
    <div v-if="isAuthPage" class="auth-layout">
      <router-view />
    </div>

    <!-- 主布局 -->
    <el-container v-else class="app-container">
      <!-- 侧边栏 -->
      <el-aside width="200px" class="aside">
        <div class="logo">
          <span>校乒网管理后台</span>
        </div>
        <el-menu
          :default-active="route.path"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409eff"
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
      <el-container>
        <el-header class="header">
          <div class="user-info">
            <span class="user-name">{{ userName }}</span>
            <el-tag v-for="role in roleNames" :key="role" size="small" class="role-tag">
              {{ role }}
            </el-tag>
          </div>
          <div class="header-actions">
            <el-button text @click="handleChangePassword">
              <el-icon><Lock /></el-icon>
              修改密码
            </el-button>
            <el-button text type="danger" @click="handleLogout">
              <el-icon><SwitchButton /></el-icon>
              退出登录
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
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

const route = useRoute()
const router = useRouter()

// 判断是否是登录/修改密码页面
const isAuthPage = computed(() => {
  return route.path === '/login' || route.path === '/change-password'
})

// 获取用户信息
const userName = computed(() => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.name || '管理员'
})

// 获取角色名称
const roleNames = computed(() => {
  const roles = JSON.parse(localStorage.getItem('adminRoles') || '[]')
  return roles.map(r => r.name)
})

// 获取权限列表
const permissions = computed(() => {
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
}

.header {
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-name {
  font-weight: 500;
  color: #333;
}

.role-tag {
  margin-left: 5px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.main {
  background-color: #f0f2f5;
}
</style>
