const app = getApp();

Page({
  data: {
    events: [],
    statusFilter: '',
    statusOptions: [
      { value: '', label: '全部' },
      { value: 'draft', label: '草稿' },
      { value: 'registration', label: '报名中' },
      { value: 'ongoing', label: '进行中' },
      { value: 'finished', label: '已结束' }
    ],
    statusIndex: 0,
    isLoading: true
  },

  onLoad() {
    this.loadEvents();
  },

  onShow() {
    this.loadEvents();
  },

  async loadEvents() {
    this.setData({ isLoading: true });
    try {
      const res = await this.request('/api/admin/events', {
        user_id: app.globalData.userInfo.id,
        status: this.data.statusFilter
      });

      if (res.success) {
        const events = res.data.map(e => ({
          ...e,
          status_label: this.getStatusLabel(e.status),
          type_label: this.getTypeLabel(e.event_type),
          format_label: e.event_format === 'round_robin' ? '循环赛' : '淘汰赛'
        }));
        this.setData({ events });
      }
    } catch (error) {
      console.error('Load events error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  getStatusLabel(status) {
    const map = {
      draft: '草稿',
      registration: '报名中',
      ongoing: '进行中',
      finished: '已结束',
      cancelled: '已取消'
    };
    return map[status] || status;
  },

  getTypeLabel(type) {
    const map = { singles: '单打', doubles: '双打', team: '团体' };
    return map[type] || type;
  },

  onFilterChange(e) {
    const index = e.detail.value;
    this.setData({
      statusIndex: index,
      statusFilter: this.data.statusOptions[index].value
    });
    this.loadEvents();
  },

  onCreateEvent() {
    wx.navigateTo({ url: '/pages/admin-event-edit/admin-event-edit' });
  },

  onEditEvent(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/admin-event-edit/admin-event-edit?id=${id}` });
  },

  onViewPendingScores() {
    wx.navigateTo({ url: '/pages/admin-scores/admin-scores' });
  },

  request(url, data) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.baseUrl + url,
        data,
        success: (res) => resolve(res.data),
        fail: reject
      });
    });
  }
});
