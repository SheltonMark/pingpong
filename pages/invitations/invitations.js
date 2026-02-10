const app = getApp();

Page({
  data: {
    pendingInvitations: [],
    processedInvitations: [],
    isLoading: true
  },

  onLoad() {
    this.loadInvitations();
  },

  onShow() {
    this.loadInvitations();
  },

  async loadInvitations() {
    if (!app.globalData.userInfo?.id) {
      this.setData({ isLoading: false });
      return;
    }

    try {
      const [pendingRes, processedRes] = await Promise.all([
        this.request(`/api/user/${app.globalData.userInfo.id}/invitations`, { status: 'pending' }),
        this.request(`/api/user/${app.globalData.userInfo.id}/invitations`, { status: 'processed' })
      ]);

      this.setData({
        pendingInvitations: pendingRes.success ? pendingRes.data : [],
        processedInvitations: processedRes.success ? processedRes.data : []
      });
    } catch (error) {
      console.error('获取邀请列表失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async onAccept(e) {
    const { id } = e.currentTarget.dataset;
    await this.respondInvitation(id, 'accept');
  },

  async onReject(e) {
    const { id } = e.currentTarget.dataset;
    await this.respondInvitation(id, 'reject');
  },

  async respondInvitation(id, action) {
    try {
      const res = await this.request(`/api/user/invitations/${id}/respond`, {
        user_id: app.globalData.userInfo.id,
        action
      }, 'POST');

      if (res.success) {
        wx.showToast({
          title: action === 'accept' ? '已同意' : '已拒绝',
          icon: 'success'
        });
        this.loadInvitations();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (error) {
      console.error('响应邀请失败:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});
