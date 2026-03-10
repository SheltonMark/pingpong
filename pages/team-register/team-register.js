const app = getApp();
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    teamName: '',
    members: [],       // 动态成员列表（领队 + 队友）
    maxMembers: 10,    // 从 event.max_participants 取
    isLoading: true,
    isSubmitting: false,
    hasExistingTeam: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ eventId: options.id });
      this.loadData();
    }
  },

  onShow() {
    if (this.data.eventId && this.data.user) {
      this.refreshTeamMembers();
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
        const event = eventRes.data.event;
        this.setData({
          event,
          maxMembers: event.max_participants || 10
        });
      }

      if (userRes.success) {
        this.setData({ user: userRes.data });
        // 检查是否已有队伍（通过分享加入的成员）
        await this.refreshTeamMembers();
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  // 从后端刷新队伍成员列表
  async refreshTeamMembers() {
    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    if (!userId) return;

    try {
      const res = await this.request(`/api/events/${this.data.eventId}/my-team`, {
        user_id: userId
      });

      if (res.success && res.data.members && res.data.members.length > 0) {
        const members = res.data.members.map(m => ({
          user_id: m.user_id,
          name: m.name,
          avatar_url: m.avatar_url,
          isLeader: !!m.is_team_leader,
          status: m.status || 'confirmed',
          isSingles: !!m.is_singles_player
        }));
        this.setData({
          hasExistingTeam: true,
          teamName: res.data.team_name || this.data.teamName,
          members
        });
      } else {
        this.initMembers();
      }
    } catch (error) {
      console.error('刷新队伍失败:', error);
      this.initMembers();
    }
  },

  // 初始化成员列表（仅领队自己）
  initMembers() {
    if (!this.data.user) return;
    this.setData({
      members: [{
        user_id: this.data.user.id || this.data.user.user_id,
        name: this.data.user.name,
        avatar_url: this.data.user.avatar_url,
        isLeader: true,
        status: 'confirmed',
        isSingles: false
      }]
    });
  },

  // 点击已确认成员，切换单打标记
  onToggleSingles(e) {
    const index = e.currentTarget.dataset.index;
    const member = this.data.members[index];
    if (!member) return;

    const currentSinglesCount = this.data.members.filter(m => m.isSingles).length;

    if (!member.isSingles && currentSinglesCount >= 3) {
      wx.showToast({ title: '最多选择3名单打选手', icon: 'none' });
      return;
    }

    const key = `members[${index}].isSingles`;
    this.setData({ [key]: !member.isSingles });
  },

  // 微信分享（邀请队友）
  onShareAppMessage() {
    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    const teamName = this.data.teamName || '我的队伍';
    const eventTitle = this.data.event?.title || '团体赛';
    return {
      title: `邀请你加入「${teamName}」参加${eventTitle}`,
      path: `/pages/team-invite/team-invite?event_id=${this.data.eventId}&inviter_id=${userId}`
    };
  },

  onTeamNameInput(e) {
    this.setData({ teamName: e.detail.value });
  },

  async onSubmit() {
    if (!this.data.teamName.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' });
      return;
    }

    if (this.data.members.length < 2) {
      wx.showToast({ title: '至少需要2名队员', icon: 'none' });
      return;
    }

    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });

    try {
      await subscribe.requestEventSubscriptions();
    } catch (err) {
      console.log('订阅请求失败或用户拒绝:', err);
    }

    try {
      const member_ids = this.data.members
        .filter(m => !m.isLeader)
        .map(m => m.user_id);

      const singles_player_ids = this.data.members
        .filter(m => m.isSingles)
        .map(m => m.user_id);

      const res = await this.request(`/api/events/${this.data.eventId}/register-team`, {
        user_id: app.globalData.userInfo.id || app.globalData.userInfo.user_id,
        team_name: this.data.teamName.trim(),
        member_ids,
        singles_player_ids
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '报名成功', icon: 'success' });
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

  // 保存单打标记到后端（已提交报名的队伍）
  async saveSinglesMarks() {
    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    const singlesIds = this.data.members
      .filter(m => m.isSingles)
      .map(m => m.user_id);

    try {
      await this.request(`/api/events/${this.data.eventId}/team-singles`, {
        user_id: userId,
        singles_player_ids: singlesIds
      }, 'PUT');
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (error) {
      console.error('保存单打标记失败:', error);
    }
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});

