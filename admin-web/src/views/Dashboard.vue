<template>
  <div class="page">
    <div class="page-header">
      <h2>数据概览</h2>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #409eff">
            <el-icon size="28"><User /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalUsers }}</div>
            <div class="stat-label">注册用户</div>
          </div>
          <div class="stat-footer">
            本周新增 <span class="highlight">{{ stats.weekNewUsers }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #67c23a">
            <el-icon size="28"><Trophy /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalEvents }}</div>
            <div class="stat-label">赛事总数</div>
          </div>
          <div class="stat-footer">
            进行中 <span class="highlight">{{ stats.ongoingEvents }}</span>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #e6a23c">
            <el-icon size="28"><Connection /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalMatches }}</div>
            <div class="stat-label">完成比赛</div>
          </div>
          <div class="stat-footer">
            今日 <span class="highlight">{{ activity.matches }}</span> 场
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card class="stat-card" shadow="hover">
          <div class="stat-icon" style="background: #f56c6c">
            <el-icon size="28"><ChatDotSquare /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalPosts }}</div>
            <div class="stat-label">帖子总数</div>
          </div>
          <div class="stat-footer">
            今日 <span class="highlight">{{ activity.posts }}</span> 篇
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <!-- 用户类型分布 -->
      <el-col :xs="24" :sm="24" :md="12">
        <el-card>
          <template #header>
            <span>用户类型分布</span>
          </template>
          <div class="chart-container" v-loading="loading">
            <div v-for="item in userStats.byType" :key="item.user_type" class="bar-item">
              <div class="bar-label">{{ typeLabels[item.user_type] || item.user_type }}</div>
              <div class="bar-wrapper">
                <div class="bar" :style="{ width: getBarWidth(item.count, userStats.byType) }"></div>
              </div>
              <div class="bar-count">{{ item.count }}</div>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 学校用户排名 -->
      <el-col :xs="24" :sm="24" :md="12">
        <el-card>
          <template #header>
            <span>学校用户排名 TOP 10</span>
          </template>
          <div class="chart-container" v-loading="loading">
            <div v-for="(item, index) in userStats.bySchool" :key="item.school_name" class="rank-item">
              <span class="rank-num" :class="{ top3: index < 3 }">{{ index + 1 }}</span>
              <span class="rank-name">{{ item.school_name }}</span>
              <span class="rank-count">{{ item.count }} 人</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <!-- 赛事状态分布 -->
      <el-col :xs="24" :sm="24" :md="12">
        <el-card>
          <template #header>
            <span>赛事状态</span>
          </template>
          <div class="status-grid" v-loading="loading">
            <div v-for="item in eventStats.byStatus" :key="item.status" class="status-item">
              <el-tag :type="eventStatusTypes[item.status]" size="large">
                {{ eventStatusLabels[item.status] || item.status }}
              </el-tag>
              <span class="status-count">{{ item.count }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 今日活跃 -->
      <el-col :xs="24" :sm="24" :md="12">
        <el-card>
          <template #header>
            <span>今日活跃</span>
          </template>
          <div class="activity-grid" v-loading="loading">
            <div class="activity-item">
              <el-icon size="32" color="#409eff"><Location /></el-icon>
              <div class="activity-value">{{ activity.checkins }}</div>
              <div class="activity-label">签到次数</div>
            </div>
            <div class="activity-item">
              <el-icon size="32" color="#67c23a"><Connection /></el-icon>
              <div class="activity-value">{{ activity.matches }}</div>
              <div class="activity-label">完成比赛</div>
            </div>
            <div class="activity-item">
              <el-icon size="32" color="#e6a23c"><ChatDotSquare /></el-icon>
              <div class="activity-value">{{ activity.posts }}</div>
              <div class="activity-label">发布帖子</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'

const loading = ref(false)

const stats = ref({
  totalUsers: 0,
  totalEvents: 0,
  totalMatches: 0,
  totalPosts: 0,
  weekNewUsers: 0,
  ongoingEvents: 0
})

const userStats = ref({
  byType: [],
  bySchool: []
})

const eventStats = ref({
  byStatus: [],
  byType: []
})

const activity = ref({
  posts: 0,
  checkins: 0,
  matches: 0
})

const typeLabels = {
  student: '在校生',
  graduate: '毕业生',
  teacher: '老师',
  staff: '教职工'
}

const eventStatusLabels = {
  draft: '草稿',
  registration: '报名中',
  ongoing: '进行中',
  finished: '已结束',
  cancelled: '已取消'
}

const eventStatusTypes = {
  draft: 'info',
  registration: 'warning',
  ongoing: 'success',
  finished: '',
  cancelled: 'danger'
}

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

const getBarWidth = (count, data) => {
  const max = Math.max(...data.map(d => d.count))
  return max > 0 ? `${(count / max) * 100}%` : '0%'
}

const loadDashboard = async () => {
  try {
    const res = await fetch(`/api/admin/dashboard?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      stats.value = data.data
    }
  } catch (error) {
    console.error('加载概览失败:', error)
  }
}

const loadUserStats = async () => {
  try {
    const res = await fetch(`/api/admin/stats/users?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      userStats.value = data.data
    }
  } catch (error) {
    console.error('加载用户统计失败:', error)
  }
}

const loadEventStats = async () => {
  try {
    const res = await fetch(`/api/admin/stats/events?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      eventStats.value = data.data
    }
  } catch (error) {
    console.error('加载赛事统计失败:', error)
  }
}

const loadActivityStats = async () => {
  try {
    const res = await fetch(`/api/admin/stats/activity?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      activity.value = data.data.today
    }
  } catch (error) {
    console.error('加载活跃统计失败:', error)
  }
}

onMounted(async () => {
  loading.value = true
  await Promise.all([
    loadDashboard(),
    loadUserStats(),
    loadEventStats(),
    loadActivityStats()
  ])
  loading.value = false
})
</script>

<style scoped>
.page {
  padding: 20px;
}
.page-header {
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
}

.stat-card {
  position: relative;
  padding: 20px;
}
.stat-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}
.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}
.stat-info {
  margin-left: 20px;
  flex: 1;
}
.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
}
.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}
.stat-footer {
  width: 100%;
  margin-top: 15px;
  padding-top: 10px;
  border-top: 1px solid #ebeef5;
  font-size: 13px;
  color: #909399;
}
.stat-footer .highlight {
  color: #409eff;
  font-weight: bold;
}

.chart-container {
  min-height: 200px;
}
.bar-item {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}
.bar-label {
  width: 60px;
  font-size: 13px;
  color: #606266;
}
.bar-wrapper {
  flex: 1;
  height: 20px;
  background: #f5f7fa;
  border-radius: 10px;
  overflow: hidden;
  margin: 0 10px;
}
.bar {
  height: 100%;
  background: linear-gradient(90deg, #409eff, #67c23a);
  border-radius: 10px;
  transition: width 0.3s;
}
.bar-count {
  width: 50px;
  text-align: right;
  font-size: 14px;
  font-weight: bold;
  color: #303133;
}

.rank-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}
.rank-item:last-child {
  border-bottom: none;
}
.rank-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #909399;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}
.rank-num.top3 {
  background: linear-gradient(135deg, #f6d365, #fda085);
}
.rank-name {
  flex: 1;
  margin-left: 12px;
  font-size: 14px;
  color: #303133;
}
.rank-count {
  font-size: 14px;
  color: #909399;
}

.status-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 30px 0;
  min-height: 120px;
  align-items: center;
  align-content: center;
}
.status-item {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-count {
  font-size: 20px;
  font-weight: bold;
  color: #303133;
}

.activity-grid {
  display: flex;
  justify-content: space-around;
  padding: 30px 0;
  min-height: 120px;
}
.activity-item {
  text-align: center;
}
.activity-value {
  font-size: 32px;
  font-weight: bold;
  color: #303133;
  margin: 10px 0 5px;
}
.activity-label {
  font-size: 14px;
  color: #909399;
}

/* 移动端适配 */
@media screen and (max-width: 768px) {
  .page {
    padding: 12px;
  }
  .page-header h2 {
    font-size: 18px;
  }
  .stats-row {
    margin-bottom: 0;
  }
  .stats-row .el-col {
    margin-bottom: 12px;
  }
  .stat-card {
    padding: 12px;
  }
  .stat-icon {
    width: 44px;
    height: 44px;
  }
  .stat-icon .el-icon {
    font-size: 20px !important;
  }
  .stat-info {
    margin-left: 12px;
  }
  .stat-value {
    font-size: 20px;
  }
  .stat-label {
    font-size: 12px;
  }
  .stat-footer {
    font-size: 11px;
    margin-top: 10px;
    padding-top: 8px;
  }
  .chart-container {
    min-height: 150px;
  }
  .activity-grid {
    padding: 16px 0;
  }
  .activity-value {
    font-size: 24px;
  }
  .activity-label {
    font-size: 12px;
  }
}
</style>
