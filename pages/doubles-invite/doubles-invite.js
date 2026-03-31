const app = getApp();

function getCurrentUserId() {
  return app.globalData.userInfo?.id || app.globalData.userInfo?.user_id || null;
}

Page({
  data: {
    token: '',
    invitation: null,
    event: null,
    isLoggedIn: false,
    isLoading: true,
    isSubmitting: false,
    respondedAction: '',
    errorMsg: '',
    invitationState: 'invalid'
  },

  onLoad(options) {
    const token = options.token || '';
    this.setData({
      token,
      isLoggedIn: !!getCurrentUserId()
    });
    this.loadInvitation();
  },

  onShow() {
    const isLoggedIn = !!getCurrentUserId();
    if (isLoggedIn !== this.data.isLoggedIn) {
      this.setData({ isLoggedIn });
      this.updateInvitationState();
    }

    if (this.data.token) {
      this.loadInvitation({ silent: true });
    }
  },

  async loadInvitation(options = {}) {
    if (!this.data.token) {
      this.setData({
        isLoading: false,
        errorMsg: '邀请链接无效'
      });
      return;
    }

    if (!options.silent) {
      this.setData({ isLoading: true });
    }

    try {
      const userId = getCurrentUserId();
      const res = await app.request(
        `/api/events/doubles-invitations/${this.data.token}`,
        userId ? { user_id: userId } : undefined
      );

      if (!res.success) {
        this.setData({
          invitation: null,
          event: null,
          errorMsg: res.message || '邀请不存在或已失效'
        });
        return;
      }

      this.setData({
        invitation: res.data,
        event: res.data.event,
        errorMsg: ''
      });
      this.updateInvitationState();
    } catch (error) {
      console.error('Load doubles invitation failed:', error);
      this.setData({
        invitation: null,
        event: null,
        errorMsg: '加载失败，请稍后重试'
      });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  updateInvitationState() {
    const invitation = this.data.invitation;
    const currentUserId = getCurrentUserId();
    let state = 'invalid';

    if (!invitation) {
      state = 'invalid';
    } else if (this.data.respondedAction === 'accept') {
      state = 'joined';
    } else if (this.data.respondedAction === 'reject') {
      state = 'rejected_self';
    } else if (invitation.status === 'pending') {
      if (!this.data.isLoggedIn) {
        state = 'pending_guest';
      } else if (invitation.response_allowed === false) {
        state = 'pending_blocked';
      } else {
        state = invitation.invite_mode === 'open_link' ? 'pending_open_link' : 'pending_targeted';
      }
    } else if (invitation.status === 'accepted') {
      state = parseInt(invitation.invitee_id, 10) === parseInt(currentUserId, 10)
        ? 'joined'
        : 'accepted_other';
    } else if (invitation.status === 'rejected') {
      state = parseInt(invitation.invitee_id, 10) === parseInt(currentUserId, 10)
        ? 'rejected_self'
        : 'rejected_other';
    } else if (invitation.status === 'cancelled') {
      state = 'cancelled';
    } else if (invitation.status === 'expired') {
      state = 'expired';
    }

    this.setData({ invitationState: state });
  },

  async onGoRegister() {
    const redirect = `/pages/doubles-invite/doubles-invite?token=${this.data.token}`;

    try {
      if (!getCurrentUserId()) {
        wx.showLoading({ title: '登录中...' });
        await app.wxLogin();
      }

      if (getCurrentUserId()) {
        this.setData({ isLoggedIn: true });
        this.updateInvitationState();
        await this.loadInvitation({ silent: true });
        return;
      }

      wx.navigateTo({
        url: `/pages/register/register?redirect=${encodeURIComponent(redirect)}`
      });
    } catch (error) {
      console.error('Login for doubles invite failed:', error);
      wx.showToast({
        title: error.message || '登录失败，请重试',
        icon: 'none'
      });
    } finally {
      wx.hideLoading();
    }
  },

  async onRespond(e) {
    const action = e.currentTarget.dataset.action;
    if (!['accept', 'reject'].includes(action) || this.data.isSubmitting) {
      return;
    }

    const userId = getCurrentUserId();
    if (!userId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (this.data.invitation?.response_allowed === false) {
      wx.showToast({
        title: this.data.invitation.response_block_reason || '当前账号不能处理该邀请',
        icon: 'none'
      });
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      const res = await app.request(
        `/api/events/doubles-invitations/${this.data.token}/respond`,
        {
          user_id: userId,
          action
        },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        return;
      }

      this.setData({ respondedAction: action });
      this.updateInvitationState();
      wx.showToast({
        title: action === 'accept' ? '已确认搭档' : '已拒绝邀请',
        icon: 'success'
      });
      await this.loadInvitation({ silent: true });
    } catch (error) {
      console.error('Respond doubles invitation failed:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  }
});
