<template>
  <div class="page">
    <div class="page-header">
      <h2>赛事管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        创建赛事
      </el-button>
    </div>

    <el-card>
      <el-table :data="events" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="title" label="赛事名称" min-width="150" />
        <el-table-column prop="scope" label="范围" width="80">
          <template #default="{ row }">
            {{ scopeLabels[row.scope] || row.scope }}
          </template>
        </el-table-column>
        <el-table-column prop="school_name" label="所属学校" width="120">
          <template #default="{ row }">
            {{ row.school_name || '全局' }}
          </template>
        </el-table-column>
        <el-table-column prop="event_type" label="类型" width="80">
          <template #default="{ row }">
            {{ typeLabels[row.event_type] || row.event_type }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" min-width="120">
          <template #default="{ row }">
            <el-tag :type="statusTypes[row.status]">
              {{ statusLabels[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="160">
          <template #default="{ row }">
            {{ formatDateTime(row.event_start) }}
          </template>
        </el-table-column>
        <el-table-column prop="location" label="地点" width="120" />
        <el-table-column prop="participant_count" label="报名人数" width="100" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="viewRegistrations(row)">查看报名</el-button>
            <el-button size="small" @click="editEvent(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deleteEvent(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑赛事' : '创建赛事'" width="600px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="赛事名称" required>
          <el-input v-model="form.title" placeholder="请输入赛事名称" />
        </el-form-item>
        <el-form-item label="赛事范围" required>
          <el-select v-model="form.scope" placeholder="请选择范围">
            <el-option label="校内赛" value="school" />
            <el-option label="校际赛" value="inter_school" />
          </el-select>
        </el-form-item>
        <el-form-item label="赛事类型" required>
          <el-select v-model="form.event_type" placeholder="请选择类型" @change="onEventTypeChange">
            <el-option label="单打" value="singles" />
            <el-option label="双打" value="doubles" />
            <el-option label="团体" value="team" />
          </el-select>
        </el-form-item>

        <!-- 团体赛配置 -->
        <template v-if="form.event_type === 'team'">
          <el-divider content-position="left">团体赛配置</el-divider>

          <el-form-item label="队伍人数" required>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span>最少</span>
              <el-input-number v-model="form.min_team_players" :min="2" :max="20" />
              <span>人，最多</span>
              <el-input-number v-model="form.max_team_players" :min="2" :max="20" />
              <span>人</span>
            </div>
          </el-form-item>

          <el-form-item label="比赛项目" required>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <el-checkbox v-model="form.team_event_config.projects.men_singles.enabled">男单</el-checkbox>
                <template v-if="form.team_event_config.projects.men_singles.enabled">
                  <el-input-number
                    v-model="form.team_event_config.projects.men_singles.count"
                    :min="1"
                    :max="5"
                    size="small"
                    style="width: 120px;"
                  />
                  <span>人</span>
                </template>
              </div>

              <div style="display: flex; align-items: center; gap: 10px;">
                <el-checkbox v-model="form.team_event_config.projects.women_singles.enabled">女单</el-checkbox>
                <template v-if="form.team_event_config.projects.women_singles.enabled">
                  <el-input-number
                    v-model="form.team_event_config.projects.women_singles.count"
                    :min="1"
                    :max="5"
                    size="small"
                    style="width: 120px;"
                  />
                  <span>人</span>
                </template>
              </div>

              <div style="display: flex; align-items: center; gap: 10px;">
                <el-checkbox v-model="form.team_event_config.projects.men_doubles.enabled">男双</el-checkbox>
                <template v-if="form.team_event_config.projects.men_doubles.enabled">
                  <el-input-number
                    v-model="form.team_event_config.projects.men_doubles.count"
                    :min="1"
                    :max="5"
                    size="small"
                    style="width: 120px;"
                  />
                  <span>对</span>
                </template>
              </div>

              <div style="display: flex; align-items: center; gap: 10px;">
                <el-checkbox v-model="form.team_event_config.projects.women_doubles.enabled">女双</el-checkbox>
                <template v-if="form.team_event_config.projects.women_doubles.enabled">
                  <el-input-number
                    v-model="form.team_event_config.projects.women_doubles.count"
                    :min="1"
                    :max="5"
                    size="small"
                    style="width: 120px;"
                  />
                  <span>对</span>
                </template>
              </div>

              <div style="display: flex; align-items: center; gap: 10px;">
                <el-checkbox v-model="form.team_event_config.projects.mixed_doubles.enabled">混双</el-checkbox>
                <template v-if="form.team_event_config.projects.mixed_doubles.enabled">
                  <el-input-number
                    v-model="form.team_event_config.projects.mixed_doubles.count"
                    :min="1"
                    :max="5"
                    size="small"
                    style="width: 120px;"
                  />
                  <span>对</span>
                </template>
              </div>
            </div>
            <div style="margin-top: 8px; color: #909399; font-size: 12px;">
              勾选启用的项目，并设置每个项目需要的人数/对数
            </div>
          </el-form-item>

          <el-form-item label="性别规则" required>
            <el-select v-model="form.gender_rule" placeholder="请选择性别规则" @change="onGenderRuleChange">
              <el-option label="不限" value="unlimited" />
              <el-option label="仅男生" value="male_only" />
              <el-option label="仅女生" value="female_only" />
              <el-option label="固定男女人数" value="fixed" />
              <el-option label="最少男女人数" value="minimum" />
            </el-select>
          </el-form-item>

          <el-form-item
            v-if="form.gender_rule === 'fixed' || form.gender_rule === 'minimum'"
            :label="form.gender_rule === 'fixed' ? '固定人数' : '最少人数'"
          >
            <div style="display: flex; align-items: center; gap: 10px;">
              <span>男生</span>
              <el-input-number v-model="form.required_male_count" :min="0" :max="20" />
              <span>人，女生</span>
              <el-input-number v-model="form.required_female_count" :min="0" :max="20" />
              <span>人</span>
            </div>
          </el-form-item>
        </template>

        <el-form-item label="赛制" required>
          <el-select v-model="form.event_format" placeholder="请选择赛制">
            <el-option label="淘汰赛" value="knockout" />
            <el-option label="循环赛" value="round_robin" />
            <el-option label="小组+淘汰" value="group_knockout" />
          </el-select>
        </el-form-item>
        <el-form-item label="几局几胜">
          <div style="display: flex; align-items: center; gap: 10px;">
            <el-input-number v-model="form.best_of" :min="1" :max="21" />
            <span>局</span>
            <el-input-number v-model="form.games_to_win" :min="1" :max="11" />
            <span>胜</span>
          </div>
        </el-form-item>
        <el-form-item label="计入积分">
          <el-switch v-model="form.counts_for_ranking" />
          <span style="margin-left: 10px; color: #909399">开启后比赛结果将计入用户积分</span>
        </el-form-item>
        <el-form-item label="开始时间" required>
          <el-date-picker
            v-model="form.event_start"
            type="datetime"
            placeholder="选择日期时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="地点">
          <el-input v-model="form.location" placeholder="请输入比赛地点" />
        </el-form-item>
        <el-form-item :label="form.event_type === 'team' ? '最大队伍数' : '最大人数'">
          <el-input-number v-model="form.max_participants" :min="2" :max="256" />
          <span v-if="form.event_type === 'team'" style="margin-left: 10px; color: #909399">
            限制参赛队伍的数量
          </span>
        </el-form-item>
        <el-form-item label="报名截止">
          <el-date-picker
            v-model="form.registration_end"
            type="datetime"
            placeholder="选择报名截止时间"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
        <el-form-item label="赛事说明">
          <div class="editor-container">
            <Toolbar
              style="border-bottom: 1px solid #ccc"
              :editor="editorRef"
              :defaultConfig="toolbarConfig"
              mode="default"
            />
            <Editor
              style="height: 200px; overflow-y: auto;"
              v-model="form.description"
              :defaultConfig="editorConfig"
              mode="default"
              @onCreated="handleCreated"
            />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 报名详情对话框 -->
    <el-dialog
      v-model="regDialogVisible"
      :title="regEvent ? regEvent.title + ' - 报名情况' : '报名情况'"
      width="min(900px, 92vw)"
      class="registrations-dialog"
    >
      <div class="reg-toolbar">
        <span class="reg-count">共 {{ regData.length }} 条报名记录</span>
        <el-button type="success" @click="exportRegistrations">导出报名表</el-button>
      </div>

      <el-table :data="regData" v-loading="regLoading" stripe max-height="500" table-layout="auto" class="reg-table">
        <el-table-column prop="name" label="姓名" min-width="120" />
        <el-table-column prop="gender" label="性别" width="80">
          <template #default="{ row }">
            {{ row.gender === 'male' ? '男' : row.gender === 'female' ? '女' : row.gender || '' }}
          </template>
        </el-table-column>
        <el-table-column prop="school_name" label="学校" min-width="220" />
        <el-table-column prop="college_name" label="学院" min-width="180" />
        <el-table-column prop="team_name" label="队伍" min-width="180" v-if="regEvent && regEvent.event_type === 'team'" />
        <el-table-column prop="is_team_leader" label="队长" width="80" v-if="regEvent && regEvent.event_type === 'team'">
          <template #default="{ row }">
            {{ row.is_team_leader ? '是' : '' }}
          </template>
        </el-table-column>
        <el-table-column prop="is_participating" label="参赛" width="80" v-if="regEvent && regEvent.event_type === 'team'">
          <template #default="{ row }">
            {{ row.is_participating ? '是' : '否' }}
          </template>
        </el-table-column>
        <el-table-column prop="is_singles_player" label="单打" width="80" v-if="regEvent && regEvent.event_type === 'team'">
          <template #default="{ row }">
            {{ row.is_singles_player ? '是' : '' }}
          </template>
        </el-table-column>
        <el-table-column prop="projects" label="参赛项目" min-width="200" v-if="regEvent && regEvent.event_type === 'team' && regEvent.team_event_config">
          <template #default="{ row }">
            <el-tag
              v-for="project in row.projects"
              :key="project"
              size="small"
              style="margin-right: 4px;"
            >
              {{ getProjectLabel(project) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="partner_name" label="搭档" min-width="140" v-if="regEvent && regEvent.event_type === 'doubles'" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'confirmed' ? 'success' : row.status === 'waiting_partner' ? 'warning' : 'info'" size="small">
              {{ row.status === 'confirmed' ? '已确认' : row.status === 'pending' ? '待确认' : row.status === 'waiting_partner' ? '等待配对' : row.status }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ElMessage, ElMessageBox } from 'element-plus'
import { formatDateTime } from '../utils/format'
import { ref, shallowRef, onMounted } from 'vue'
import '@wangeditor/editor/dist/css/style.css'
import { Editor, Toolbar } from '@wangeditor/editor-for-vue'

const loading = ref(false)
const events = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const editorRef = shallowRef()

// 报名详情
const regDialogVisible = ref(false)
const regLoading = ref(false)
const regEvent = ref(null)
const regData = ref([])

const toolbarConfig = {
  excludeKeys: ['fullScreen', 'group-video']
}

const editorConfig = {
  placeholder: '请输入赛事说明，支持插入图片...',
  hoverbarKeys: {},
  MENU_CONF: {
    uploadImage: {
      server: '/api/upload/file',
      fieldName: 'file',
      maxFileSize: 5 * 1024 * 1024,
      allowedFileTypes: ['image/*'],
      customInsert(res, insertFn) {
        if (res.success) {
          insertFn(res.data.url, '', '')
        } else {
          ElMessage.error(res.message || '图片上传失败')
        }
      }
    }
  }
}

const handleCreated = (editor) => {
  editorRef.value = editor
}

const form = ref({
  title: '',
  scope: 'school',
  event_type: 'singles',
  event_format: 'knockout',
  best_of: 5,
  games_to_win: 3,
  counts_for_ranking: true,
  event_start: '',
  location: '',
  max_participants: 32,
  registration_end: '',
  description: '',
  // 团体赛配置
  min_team_players: 3,
  max_team_players: 5,
  singles_player_count: 2,
  gender_rule: 'unlimited',
  required_male_count: 0,
  required_female_count: 0,
  team_event_config: {
    projects: {
      men_singles: { enabled: false, count: 2 },
      women_singles: { enabled: false, count: 2 },
      men_doubles: { enabled: false, count: 2 },
      women_doubles: { enabled: false, count: 0 },
      mixed_doubles: { enabled: false, count: 1 }
    }
  }
})

// 赛事类型改变时重置团体赛配置
const onEventTypeChange = (value) => {
  if (value === 'team') {
    form.value.min_team_players = 3
    form.value.max_team_players = 5
    form.value.singles_player_count = 2
    form.value.gender_rule = 'unlimited'
    form.value.required_male_count = 0
    form.value.required_female_count = 0
    form.value.team_event_config = {
      projects: {
        men_singles: { enabled: false, count: 2 },
        women_singles: { enabled: false, count: 2 },
        men_doubles: { enabled: false, count: 2 },
        women_doubles: { enabled: false, count: 0 },
        mixed_doubles: { enabled: false, count: 1 }
      }
    }
  }
}

// 性别规则改变时重置人数
const onGenderRuleChange = (value) => {
  if (value === 'unlimited' || value === 'male_only' || value === 'female_only') {
    form.value.required_male_count = 0
    form.value.required_female_count = 0
  } else if (value === 'fixed' || value === 'minimum') {
    form.value.required_male_count = 1
    form.value.required_female_count = 1
  }
}

const scopeLabels = {
  school: '校内赛',
  inter_school: '校际赛'
}

const typeLabels = {
  singles: '单打',
  doubles: '双打',
  team: '团体'
}

const statusLabels = {
  draft: '草稿',
  registration: '报名中',
  pending_start: '待开始',
  ongoing: '进行中',
  finished: '已结束'
}

const statusTypes = {
  draft: 'info',
  registration: 'warning',
  pending_start: 'primary',
  ongoing: 'success',
  finished: ''
}

const projectLabels = {
  men_singles: '男单',
  women_singles: '女单',
  men_doubles: '男双',
  women_doubles: '女双',
  mixed_doubles: '混双'
}

const getProjectLabel = (project) => {
  return projectLabels[project] || project
}

const getAdminUser = () => {
  return JSON.parse(localStorage.getItem('adminUser') || '{}')
}

const loadEvents = async () => {
  loading.value = true
  try {
    const user = getAdminUser()
    // 添加时间戳避免缓存
    const timestamp = new Date().getTime()
    const res = await fetch(`/api/admin/events?user_id=${user.id}&_t=${timestamp}`)
    const data = await res.json()
    if (data.success) {
      events.value = data.data || []
    }
  } catch (error) {
    console.error('加载赛事失败:', error)
    ElMessage.error('加载赛事失败')
  } finally {
    loading.value = false
  }
}

const showCreateDialog = () => {
  isEdit.value = false
  form.value = {
    title: '',
    scope: 'school',
    event_type: 'singles',
    event_format: 'knockout',
    best_of: 5,
    games_to_win: 3,
    counts_for_ranking: true,
    event_start: '',
    location: '',
    max_participants: 32,
    registration_end: '',
    description: '',
    status: 'registration',
    // 团体赛配置
    min_team_players: 3,
    max_team_players: 5,
    singles_player_count: 2,
    gender_rule: 'unlimited',
    required_male_count: 0,
    required_female_count: 0,
  }
  dialogVisible.value = true
}

const editEvent = (row) => {
  isEdit.value = true
  form.value = {
    ...row,
    description: row.description || '',
    // 确保团体赛配置字段有默认值
    min_team_players: row.min_team_players || 3,
    max_team_players: row.max_team_players || 5,
    singles_player_count: row.singles_player_count || 2,
    gender_rule: row.gender_rule || 'unlimited',
    required_male_count: row.required_male_count || 0,
    required_female_count: row.required_female_count || 0,
    team_event_config: row.team_event_config || {
      projects: {
        men_singles: { enabled: false, count: 2 },
        women_singles: { enabled: false, count: 2 },
        men_doubles: { enabled: false, count: 2 },
        women_doubles: { enabled: false, count: 0 },
        mixed_doubles: { enabled: false, count: 1 }
      }
    }
  }
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.value.title) {
    ElMessage.warning('请输入赛事名称')
    return
  }
  if (!form.value.event_start) {
    ElMessage.warning('请选择开始时间')
    return
  }

  // 团体赛校验
  if (form.value.event_type === 'team') {
    if (!form.value.min_team_players || !form.value.max_team_players) {
      ElMessage.warning('请设置队伍人数范围')
      return
    }
    if (form.value.min_team_players > form.value.max_team_players) {
      ElMessage.warning('最少人数不能大于最多人数')
      return
    }
    if (!form.value.singles_player_count) {
      ElMessage.warning('请设置单打人数')
      return
    }
    if (form.value.singles_player_count > form.value.max_team_players) {
      ElMessage.warning('单打人数不能超过队伍最多人数')
      return
    }
    if (form.value.gender_rule === 'fixed' || form.value.gender_rule === 'minimum') {
      const totalRequired = form.value.required_male_count + form.value.required_female_count
      if (totalRequired > form.value.max_team_players) {
        ElMessage.warning('要求的男女人数总和不能超过队伍最多人数')
        return
      }
      if (form.value.gender_rule === 'fixed' && totalRequired !== form.value.min_team_players) {
        ElMessage.warning('固定性别规则下，男女人数总和应等于最少人数')
        return
      }
    }
  }

  submitting.value = true
  try {
    const user = getAdminUser()
    const url = isEdit.value
      ? `/api/admin/events/${form.value.id}`
      : '/api/admin/events'
    const method = isEdit.value ? 'PUT' : 'POST'

    const saveData = {
      ...form.value,
      description: form.value.description || '',
      user_id: user.id,
      school_id: user.school_id || null
    }

    // 处理动态计算的状态：pending_start 不是数据库中的真实状态
    // 编辑时如果状态是 pending_start，转换为 registration
    if (saveData.status === 'pending_start') {
      saveData.status = 'registration'
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saveData)
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '创建成功')
      dialogVisible.value = false
      loadEvents()
    } else {
      ElMessage.error(data.message || '操作失败')
    }
  } catch (error) {
    console.error('提交失败:', error)
    ElMessage.error('操作失败')
  } finally {
    submitting.value = false
  }
}

const deleteEvent = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这个赛事吗？', '提示', {
      type: 'warning'
    })

    const user = getAdminUser()
    const res = await fetch(`/api/admin/events/${row.id}?user_id=${user.id}`, {
      method: 'DELETE'
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('删除成功')
      loadEvents()
    } else {
      ElMessage.error(data.message || '删除失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }
}

// 查看报名情况
const viewRegistrations = async (row) => {
  regEvent.value = row
  regDialogVisible.value = true
  regLoading.value = true
  regData.value = []

  try {
    const user = getAdminUser()

    // 团体赛使用不同的接口
    if (row.event_type === 'team') {
      const res = await fetch(`/api/admin/teams?event_id=${row.id}&user_id=${user.id}`)
      const data = await res.json()
      if (data.success) {
        // 将队伍数据转换为报名列表格式（展开队员）
        const teams = data.data || []
        const registrations = []
        teams.forEach(team => {
          // 添加领队
          const captainMember = team.members?.find(m => m.user_id === team.captain_id)
          registrations.push({
            name: team.captain_name,
            gender: team.captain_gender,
            phone: team.captain_phone,
            school_name: captainMember?.school_name || '',
            college_name: captainMember?.college_name || '',
            team_name: team.team_name,
            is_team_leader: 1,
            is_participating: team.leader_participating,
            is_singles_player: captainMember?.is_singles_player || 0,
            projects: captainMember?.projects || [],
            status: 'confirmed'
          })
          // 添加队员
          if (team.members) {
            team.members.forEach(member => {
              if (!member.is_team_leader) {
                registrations.push({
                  name: member.name,
                  gender: member.gender,
                  phone: member.phone,
                  school_name: member.school_name || '',
                  college_name: member.college_name || '',
                  team_name: team.team_name,
                  is_team_leader: 0,
                  is_participating: member.is_participating,
                  is_singles_player: member.is_singles_player,
                  projects: member.projects || [],
                  status: member.status
                })
              }
            })
          }
        })
        regData.value = registrations
      }
    } else {
      // 单打/双打使用原有接口
      const res = await fetch(`/api/admin/events/${row.id}/registrations?user_id=${user.id}`)
      const data = await res.json()
      if (data.success) {
        regData.value = data.data.registrations || []
      }
    }
  } catch (error) {
    console.error('加载报名数据失败:', error)
    ElMessage.error('加载报名数据失败')
  } finally {
    regLoading.value = false
  }
}

// 导出报名表
const exportRegistrations = async () => {
  if (!regEvent.value) return
  try {
    const user = getAdminUser()

    // 团体赛使用不同的导出接口
    if (regEvent.value.event_type === 'team') {
      const res = await fetch(`/api/admin/teams/export?event_id=${regEvent.value.id}&user_id=${user.id}`)
      const data = await res.json()

      if (data.success) {
        const rows = data.data.rows || []
        const config = data.data.config || null

        if (rows.length === 0) {
          ElMessage.warning('暂无报名数据')
          return
        }

        // 动态构建表头
        const baseHeaders = ['姓名', '性别', '电话号码', '学校', '学院', '团体']
        const projectHeaders = []

        // 根据配置添加项目列
        if (config && config.projects) {
          if (config.projects.men_singles?.enabled) projectHeaders.push('男单')
          if (config.projects.women_singles?.enabled) projectHeaders.push('女单')
          if (config.projects.men_doubles?.enabled) projectHeaders.push('男双')
          if (config.projects.women_doubles?.enabled) projectHeaders.push('女双')
          if (config.projects.mixed_doubles?.enabled) projectHeaders.push('混双')
        }

        const headers = [...baseHeaders, ...projectHeaders]

        // 构建CSV内容
        const csvContent = [
          headers.join(','),
          ...rows.map(row => {
            const baseData = [
              `"${row.name}"`,
              row.gender,
              row.phone,
              `"${row.school_name}"`,
              `"${row.college_name}"`,
              row.is_team
            ]

            const projectData = []
            if (config && config.projects) {
              if (config.projects.men_singles?.enabled) projectData.push(row.men_singles || '')
              if (config.projects.women_singles?.enabled) projectData.push(row.women_singles || '')
              if (config.projects.men_doubles?.enabled) projectData.push(row.men_doubles || '')
              if (config.projects.women_doubles?.enabled) projectData.push(row.women_doubles || '')
              if (config.projects.mixed_doubles?.enabled) projectData.push(row.mixed_doubles || '')
            }

            return [...baseData, ...projectData].join(',')
          })
        ].join('\n')

        // 添加BOM以支持Excel正确显示中文
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `团体赛报名表_${regEvent.value.title}_${new Date().toISOString().slice(0, 10)}.csv`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        ElMessage.success('导出成功')
      } else {
        ElMessage.error(data.message || '导出失败')
      }
    } else {
      // 单打/双打使用原有导出接口
      const res = await fetch(`/api/admin/events/${regEvent.value.id}/registrations/export?user_id=${user.id}`)
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `报名表_${regEvent.value.title}_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    }
  } catch (error) {
    console.error('导出失败:', error)
    ElMessage.error('导出失败')
  }
}

onMounted(() => {
  loadEvents()
})
</script>

<style scoped>
.reg-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.reg-count {
  color: #606266;
  font-size: 14px;
}

.reg-table {
  width: 100%;
}

.page {
  padding: 20px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.page-header h2 {
  margin: 0;
}

.editor-container {
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 100%;
  position: relative;
  z-index: 10;
}
</style>

<style>
/* 隐藏 wangEditor 悬浮工具栏 */
.w-e-hover-bar {
  display: none !important;
}
</style>
