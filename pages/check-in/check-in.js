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
    isCheckingIn: false
  },

  onLoad() {
    this.getLocation();
  },

  onShow() {
    this.loadRecords();
  },

  async getLocation() {
    try {
      const res = await wx.getLocation({
        type: 'gcj02',
        isHighAccuracy: true
      });

      this.setData({
        location: { lat: res.latitude, lng: res.longitude }
      });

      this.loadNearestPoint();
    } catch (error) {
      console.error('获取位置失败:', error);
      wx.showToast({ title: '请开启定位权限', icon: 'none' });
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

        this.setData({
          nearestPoint: point,
          distance: Math.round(point.distance),
          canCheckIn
        });
      }
    } catch (error) {
      console.error('获取签到点失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async loadRecords() {
    if (!app.globalData.userInfo?.id) return;

    try {
      const res = await this.request('/api/checkin/records', {
        user_id: app.globalData.userInfo.id
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
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    this.setData({ isCheckingIn: true });

    try {
      const res = await this.request('/api/checkin/check-in', {
        user_id: app.globalData.userInfo.id,
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
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.baseUrl + url,
        method,
        data,
        success: (res) => resolve(res.data),
        fail: reject
      });
    });
  }
});
