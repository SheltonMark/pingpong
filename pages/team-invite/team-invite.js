const app = getApp();

Page({
  data: {
    eventId: null,
    inviterId: null,
    event: null,
    inviterName: '',
    teamName: '',
    isLoggedIn: false,
    isRegistered: false,
    joining: false,
    joined: false,
    errorMsg: ''
  },

  onLoad(options) {
    const { event_id, inviter_id } = options;
    this.setData({
      eventId: event_id,
      inviterId: inviter_id,
      isLoggedIn: !!app.globalData.isLoggedIn
    });
    this.loadInfo();
  },

  onShow() {
    // 注册完回来后刷新登录状态
    const isLoggedIn = !!app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });
    if (isLoggedIn && this.data.eventId) {
      this.checkRegistration();
    }
  },

  async loadInfo() {
    try {
      const [eventRes, inviterRes] = await Promise.all([
        app.request(`/api/events/${this.data.eventId}`),
        app.request(`/api/user/profile`, { user_id: this.data.inviterId })
      ]);

      if (eventRes.success) {
        const event = eventRes.data.event;
        this.setData({ event });
      }

      if (inviterRes.success) {
        this.setData({ inviterName: inviterRes.data.name || '队长' });
      }

      // 获取领队的队伍名
      const teamRes = await app.request(`/api/events/${this.data.eventId}/my-team`, {
        user_id: this.data.inviterId
      });
      if (teamRes.success && teamRes.data.team_name) {
        this.setData({ teamName: teamRes.data.team_name });
      }

      if (this.data.isLoggedIn) {
        this.checkRegistration();
      }
    } catch (error) {
      console.error('加载信息失败:', error);
    }
  },

  async checkRegistration() {
    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    if (!userId) return;

    try {
      const res = await app.request(`/api/events/${this.data.eventId}`);
      if (res.success) {
        const myReg = res.data.registrations.find(r => r.user_id === userId);
        if (myReg) {
          this.setData({ isRegistered: true });
        }
      }
    } catch (error) {
      console.error('检查报名状态失败:', error);
    }
  },

  onGoRegister() {
    wx.navigateTo({ url: '/pages/register/register' });
  },

  async onJoinTeam() {
    if (this.data.joining) return;

    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    this.setData({ joining: true, errorMsg: '' });

    try {
      const res = await app.request(`/api/events/${this.data.eventId}/join-team`, {
        user_id: userId,
        inviter_id: parseInt(this.data.inviterId)
      }, 'POST');

      if (res.success) {
        this.setData({ joined: true });
        wx.showToast({ title: '已加入队伍', icon: 'success' });
      } else {
        this.setData({ errorMsg: res.message || '加入失败' });
        wx.showToast({ title: res.message || '加入失败', icon: 'none' });
      }
    } catch (error) {
      console.error('加入队伍失败:', error);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ joining: false });
    }
  }
});
