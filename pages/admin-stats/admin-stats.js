const app = getApp();

Page({
  data: {
    activeTab: 'users',
    tabs: [
      { key: 'users', label: '用户统计' },
      { key: 'events', label: '赛事统计' },
      { key: 'activity', label: '活跃度' }
    ],
    userStats: null,
    eventStats: null,
    activityStats: null,
    isLoading: true
  },

  onLoad() {
    this.loadStats();
  },

  async loadStats() {
    this.setData({ isLoading: true });

    try {
      const [userRes, eventRes, activityRes] = await Promise.all([
        this.request('/api/admin/stats/users', { user_id: app.globalData.userInfo.id }),
        this.request('/api/admin/stats/events', { user_id: app.globalData.userInfo.id }),
        this.request('/api/admin/stats/activity', { user_id: app.globalData.userInfo.id })
      ]);

      if (userRes.success) {
        this.setData({ userStats: userRes.data });
      }
      if (eventRes.success) {
        this.setData({ eventStats: eventRes.data });
      }
      if (activityRes.success) {
        this.setData({ activityStats: activityRes.data });
      }
    } catch (error) {
      console.error('Load stats error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onTabChange(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ activeTab: key });
  },

  getStatusLabel(status) {
    const map = {
      draft: '草稿',
      registration: '报名中',
      ongoing: '进行中',
      finished: '已结束'
    };
    return map[status] || status;
  },

  getTypeLabel(type) {
    const map = { singles: '单打', doubles: '双打', team: '团体' };
    return map[type] || type;
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
