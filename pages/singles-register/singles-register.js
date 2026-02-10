const app = getApp();
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    registeredUsers: [],
    isLoading: true,
    isSubmitting: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ eventId: options.id });
      this.loadData();
    }
  },

  async loadData() {
    try {
      const [eventRes, userRes] = await Promise.all([
        this.request(`/api/events/${this.data.eventId}`),
        app.globalData.userInfo?.openid
          ? this.request('/api/user/profile', { openid: app.globalData.userInfo.openid })
          : Promise.resolve({ success: false })
      ]);

      if (eventRes.success) {
        const event = eventRes.data;
        event.date_label = this.formatDate(event.start_date);
        this.setData({
          event,
          registeredUsers: event.registered_users || []
        });
      }

      if (userRes.success) {
        this.setData({ user: userRes.data });
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async onSubmit() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });

    // 请求赛事相关订阅消息授权（比赛提醒、比分确认）
    try {
      await subscribe.requestEventSubscriptions();
    } catch (err) {
      console.log('订阅请求失败或用户拒绝:', err);
      // 订阅失败不影响报名操作
    }

    try {
      const res = await this.request(`/api/events/${this.data.eventId}/register`, {
        user_id: app.globalData.userInfo.id
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '报名成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.message || '报名失败', icon: 'none' });
      }
    } catch (error) {
      console.error('报名失败:', error);
      wx.showToast({ title: '报名失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});
