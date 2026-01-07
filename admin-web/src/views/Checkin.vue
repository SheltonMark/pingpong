<template>
  <div class="page">
    <div class="page-header">
      <h2>签到点管理</h2>
      <el-button type="primary" @click="showCreateDialog">
        <el-icon><Plus /></el-icon>
        添加签到点
      </el-button>
    </div>

    <el-card>
      <el-table :data="points" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="名称" min-width="150" />
        <el-table-column label="位置" min-width="200">
          <template #default="{ row }">
            <span class="location-text">{{ row.latitude }}, {{ row.longitude }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="radius" label="有效半径" width="100">
          <template #default="{ row }">
            {{ row.radius }}米
          </template>
        </el-table-column>
        <el-table-column prop="school_name" label="所属学校" width="150" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'">
              {{ row.status === 'active' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="editPoint(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="deletePoint(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 创建/编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑签到点' : '添加签到点'"
      width="700px"
      @opened="initMap"
      @closed="destroyMap"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：体育馆乒乓球室" />
        </el-form-item>

        <el-form-item label="搜索地址">
          <el-input
            v-model="searchAddress"
            placeholder="输入地址搜索，如：浙江工业大学体育馆"
            @keyup.enter="searchLocation"
          >
            <template #append>
              <el-button @click="searchLocation">搜索</el-button>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item label="地图选点">
          <div class="map-container" id="mapContainer">
            <div class="map-tip">点击地图选择位置</div>
          </div>
        </el-form-item>

        <el-form-item label="已选坐标">
          <div class="coord-display">
            <span>纬度: <strong>{{ form.latitude || '未选择' }}</strong></span>
            <span style="margin-left: 20px">经度: <strong>{{ form.longitude || '未选择' }}</strong></span>
          </div>
        </el-form-item>

        <el-form-item label="有效半径">
          <el-slider
            v-model="form.radius"
            :min="10"
            :max="500"
            :step="10"
            show-input
            @change="updateCircle"
          />
          <span class="radius-hint">用户需在此范围内才能签到</span>
        </el-form-item>

        <el-form-item label="所属学校">
          <el-select v-model="form.school_id" clearable placeholder="请选择（可选）">
            <el-option v-for="s in schools" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const loading = ref(false)
const points = ref([])
const schools = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const submitting = ref(false)
const searchAddress = ref('')

let map = null
let marker = null
let circle = null

const form = ref({
  name: '',
  latitude: '',
  longitude: '',
  radius: 100,
  school_id: null
})

const getUserId = () => {
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}')
  return user.id
}

// 初始化地图
const initMap = () => {
  nextTick(() => {
    if (!window.TMap) {
      ElMessage.warning('地图加载中，请稍候...')
      return
    }

    const container = document.getElementById('mapContainer')
    if (!container) return

    // 默认中心点（杭州）
    const defaultCenter = new window.TMap.LatLng(30.2741, 120.1551)

    // 如果有已选坐标，使用已选坐标
    let center = defaultCenter
    if (form.value.latitude && form.value.longitude) {
      center = new window.TMap.LatLng(
        parseFloat(form.value.latitude),
        parseFloat(form.value.longitude)
      )
    }

    map = new window.TMap.Map(container, {
      center: center,
      zoom: 16,
      viewMode: '2D'
    })

    // 点击地图选点
    map.on('click', (e) => {
      const lat = e.latLng.getLat().toFixed(6)
      const lng = e.latLng.getLng().toFixed(6)
      form.value.latitude = lat
      form.value.longitude = lng
      updateMarker(e.latLng)
    })

    // 如果编辑模式，显示已有标记
    if (form.value.latitude && form.value.longitude) {
      updateMarker(center)
    }
  })
}

// 更新标记点
const updateMarker = (position) => {
  // 移除旧标记
  if (marker) {
    marker.setMap(null)
  }
  if (circle) {
    circle.setMap(null)
  }

  // 添加新标记
  marker = new window.TMap.MultiMarker({
    map: map,
    styles: {
      default: new window.TMap.MarkerStyle({
        width: 30,
        height: 40,
        anchor: { x: 15, y: 40 }
      })
    },
    geometries: [{
      id: 'point',
      position: position
    }]
  })

  // 添加范围圆圈
  circle = new window.TMap.MultiCircle({
    map: map,
    styles: {
      default: new window.TMap.CircleStyle({
        color: 'rgba(64, 158, 255, 0.2)',
        borderColor: 'rgba(64, 158, 255, 0.8)',
        borderWidth: 2
      })
    },
    geometries: [{
      id: 'circle',
      center: position,
      radius: form.value.radius
    }]
  })

  // 移动地图中心
  map.setCenter(position)
}

// 更新圆圈半径
const updateCircle = () => {
  if (circle && form.value.latitude && form.value.longitude) {
    circle.updateGeometries([{
      id: 'circle',
      center: new window.TMap.LatLng(
        parseFloat(form.value.latitude),
        parseFloat(form.value.longitude)
      ),
      radius: form.value.radius
    }])
  }
}

// 搜索地址
const searchLocation = async () => {
  if (!searchAddress.value) {
    ElMessage.warning('请输入地址')
    return
  }

  try {
    // 使用腾讯地图搜索服务
    const searchService = new window.TMap.service.Search({
      pageSize: 1
    })

    const result = await searchService.searchRegion({
      keyword: searchAddress.value,
      boundary: 'region(全国,0)'
    })

    if (result.data && result.data.length > 0) {
      const poi = result.data[0]
      const position = poi.location
      form.value.latitude = position.lat.toFixed(6)
      form.value.longitude = position.lng.toFixed(6)

      const latLng = new window.TMap.LatLng(position.lat, position.lng)
      updateMarker(latLng)
      map.setZoom(17)

      ElMessage.success(`已定位到: ${poi.title}`)
    } else {
      ElMessage.warning('未找到该地址')
    }
  } catch (error) {
    console.error('搜索失败:', error)
    ElMessage.error('搜索失败，请重试')
  }
}

// 销毁地图
const destroyMap = () => {
  if (map) {
    map.destroy()
    map = null
    marker = null
    circle = null
  }
}

const loadPoints = async () => {
  loading.value = true
  try {
    const res = await fetch(`/api/admin/checkin-points?user_id=${getUserId()}`)
    const data = await res.json()
    if (data.success) {
      points.value = data.data || []
    }
  } catch (error) {
    console.error('加载签到点失败:', error)
    ElMessage.error('加载失败')
  } finally {
    loading.value = false
  }
}

const loadSchools = async () => {
  try {
    const res = await fetch('/api/common/schools')
    const data = await res.json()
    if (data.success) {
      schools.value = data.data || []
    }
  } catch (error) {
    console.error('加载学校失败:', error)
  }
}

const showCreateDialog = () => {
  isEdit.value = false
  form.value = { name: '', latitude: '', longitude: '', radius: 100, school_id: null }
  searchAddress.value = ''
  dialogVisible.value = true
}

const editPoint = (row) => {
  isEdit.value = true
  form.value = { ...row }
  searchAddress.value = ''
  dialogVisible.value = true
}

const submitForm = async () => {
  if (!form.value.name) {
    ElMessage.warning('请填写签到点名称')
    return
  }
  if (!form.value.latitude || !form.value.longitude) {
    ElMessage.warning('请在地图上选择位置')
    return
  }

  submitting.value = true
  try {
    const url = isEdit.value
      ? `/api/admin/checkin-points/${form.value.id}`
      : '/api/admin/checkin-points'
    const method = isEdit.value ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form.value, user_id: getUserId() })
    })
    const data = await res.json()

    if (data.success) {
      ElMessage.success(isEdit.value ? '更新成功' : '添加成功')
      dialogVisible.value = false
      loadPoints()
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

const deletePoint = async (row) => {
  try {
    await ElMessageBox.confirm('确定要删除这个签到点吗？', '提示', { type: 'warning' })

    const res = await fetch(`/api/admin/checkin-points/${row.id}?user_id=${getUserId()}`, { method: 'DELETE' })
    const data = await res.json()

    if (data.success) {
      ElMessage.success('删除成功')
      loadPoints()
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

onMounted(() => {
  loadPoints()
  loadSchools()
})
</script>

<style scoped>
.page { padding: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.page-header h2 { margin: 0; }

.location-text {
  font-family: monospace;
  font-size: 12px;
  color: #666;
}

.map-container {
  width: 100%;
  height: 300px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  position: relative;
  background: #f5f7fa;
}

.map-tip {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.6);
  color: #fff;
  padding: 5px 15px;
  border-radius: 4px;
  font-size: 12px;
  z-index: 100;
  pointer-events: none;
}

.coord-display {
  padding: 10px 15px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 14px;
}

.coord-display strong {
  color: #409eff;
  font-family: monospace;
}

.radius-hint {
  font-size: 12px;
  color: #909399;
  margin-left: 10px;
}

:deep(.el-slider) {
  flex: 1;
}
</style>
