const app = getApp();

Page({
  data: {
    isAdmin: false,
    roles: [],
    stats: null,
    isLoading: true,
    menuItems: [
      { id: 'events', icon: '🏆', label: '赛事管理', url: '/pages/admin-events/admin-events' },
      { id: 'users', icon: '👥', label: '用户管理', url: '/pages/admin-users/admin-users' },
      { id: 'content', icon: '📝', label: '内容管理', url: '/pages/admin-content/admin-content' },
      { id: 'stats', icon: '📊', label: '数据统计', url: '/pages/admin-stats/admin-stats' }
    ]
  },

  onLoad() {
    this.checkAdmin();
  },

  onShow() {
    if (this.data.isAdmin) {
      this.loadDashboard();
    }
  },

  async checkAdmin() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }

    try {
      const res = await this.request('/api/admin/check', {
        user_id: app.globalData.userInfo.id
      });

      if (res.success && res.isAdmin) {
        this.setData({
          isAdmin: true,
          roles: res.roles
        });
        this.loadDashboard();
      } else {
        wx.showToast({ title: '无管理权限', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    } catch (error) {
      console.error('Check admin error:', error);
      wx.showToast({ title: '权限验证失败', icon: 'none' });
    }
  },

  async loadDashboard() {
    try {
      const res = await this.request('/api/admin/dashboard', {
        user_id: app.globalData.userInfo.id
      });

      if (res.success) {
        this.setData({ stats: res.data });
      }
    } catch (error) {
      console.error('Load dashboard error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onTapMenu(e) {
    const { url } = e.currentTarget.dataset;
    wx.navigateTo({ url });
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
