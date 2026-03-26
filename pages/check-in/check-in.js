const app = getApp();

Page({
  data: {
    location: null,
    nearestPoint: null,
    activeRecord: null,
    distance: null,
    canSubmit: false,
    actionMode: 'check_in',
    actionButtonText: '立即签到',
    records: [],
    monthlyCount: 0,
    isLoading: true,
    isSubmitting: false,
    timeStatus: 'ok',
    timeRangeText: '',
    mapScale: 16,
    markers: [],
    circles: []
  },

  async onLoad() {
    await this.loadRecords();
    this.getLocation();
  },

  async onShow() {
    await this.loadRecords();
    if (this.data.location) {
      this.loadNearestPoint();
    }
  },

  async getLocation() {
    try {
      const setting = await wx.getSetting();
      if (setting.authSetting['scope.userLocation'] === false) {
        wx.showModal({
          title: '需要位置权限',
          content: '签到和签退都需要获取你的位置，请在设置中开启位置权限。',
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

      if (!res || !res.latitude || !res.longitude) {
        throw new Error('Invalid location');
      }

      this.setData({
        location: { lat: res.latitude, lng: res.longitude }
      });
      await this.loadNearestPoint();
    } catch (error) {
      console.error('Get location failed:', error);
      wx.showToast({ title: '需要位置权限才能签到', icon: 'none' });
      this.setData({ isLoading: false });
    }
  },

  buildTargetPoint(points = []) {
    const activeRecord = this.data.activeRecord;
    if (activeRecord?.point_id) {
      const matchedPoint = points.find((item) => parseInt(item.id, 10) === parseInt(activeRecord.point_id, 10));
      if (matchedPoint) {
        return matchedPoint;
      }

      if (activeRecord.point_latitude && activeRecord.point_longitude) {
        return {
          id: activeRecord.point_id,
          name: activeRecord.point_name,
          latitude: activeRecord.point_latitude,
          longitude: activeRecord.point_longitude,
          radius: activeRecord.point_radius,
          start_time: activeRecord.start_time,
          end_time: activeRecord.end_time,
          distance: this.calculateDistance(
            this.data.location.lat,
            this.data.location.lng,
            activeRecord.point_latitude,
            activeRecord.point_longitude
          )
        };
      }
    }

    return points[0] || null;
  },

  buildActionButtonText(actionMode, canSubmit, timeStatus) {
    if (actionMode === 'check_out') {
      return canSubmit ? '立即签退' : '请回到签到点签退';
    }

    if (canSubmit) {
      return '立即签到';
    }
    if (timeStatus === 'not_started') {
      return '未到签到时间';
    }
    if (timeStatus === 'ended') {
      return '签到已结束';
    }
    return '距离过远';
  },

  async loadNearestPoint() {
    if (!this.data.location) {
      return;
    }

    try {
      const res = await this.request('/api/checkin/points', {
        school_id: app.globalData.userInfo?.school_id,
        lat: this.data.location.lat,
        lng: this.data.location.lng
      });

      const points = res.success ? (res.data || []) : [];
      const point = this.buildTargetPoint(points);

      if (!point) {
        this.setData({
          nearestPoint: null,
          distance: null,
          canSubmit: false,
          markers: [],
          circles: [],
          actionButtonText: '暂无可用签到点'
        });
        return;
      }

      const actionMode = this.data.activeRecord ? 'check_out' : 'check_in';
      const withinRange = Number(point.distance || 0) <= Number(point.radius || 0);
      const now = new Date();
      let timeStatus = 'ok';
      let timeRangeText = '';

      if (point.start_time || point.end_time) {
        const parts = [];
        if (point.start_time) parts.push(this.formatDateTime(point.start_time));
        if (point.end_time) parts.push(this.formatDateTime(point.end_time));
        timeRangeText = parts.join(' ~ ');

        if (actionMode === 'check_in') {
          if (point.start_time && now < new Date(point.start_time)) {
            timeStatus = 'not_started';
          } else if (point.end_time && now > new Date(point.end_time)) {
            timeStatus = 'ended';
          }
        }
      }

      const canSubmit = actionMode === 'check_out'
        ? withinRange
        : withinRange && timeStatus === 'ok';

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
            bgColor: actionMode === 'check_out' ? '#F97316' : '#10B981',
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
          color: actionMode === 'check_out' ? '#F9731633' : '#10B98133',
          fillColor: actionMode === 'check_out' ? '#F9731622' : '#10B98122',
          strokeWidth: 2
        }
      ];

      this.setData({
        nearestPoint: point,
        distance: Math.round(point.distance || 0),
        canSubmit,
        actionMode,
        actionButtonText: this.buildActionButtonText(actionMode, canSubmit, timeStatus),
        timeStatus,
        timeRangeText,
        markers,
        circles
      });
    } catch (error) {
      console.error('Load check-in point failed:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  decorateRecord(record) {
    return {
      ...record,
      date_label: this.formatDate(record.check_in_time),
      check_in_label: this.formatDateTime(record.check_in_time),
      check_out_label: record.check_out_time ? this.formatDateTime(record.check_out_time) : '未签退',
      duration_label: record.check_out_time ? this.formatDuration(record.duration_minutes) : '未签退',
      is_checked_out: !!record.check_out_time
    };
  },

  async loadRecords() {
    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    if (!userId) {
      return;
    }

    try {
      const res = await this.request('/api/checkin/records', {
        user_id: userId
      });

      if (res.success) {
        const records = (res.data.records || []).map((record) => this.decorateRecord(record));
        const activeRecord = res.data.active_record ? this.decorateRecord(res.data.active_record) : null;

        this.setData({
          records,
          activeRecord,
          monthlyCount: res.data.monthly_count
        });
      }
    } catch (error) {
      console.error('Load check-in records failed:', error);
    }
  },

  async onSubmitAction() {
    if (!this.data.canSubmit || this.data.isSubmitting) {
      return;
    }

    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    if (!app.globalData.isLoggedIn || !userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (!this.data.nearestPoint?.id) {
      wx.showToast({ title: '未找到签到点', icon: 'none' });
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      const isCheckOut = this.data.actionMode === 'check_out';
      const res = await this.request(
        isCheckOut ? '/api/checkin/check-out' : '/api/checkin/check-in',
        {
          user_id: userId,
          point_id: this.data.nearestPoint.id,
          latitude: this.data.location.lat,
          longitude: this.data.location.lng
        },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message, icon: 'none' });
        return;
      }

      wx.showToast({
        title: isCheckOut ? '签退成功' : '签到成功',
        icon: 'success'
      });

      await this.loadRecords();
      if (this.data.location) {
        await this.loadNearestPoint();
      } else {
        this.getLocation();
      }
    } catch (error) {
      console.error('Submit check-in action failed:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  onRefreshLocation() {
    this.setData({ isLoading: true });
    this.getLocation();
  },

  onMarkerTap(e) {
    if (e.markerId === 1 && this.data.nearestPoint) {
      wx.showToast({ title: this.data.nearestPoint.name, icon: 'none' });
    }
  },

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

  formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  formatDuration(minutes) {
    const totalMinutes = Number(minutes);
    if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
      return '-';
    }
    const hours = Math.floor(totalMinutes / 60);
    const remainMinutes = totalMinutes % 60;

    if (hours > 0 && remainMinutes > 0) {
      return `${hours}小时${remainMinutes}分钟`;
    }
    if (hours > 0) {
      return `${hours}小时`;
    }
    return `${remainMinutes}分钟`;
  },

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});
