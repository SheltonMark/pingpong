const app = getApp();

Page({
  data: {
    invitationId: null,
    invitation: null,
    match: null,
    hasJoined: false,
    isCreator: false,
    isPlayer: false,
    hasConfirmed: false,
    statusLabels: {
      open: '招募中',
      full: '已满员',
      ongoing: '进行中',
      finished: '已结束',
      cancelled: '已取消'
    }
  },

  onLoad(options) {
    this.setData({ invitationId: options.id });
    this.loadInvitation();
  },

  onShow() {
    this.loadInvitation();
  },

  async loadInvitation() {
    try {
      const res = await this.request(`/api/invitations/${this.data.invitationId}`);
      if (res.success) {
        const inv = res.data;
        inv.time_label = this.formatDateTime(inv.scheduled_time);

        const userId = app.globalData.userInfo?.id;
        const hasJoined = inv.participants.some(p => p.user_id === userId);
        const isCreator = inv.creator_id === userId;

        this.setData({ invitation: inv, hasJoined, isCreator });

        if (inv.status === 'ongoing' || inv.status === 'finished') {
          this.loadMatch();
        }
      }
    } catch (error) {
      console.error('加载约球失败:', error);
    }
  },

  async loadMatch() {
    try {
      const res = await this.request(`/api/invitations/${this.data.invitationId}/match`);
      if (res.success && res.data) {
        const userId = app.globalData.userInfo?.id;
        const match = res.data;
        const isPlayer = match.player1_id === userId || match.player2_id === userId;

        // 检查当前用户是否已确认
        let hasConfirmed = false;
        if (userId === match.player1_id) {
          hasConfirmed = !!match.player1_confirmed;
        } else if (userId === match.player2_id) {
          hasConfirmed = !!match.player2_confirmed;
        }

        this.setData({ match, isPlayer, hasConfirmed });
      }
    } catch (error) {
      console.error('加载比赛失败:', error);
    }
  },

  async onJoin() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    try {
      const res = await this.request(`/api/invitations/${this.data.invitationId}/join`, {
        user_id: app.globalData.userInfo.id
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '已加入', icon: 'success' });
        this.loadInvitation();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (error) {
      console.error('加入失败:', error);
    }
  },

  async onLeave() {
    try {
      const res = await this.request(`/api/invitations/${this.data.invitationId}/leave`, {
        user_id: app.globalData.userInfo.id
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '已退出', icon: 'success' });
        this.loadInvitation();
      }
    } catch (error) {
      console.error('退出失败:', error);
    }
  },

  async onStartMatch() {
    try {
      const res = await this.request(`/api/invitations/${this.data.invitationId}/start`, {
        user_id: app.globalData.userInfo.id
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '比赛开始', icon: 'success' });
        this.loadInvitation();
      } else {
        wx.showToast({ title: res.message, icon: 'none' });
      }
    } catch (error) {
      console.error('开始比赛失败:', error);
    }
  },

  onEnterScore() {
    if (!this.data.match) return;
    wx.navigateTo({
      url: `/pages/score-entry/score-entry?match_id=${this.data.match.id}&type=invitation`
    });
  },

  // 确认比分
  async onConfirmScore() {
    if (!this.data.match) return;

    wx.showModal({
      title: '确认比分',
      content: '确认比分无误吗？确认后将无法修改。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await this.request(`/api/events/matches/${this.data.match.id}/confirm`, {
              user_id: app.globalData.userInfo.id
            }, 'POST');

            if (result.success) {
              wx.showToast({ title: '已确认', icon: 'success' });
              this.loadMatch();
            } else {
              wx.showToast({ title: result.message || '确认失败', icon: 'none' });
            }
          } catch (error) {
            console.error('确认比分失败:', error);
            wx.showToast({ title: '确认失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 结束约球
  async onFinishMatch() {
    wx.showModal({
      title: '结束约球',
      content: '确定要结束这次约球吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await this.request(`/api/invitations/${this.data.invitationId}/finish`, {
              user_id: app.globalData.userInfo.id
            }, 'POST');

            if (result.success) {
              wx.showToast({ title: '已结束', icon: 'success' });
              this.loadInvitation();
            } else {
              wx.showToast({ title: result.message || '操作失败', icon: 'none' });
            }
          } catch (error) {
            console.error('结束约球失败:', error);
            wx.showToast({ title: '操作失败', icon: 'none' });
          }
        }
      }
    });
  },

  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
