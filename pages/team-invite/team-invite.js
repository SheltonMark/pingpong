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
      isLoggedIn: !!app.globalData.isLoggedIn
    });
    this.loadInvitation();
  },

  onShow() {
    const isLoggedIn = !!app.globalData.isLoggedIn;
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
      const res = await app.request(`/api/events/team-invitations/${this.data.token}`);

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
      console.error('加载邀请详情失败:', error);
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
      state = this.data.isLoggedIn ? 'pending_login' : 'pending_guest';
    } else if (invitation.status === 'accepted') {
      state = parseInt(invitation.invitee_id, 10) === parseInt(currentUserId, 10)
        ? 'joined' : 'accepted_other';
    } else if (invitation.status === 'rejected') {
      state = parseInt(invitation.invitee_id, 10) === parseInt(currentUserId, 10)
        ? 'rejected_self' : 'rejected_other';
    } else if (invitation.status === 'cancelled') {
      state = 'cancelled';
    }

    this.setData({ invitationState: state });
  },

  onGoRegister() {
    const redirect = `/pages/team-invite/team-invite?token=${this.data.token}`;
    wx.navigateTo({
      url: `/pages/register/register?redirect=${encodeURIComponent(redirect)}`
    });
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

    this.setData({ isSubmitting: true });

    try {
      const res = await app.request(
        `/api/events/team-invitations/${this.data.token}/respond`,
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
        title: action === 'accept' ? '已加入队伍' : '已拒绝邀请',
        icon: 'success'
      });
      await this.loadInvitation({ silent: true });
    } catch (error) {
      console.error('处理邀请失败:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  }
});
