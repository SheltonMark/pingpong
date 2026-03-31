const app = getApp();
const subscribe = require('../../utils/subscribe');

function getCurrentUserId() {
  return app.globalData.userInfo?.id || app.globalData.userInfo?.user_id || null;
}

function getGenderLabel(gender) {
  if (gender === 'male') return '男';
  if (gender === 'female') return '女';
  return '';
}

function buildPendingInvite(invite = {}, fallbackPartnerName = '') {
  if (!invite.invite_token) {
    return null;
  }

  const inviteMode = invite.invite_mode || 'targeted';
  return {
    invite_token: invite.invite_token,
    share_path: invite.share_path || '',
    invite_mode: inviteMode,
    partner_name: invite.partner_name || fallbackPartnerName || (inviteMode === 'open_link' ? '待队友确认' : '指定搭档')
  };
}

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    partnerMode: 'select',
    availablePartners: [],
    selectedPartner: null,
    pendingInvite: null,
    registrationState: 'not_registered',
    isLoading: true,
    isSubmitting: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ eventId: options.id });
      this.loadData();
    }
  },

  onShow() {
    if (this.data.eventId) {
      this.loadData();
    }
  },

  async loadData() {
    const userId = getCurrentUserId();

    try {
      const [eventRes, userRes, statusRes, partnersRes] = await Promise.all([
        this.request(`/api/events/${this.data.eventId}`),
        app.globalData.userInfo?.openid
          ? this.request('/api/user/profile', { openid: app.globalData.userInfo.openid })
          : Promise.resolve({ success: false }),
        userId
          ? this.request(`/api/events/${this.data.eventId}/doubles-status`, { user_id: userId })
          : Promise.resolve({ success: false }),
        userId
          ? Promise.resolve({ success: false })
          : this.request(`/api/events/${this.data.eventId}/available-partners`)
      ]);

      const nextData = {};

      if (eventRes.success) {
        const event = eventRes.data.event;
        event.name = event.title;
        event.date_label = this.formatDate(event.event_start);
        nextData.event = event;
      }

      if (userRes.success) {
        nextData.user = userRes.data;
      }

      if (statusRes.success) {
        nextData.availablePartners = statusRes.data?.available_partners || [];
        nextData.registrationState = statusRes.data?.registration_state || 'not_registered';
        nextData.pendingInvite = buildPendingInvite(statusRes.data?.pending_invite || {});
        nextData.partnerMode = nextData.pendingInvite
          ? 'select'
          : (nextData.registrationState === 'waiting_partner' ? 'wait' : this.data.partnerMode);
      } else if (partnersRes.success) {
        nextData.availablePartners = partnersRes.data || [];
      }

      this.setData(nextData);
    } catch (error) {
      console.error('Load doubles register data failed:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onModeChange(e) {
    if (this.data.pendingInvite) {
      wx.showToast({ title: '已有待确认邀请，请先分享给队友', icon: 'none' });
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

  async onCreateInviteLink() {
    const userId = getCurrentUserId();
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (this.data.pendingInvite) {
      wx.showToast({ title: '已有待确认邀请，请先分享给队友', icon: 'none' });
      return;
    }
    if (this.data.isSubmitting) {
      return;
    }

    this.setData({ isSubmitting: true });
    await this.requestEventSubscriptions();

    try {
      const res = await this.request(
        `/api/events/${this.data.eventId}/doubles-open-invitations`,
        { user_id: userId },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message || '创建邀请失败', icon: 'none' });
        return;
      }

      this.setData({
        pendingInvite: buildPendingInvite(res.data || {}, '待队友确认'),
        registrationState: 'invite_pending',
        partnerMode: 'select'
      });

      wx.showModal({
        title: '邀请链接已创建',
        content: '现在点“邀请队友”，就可以直接发到微信好友对话框。',
        showCancel: false
      });
    } catch (error) {
      console.error('Create doubles invite link failed:', error);
      wx.showToast({ title: '创建邀请失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  async onSubmit() {
    const userId = getCurrentUserId();
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (this.data.pendingInvite) {
      wx.showToast({ title: '已有待确认邀请，请先分享给队友', icon: 'none' });
      return;
    }

    if (this.data.partnerMode === 'select' && !this.data.selectedPartner) {
      wx.showToast({ title: '请选择搭档，或直接邀请队友', icon: 'none' });
      return;
    }

    if (this.data.isSubmitting) {
      return;
    }

    this.setData({ isSubmitting: true });
    await this.requestEventSubscriptions();

    try {
      const payload = {
        user_id: userId,
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
        wx.showToast({ title: '已加入配对池', icon: 'success' });
        await this.loadData();
        return;
      }

      this.setData({
        pendingInvite: buildPendingInvite(
          {
            ...res.data,
            invite_mode: 'targeted',
            partner_name: this.data.selectedPartner?.name || '指定搭档'
          },
          this.data.selectedPartner?.name || '指定搭档'
        ),
        registrationState: 'invite_pending'
      });

      wx.showModal({
        title: '邀请已创建',
        content: '现在点“邀请队友”，就可以直接发到微信好友对话框。',
        showCancel: false
      });
    } catch (error) {
      console.error('Submit doubles register failed:', error);
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

  getPartnerMeta(partner) {
    const genderLabel = getGenderLabel(partner?.gender);
    const schoolLabel = partner?.school_name || '';
    const collegeLabel = partner?.college_name || '';
    return [genderLabel, schoolLabel, collegeLabel].filter(Boolean).join(' · ');
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
