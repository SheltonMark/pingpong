const app = getApp();
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    partnerMode: 'select',
    availablePartners: [],
    selectedPartner: null,
    pendingInvite: null,
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
    if (this.data.pendingInvite) {
      wx.showToast({ title: '邀请已创建，请先分享给搭档', icon: 'none' });
      return;
    }

    const mode = e.currentTarget.dataset.mode;
    this.setData({
      partnerMode: mode,
      selectedPartner: mode === 'wait' ? null : this.data.selectedPartner
    });
  },

  onSelectPartner(e) {
    if (this.data.partnerMode !== 'select' || this.data.pendingInvite) {
      return;
    }

    const partner = e.currentTarget.dataset.partner;
    this.setData({
      selectedPartner: this.data.selectedPartner?.id === partner.id ? null : partner
    });
  },

  async requestEventSubscriptions() {
    try {
      await subscribe.requestSubscription([
        subscribe.TEMPLATE_TYPES.INVITATION_RESULT,
        subscribe.TEMPLATE_TYPES.MATCH_REMINDER,
        subscribe.TEMPLATE_TYPES.SCORE_CONFIRM
      ]);
    } catch (error) {
      console.log('Subscription request failed or declined:', error);
    }
  },

  async onSubmit() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (this.data.pendingInvite) {
      wx.showToast({ title: '邀请已创建，请先分享给搭档', icon: 'none' });
      return;
    }

    if (this.data.partnerMode === 'select' && !this.data.selectedPartner) {
      wx.showToast({ title: '请选择搭档', icon: 'none' });
      return;
    }

    if (this.data.isSubmitting) {
      return;
    }

    this.setData({ isSubmitting: true });
    await this.requestEventSubscriptions();

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

      if (!res.success) {
        wx.showToast({ title: res.message || '报名失败', icon: 'none' });
        return;
      }

      if (this.data.partnerMode === 'wait') {
        wx.showToast({ title: '已加入配对队列', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1200);
        return;
      }

      this.setData({
        pendingInvite: {
          invite_token: res.data?.invite_token || '',
          share_path: res.data?.share_path || '',
          partner_name: this.data.selectedPartner?.name || '指定搭档'
        }
      });

      wx.showModal({
        title: '邀请已创建',
        content: '请点击下方“分享邀请”发给搭档，对方确认后即可完成双打报名。',
        showCancel: false
      });
    } catch (error) {
      console.error('Submit error:', error);
      wx.showToast({ title: '报名失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  onShareAppMessage(res) {
    const sharePath = res?.target?.dataset?.sharePath || this.data.pendingInvite?.share_path;
    const eventTitle = this.data.event?.title || '双打比赛';

    if (!sharePath) {
      return {
        title: `邀请搭档参加${eventTitle}`,
        path: `/pages/event-detail/event-detail?id=${this.data.eventId}`
      };
    }

    return {
      title: `邀请你和我搭档参加${eventTitle}`,
      path: sharePath
    };
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
