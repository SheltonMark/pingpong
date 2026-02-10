const app = getApp();
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    partnerMode: 'select', // 'select' or 'wait'
    availablePartners: [],
    selectedPartner: null,
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
      const [eventRes, userRes, partnersRes] = await Promise.all([
        this.request(`/api/events/${this.data.eventId}`),
        app.globalData.userInfo?.openid
          ? this.request('/api/user/profile', { openid: app.globalData.userInfo.openid })
          : Promise.resolve({ success: false }),
        this.request(`/api/events/${this.data.eventId}/available-partners`)
      ]);

      if (eventRes.success) {
        const event = eventRes.data.event;
        event.name = event.title;
        event.date_label = this.formatDate(event.event_start);
        this.setData({ event });
      }

      if (userRes.success) {
        this.setData({ user: userRes.data });
      }

      if (partnersRes.success) {
        this.setData({ availablePartners: partnersRes.data || [] });
      }
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      partnerMode: mode,
      selectedPartner: mode === 'wait' ? null : this.data.selectedPartner
    });
  },

  onSelectPartner(e) {
    if (this.data.partnerMode !== 'select') return;
    const partner = e.currentTarget.dataset.partner;
    this.setData({
      selectedPartner: this.data.selectedPartner?.id === partner.id ? null : partner
    });
  },

  async onSubmit() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (this.data.partnerMode === 'select' && !this.data.selectedPartner) {
      wx.showToast({ title: '请选择搭档', icon: 'none' });
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
      const payload = {
        user_id: app.globalData.userInfo.id,
        partner_mode: this.data.partnerMode
      };

      if (this.data.partnerMode === 'select' && this.data.selectedPartner) {
        payload.partner_id = this.data.selectedPartner.id;
      }

      const res = await this.request(
        `/api/events/${this.data.eventId}/register-doubles`,
        payload,
        'POST'
      );

      if (res.success) {
        const msg = this.data.partnerMode === 'wait' ? '已加入配对队列' : '报名成功';
        wx.showToast({ title: msg, icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.message || '报名失败', icon: 'none' });
      }
    } catch (error) {
      console.error('Submit error:', error);
      wx.showToast({ title: '报名失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});
