import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/change-password',
    name: 'ChangePassword',
    component: () => import('../views/ChangePassword.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('../views/Dashboard.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/events',
    name: 'Events',
    component: () => import('../views/Events.vue'),
    meta: { requiresAuth: true, permission: 'events' }
  },
  {
    path: '/users',
    name: 'Users',
    component: () => import('../views/Users.vue'),
    meta: { requiresAuth: true, permission: 'users' }
  },
  {
    path: '/scores',
    name: 'Scores',
    component: () => import('../views/Scores.vue'),
    meta: { requiresAuth: true, permission: 'scores' }
  },
  {
    path: '/announcements',
    name: 'Announcements',
    component: () => import('../views/Announcements.vue'),
    meta: { requiresAuth: true, permission: 'announcements' }
  },
  {
    path: '/learning',
    name: 'Learning',
    component: () => import('../views/Learning.vue'),
    meta: { requiresAuth: true, permission: 'learning' }
  },
  {
    path: '/checkin',
    name: 'Checkin',
    component: () => import('../views/Checkin.vue'),
    meta: { requiresAuth: true, permission: 'checkin' }
  },
  {
    path: '/admins',
    name: 'Admins',
    component: () => import('../views/Admins.vue'),
    meta: { requiresAuth: true, permission: 'admins' }
  },
  {
    path: '/schools',
    name: 'Schools',
    component: () => import('../views/Schools.vue'),
    meta: { requiresAuth: true, permission: 'schools' }
  },
  {
    path: '/captain-approvals',
    name: 'CaptainApprovals',
    component: () => import('../views/CaptainApprovals.vue'),
    meta: { requiresAuth: true, permission: 'events' }
  },
  {
    path: '/doubles-pairs',
    name: 'DoublesPairs',
    component: () => import('../views/DoublesPairs.vue'),
    meta: { requiresAuth: true, permission: 'events' }
  },
  {
    path: '/team-management',
    name: 'TeamManagement',
    component: () => import('../views/TeamManagement.vue'),
    meta: { requiresAuth: true, permission: 'events' }
  },
  {
    path: '/invitations',
    name: 'Invitations',
    component: () => import('../views/Invitations.vue'),
    meta: { requiresAuth: true, permission: 'events' }
  },
  {
    path: '/posts',
    name: 'Posts',
    component: () => import('../views/Posts.vue'),
    meta: { requiresAuth: true, permission: 'posts' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 检查是否已登录
function isAuthenticated() {
  const user = localStorage.getItem('adminUser')
  return !!user
}

// 检查是否有权限
function hasPermission(permission) {
  if (!permission) return true
  const permissions = JSON.parse(localStorage.getItem('adminPermissions') || '[]')
  // users_readonly 也算有 users 权限（只是只读）
  if (permission === 'users' && permissions.includes('users_readonly')) {
    return true
  }
  return permissions.includes(permission)
}

// 路由守卫
router.beforeEach((to, from, next) => {
  // 公开页面直接放行
  if (to.meta.public) {
    next()
    return
  }

  // 需要登录的页面
  if (to.meta.requiresAuth) {
    if (!isAuthenticated()) {
      next('/login')
      return
    }

    // 检查权限
    if (to.meta.permission && !hasPermission(to.meta.permission)) {
      // 无权限，跳转到第一个有权限的页面
      const permissions = JSON.parse(localStorage.getItem('adminPermissions') || '[]')
      if (permissions.includes('events')) {
        next('/events')
      } else if (permissions.includes('scores')) {
        next('/scores')
      } else {
        next('/login')
      }
      return
    }
  }

  next()
})

export default router
