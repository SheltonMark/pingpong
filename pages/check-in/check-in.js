const app = getApp();

Page({
  data: {
    location: null,
    nearestPoint: null,
    distance: null,
    canCheckIn: false,
    records: [],
    monthlyCount: 0,
    isLoading: true,
    isCheckingIn: false,
    // 地图相关
    mapScale: 16,
    markers: [],
    circles: []
  },

  onLoad() {
    this.getLocation();
  },

  onShow() {
    this.loadRecords();
  },

  // 获取位置（会自动弹出授权弹窗）
  async getLocation() {
    try {
      // 先检查权限状态
      const setting = await wx.getSetting();
      if (setting.authSetting['scope.userLocation'] === false) {
        // 用户之前拒绝过，引导去设置页开启
        wx.showModal({
          title: '需要位置权限',
          content: '签到功能需要获取您的位置，请在设置中开启位置权限',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting();
            }
          }
        });
        this.setData({ isLoading: false });
        return;
      }

      const res = await wx.getLocation({
        type: 'gcj02',
        isHighAccuracy: true
      });

      if (res && res.latitude && res.longitude) {
        this.setData({
          location: { lat: res.latitude, lng: res.longitude }
        });
        this.loadNearestPoint();
      } else {
        throw new Error('获取位置数据无效');
      }
    } catch (error) {
      console.error('获取位置失败:', error);
      wx.showToast({ title: '需要位置权限才能签到', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  async loadNearestPoint() {
    if (!this.data.location) return;

    try {
      const res = await this.request('/api/checkin/points', {
        school_id: app.globalData.userInfo?.school_id,
        lat: this.data.location.lat,
        lng: this.data.location.lng
      });

      if (res.success && res.data.length > 0) {
        const point = res.data[0];
        const canCheckIn = point.distance <= point.radius;

        // 设置地图标记和范围圈
        const markers = [
          {
            id: 1,
            latitude: parseFloat(point.latitude),
            longitude: parseFloat(point.longitude),
            title: point.name,
            width: 28,
            height: 36,
            callout: {
              content: point.name,
              display: 'ALWAYS',
              fontSize: 13,
              borderRadius: 6,
              padding: 8,
              bgColor: '#10B981',
              color: '#fff',
              borderWidth: 0
            }
          },
          {
            id: 2,
            latitude: this.data.location.lat,
            longitude: this.data.location.lng,
            title: '我的位置',
            width: 24,
            height: 24,
            callout: {
              content: '我的位置',
              display: 'BYCLICK',
              fontSize: 12,
              borderRadius: 4,
              padding: 6,
              bgColor: '#3B82F6',
              color: '#fff'
            }
          }
        ];

        const circles = [
          {
            latitude: parseFloat(point.latitude),
            longitude: parseFloat(point.longitude),
            radius: point.radius,
            color: '#10B98133',
            fillColor: '#10B98122',
            strokeWidth: 2
          }
        ];

        this.setData({
          nearestPoint: point,
          distance: Math.round(point.distance),
          canCheckIn,
          markers,
          circles
        });
      }
    } catch (error) {
      console.error('获取签到点失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async loadRecords() {
    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    if (!userId) return;

    try {
      const res = await this.request('/api/checkin/records', {
        user_id: userId
      });

      if (res.success) {
        const records = res.data.records.map(r => ({
          ...r,
          date_label: this.formatDate(r.check_in_time),
          time_label: this.formatTime(r.check_in_time)
        }));

        this.setData({
          records,
          monthlyCount: res.data.monthly_count
        });
      }
    } catch (error) {
      console.error('获取签到记录失败:', error);
    }
  },

  async onCheckIn() {
    if (!this.data.canCheckIn || this.data.isCheckingIn) return;

    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    if (!app.globalData.isLoggedIn || !userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (!this.data.nearestPoint?.id) {
      wx.showToast({ title: '未找到签到点', icon: 'none' });
      return;
    }

    this.setData({ isCheckingIn: true });

    try {
      const res = await this.request('/api/checkin/check-in', {
        user_id: userId,
        point_id: this.data.nearestPoint.id,
        latitude: this.data.location.lat,
        longitude: this.data.location.lng
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '签到成功', icon: 'success' });
        this.loadRecords();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (error) {
      console.error('签到失败:', error);
      wx.showToast({ title: '签到失败', icon: 'none' });
    } finally {
      this.setData({ isCheckingIn: false });
    }
  },

  onRefreshLocation() {
    this.setData({ isLoading: true });
    this.getLocation();
  },

  // 点击地图上的标记
  onMarkerTap(e) {
    const markerId = e.markerId;
    if (markerId === 1 && this.data.nearestPoint) {
      wx.showToast({ title: this.data.nearestPoint.name, icon: 'none' });
    }
  },

  // 移动到当前位置
  moveToLocation() {
    const mapCtx = wx.createMapContext('checkInMap');
    mapCtx.moveToLocation({
      latitude: this.data.location?.lat,
      longitude: this.data.location?.lng
    });
  },

  formatDate(dateStr) {
    const date = new Date(dateStr);
    const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${date.getMonth() + 1}月${date.getDate()}日 ${weekDays[date.getDay()]}`;
  },

  formatTime(dateStr) {
    const date = new Date(dateStr);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});
