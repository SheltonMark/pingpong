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

function getPartnerMeta(partner = {}) {
  return [getGenderLabel(partner.gender), partner.school_name || '', partner.college_name || '']
    .filter(Boolean)
    .join(' · ');
}

function normalizePartners(partners = []) {
  return partners.map((partner) => ({
    ...partner,
    meta_label: getPartnerMeta(partner)
  }));
}

function buildPendingInvite(invite = {}, fallbackPartner = null) {
  if (!invite.invite_token) {
    return null;
  }

  const inviteMode = invite.invite_mode || 'targeted';
  return {
    invite_token: invite.invite_token,
    share_path: invite.share_path || '',
    invite_mode: inviteMode,
    partner_id: invite.partner_id || fallbackPartner?.id || null,
    partner_name: invite.partner_name || fallbackPartner?.name || (inviteMode === 'open_link' ? '待微信好友确认' : '待对方确认'),
    partner_avatar_url: invite.partner_avatar_url || fallbackPartner?.avatar_url || ''
  };
}

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    joinMode: 'invite',
    inviteSource: 'pool',
    availablePartners: [],
    selectedPartner: null,
    pendingInvite: null,
    targetedInvite: null,
    openLinkInvite: null,
    registrationState: 'not_registered',
    isLoading: true,
    isSubmitting: false,
    isPreparingOpenInvite: false
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
        const registrationState = statusRes.data?.registration_state || 'not_registered';
        const availablePartners = normalizePartners(statusRes.data?.available_partners || []);
        const pendingInvite = buildPendingInvite(statusRes.data?.pending_invite || {});
        const targetedInvite = pendingInvite?.invite_mode === 'targeted' ? pendingInvite : null;
        const openLinkInvite = pendingInvite?.invite_mode === 'open_link' ? pendingInvite : null;

        nextData.availablePartners = availablePartners;
        nextData.registrationState = registrationState;
        nextData.pendingInvite = pendingInvite;
        nextData.targetedInvite = targetedInvite;
        nextData.openLinkInvite = openLinkInvite;

        if (targetedInvite) {
          nextData.joinMode = 'invite';
          nextData.inviteSource = 'pool';
          nextData.selectedPartner = null;
        } else if (openLinkInvite) {
          nextData.joinMode = 'invite';
          nextData.inviteSource = 'wechat';
        } else if (registrationState === 'waiting_partner') {
          nextData.joinMode = 'wait';
        }

        if (this.data.selectedPartner) {
          const stillAvailable = availablePartners.some((partner) => Number(partner.id) === Number(this.data.selectedPartner.id));
          if (!stillAvailable) {
            nextData.selectedPartner = null;
          }
        }
      } else if (partnersRes.success) {
        nextData.availablePartners = normalizePartners(partnersRes.data || []);
        nextData.pendingInvite = null;
        nextData.targetedInvite = null;
        nextData.openLinkInvite = null;
      }

      this.setData(nextData);
    } catch (error) {
      console.error('Load doubles register data failed:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  async onJoinModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    if (!mode || mode === this.data.joinMode) {
      return;
    }

    if (this.data.targetedInvite) {
      wx.showToast({ title: '已有待确认邀请，请先等对方处理', icon: 'none' });
      return;
    }

    this.setData({
      joinMode: mode,
      selectedPartner: mode === 'wait' ? null : this.data.selectedPartner
    });

    if (mode === 'invite' && this.data.inviteSource === 'wechat' && !this.data.openLinkInvite) {
      const ready = await this.ensureOpenLinkInvite();
      if (!ready && !this.data.openLinkInvite) {
        this.setData({ inviteSource: 'pool' });
      }
    }
  },

  async onInviteSourceChange(e) {
    const source = e.currentTarget.dataset.source;
    if (!source || source === this.data.inviteSource) {
      return;
    }

    if (this.data.targetedInvite && source !== 'pool') {
      wx.showToast({ title: '当前已邀请配对池队友，请先等对方确认', icon: 'none' });
      return;
    }

    this.setData({
      joinMode: 'invite',
      inviteSource: source,
      selectedPartner: source === 'wechat' ? null : this.data.selectedPartner
    });

    if (source === 'wechat' && !this.data.openLinkInvite) {
      const ready = await this.ensureOpenLinkInvite();
      if (!ready && !this.data.openLinkInvite) {
        this.setData({ inviteSource: 'pool' });
      }
    }
  },

  onSelectPartner(e) {
    if (this.data.joinMode !== 'invite' || this.data.inviteSource !== 'pool' || this.data.targetedInvite) {
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

  async ensureOpenLinkInvite() {
    const userId = getCurrentUserId();
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return false;
    }

    if (this.data.openLinkInvite?.share_path) {
      return true;
    }

    if (this.data.targetedInvite) {
      wx.showToast({ title: '当前已有待确认邀请，请先等对方处理', icon: 'none' });
      return false;
    }

    if (this.data.isPreparingOpenInvite || this.data.isSubmitting) {
      return false;
    }

    this.setData({ isPreparingOpenInvite: true });

    try {
      await this.requestEventSubscriptions();

      const res = await this.request(
        `/api/events/${this.data.eventId}/doubles-open-invitations`,
        { user_id: userId },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message || '准备微信邀请失败', icon: 'none' });
        return false;
      }

      const openLinkInvite = buildPendingInvite(res.data || {}, null);
      this.setData({
        pendingInvite: openLinkInvite,
        targetedInvite: null,
        openLinkInvite,
        registrationState: 'waiting_partner'
      });
      return true;
    } catch (error) {
      console.error('Prepare doubles open-link invite failed:', error);
      wx.showToast({ title: '准备微信邀请失败', icon: 'none' });
      return false;
    } finally {
      this.setData({ isPreparingOpenInvite: false });
    }
  },

  async onSubmit() {
    const userId = getCurrentUserId();
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (this.data.registrationState === 'confirmed') {
      wx.showToast({ title: '你已完成双打报名', icon: 'none' });
      return;
    }

    if (this.data.targetedInvite) {
      wx.showToast({ title: '已有待确认邀请，请先等对方处理', icon: 'none' });
      return;
    }

    if (this.data.joinMode === 'wait') {
      if (this.data.registrationState === 'waiting_partner') {
        wx.showToast({ title: '你已经在配对池里', icon: 'none' });
        return;
      }

      if (this.data.isSubmitting) {
        return;
      }

      this.setData({ isSubmitting: true });
      await this.requestEventSubscriptions();

      try {
        const res = await this.request(
          `/api/events/${this.data.eventId}/register-doubles`,
          {
            user_id: userId,
            partner_mode: 'wait'
          },
          'POST'
        );

        if (!res.success) {
          wx.showToast({ title: res.message || '加入配对池失败', icon: 'none' });
          return;
        }

        wx.showToast({ title: '已加入配对池', icon: 'success' });
        await this.loadData();
      } catch (error) {
        console.error('Join doubles waiting pool failed:', error);
        wx.showToast({ title: '加入配对池失败', icon: 'none' });
      } finally {
        this.setData({ isSubmitting: false });
      }
      return;
    }

    if (this.data.inviteSource !== 'pool') {
      return;
    }

    if (!this.data.selectedPartner) {
      wx.showToast({ title: '请选择一位队友', icon: 'none' });
      return;
    }

    if (this.data.isSubmitting) {
      return;
    }

    this.setData({ isSubmitting: true });
    await this.requestEventSubscriptions();

    try {
      const selectedPartner = this.data.selectedPartner;
      const res = await this.request(
        `/api/events/${this.data.eventId}/register-doubles`,
        {
          user_id: userId,
          partner_mode: 'select',
          partner_id: selectedPartner.id
        },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message || '邀请队友失败', icon: 'none' });
        return;
      }

      const targetedInvite = buildPendingInvite(
        {
          ...res.data,
          invite_mode: 'targeted',
          partner_name: selectedPartner.name,
          partner_avatar_url: selectedPartner.avatar_url
        },
        selectedPartner
      );

      this.setData({
        pendingInvite: targetedInvite,
        targetedInvite,
        openLinkInvite: null,
        registrationState: 'invite_pending',
        selectedPartner: null,
        joinMode: 'invite',
        inviteSource: 'pool'
      });

      wx.showToast({
        title: `已邀请${selectedPartner.name}`,
        icon: 'success'
      });
    } catch (error) {
      console.error('Invite doubles partner failed:', error);
      wx.showToast({ title: '邀请队友失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  onShareAppMessage(res) {
    const sharePath = res?.target?.dataset?.sharePath || this.data.openLinkInvite?.share_path || this.data.pendingInvite?.share_path;
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
