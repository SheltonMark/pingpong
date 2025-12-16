const app = getApp();

Page({
  data: {
    matches: [],
    isLoading: true
  },

  onLoad() {
    this.loadPendingMatches();
  },

  onShow() {
    this.loadPendingMatches();
  },

  async loadPendingMatches() {
    this.setData({ isLoading: true });
    try {
      const res = await this.request('/api/admin/matches/pending', {
        user_id: app.globalData.userInfo.id
      });

      if (res.success) {
        this.setData({ matches: res.data });
      }
    } catch (error) {
      console.error('Load matches error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async onApprove(e) {
    const { id } = e.currentTarget.dataset;
    await this.handleApproval(id, true);
  },

  async onReject(e) {
    const { id } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认驳回',
      content: '驳回后双方需要重新确认比分',
      success: async (res) => {
        if (res.confirm) {
          await this.handleApproval(id, false);
        }
      }
    });
  },

  async handleApproval(matchId, approved) {
    try {
      const res = await this.request(`/api/admin/matches/${matchId}/approve`, {
        user_id: app.globalData.userInfo.id,
        approved
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: approved ? '已通过' : '已驳回', icon: 'success' });
        this.loadPendingMatches();
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (error) {
      console.error('Approval error:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
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
