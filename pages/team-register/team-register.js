const app = getApp();
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    teamName: '',
    members: [],
    maxMembers: 10,
    isLoading: true,
    isSubmitting: false,
    isCanceling: false,
    hasExistingTeam: false,
    leaderParticipates: true,
    minRequiredParticipants: 2,
    participatingCount: 0
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
      const currentUserId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
      const [eventRes, userRes, captainRes] = await Promise.all([
        this.request(`/api/events/${this.data.eventId}`),
        app.globalData.userInfo?.openid
          ? this.request('/api/user/profile', { openid: app.globalData.userInfo.openid })
          : Promise.resolve({ success: false }),
        currentUserId
          ? this.request(`/api/events/${this.data.eventId}/captain-status`, { user_id: currentUserId })
          : Promise.resolve({ success: false })
      ]);

      if (eventRes.success) {
        const event = eventRes.data.event;
        this.setData({
          event,
          maxMembers: event.max_team_size || 10
        });
      }

      if (userRes.success) {
        let leaderParticipates = true;
        if (captainRes && captainRes.success && captainRes.data?.application) {
          leaderParticipates = captainRes.data.application.is_participating !== 0;
        }

        this.setData({ user: userRes.data, leaderParticipates });
        await this.refreshTeamMembers();
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  buildParticipationStats(members, leaderParticipates) {
    const participatingCount = (members || []).filter(m => m.isParticipating).length;
    const minRequiredParticipants = leaderParticipates ? 2 : 3;
    return { participatingCount, minRequiredParticipants };
  },

  async refreshTeamMembers() {
    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    if (!userId) return;

    try {
      const res = await this.request(`/api/events/${this.data.eventId}/my-team`, {
        user_id: userId
      });

      if (res.success && res.data.members && res.data.members.length > 0) {
        let members = res.data.members.map(m => ({
          user_id: m.user_id,
          name: m.name,
          avatar_url: m.avatar_url,
          isLeader: !!m.is_team_leader,
          isParticipating: m.is_participating !== 0,
          status: m.status || 'confirmed',
          isSingles: (m.is_participating !== 0) && !!m.is_singles_player
        }));

        const hasExistingTeam = !!res.data.submitted;
        // 领队未提交时，确保领队在列表中且标记正确
        if (!hasExistingTeam && this.data.user) {
          const leaderUserId = this.data.user.id || this.data.user.user_id;
          const existingLeaderIdx = members.findIndex(m => m.user_id === leaderUserId);
          if (existingLeaderIdx >= 0) {
            // 领队已在列表中（通过分享链接自己加入），标记为领队并移到首位
            members[existingLeaderIdx].isLeader = true;
            members[existingLeaderIdx].isParticipating = this.data.leaderParticipates;
            if (existingLeaderIdx > 0) {
              const [leader] = members.splice(existingLeaderIdx, 1);
              members.unshift(leader);
            }
          } else {
            // 领队不在列表中，补上
            members.unshift({
              user_id: leaderUserId,
              name: this.data.user.name,
              avatar_url: this.data.user.avatar_url,
              isLeader: true,
              isParticipating: this.data.leaderParticipates,
              status: 'confirmed',
              isSingles: false
            });
          }
        }

        const leader = members.find(m => m.isLeader);
        const leaderParticipates = leader ? leader.isParticipating : this.data.leaderParticipates;
        const stats = this.buildParticipationStats(members, leaderParticipates);

        this.setData({
          hasExistingTeam,
          leaderParticipates,
          teamName: res.data.team_name || this.data.teamName,
          members,
          ...stats
        });
      } else if (res.success && !res.data.submitted) {
        this.initMembers();
      }
    } catch (error) {
      console.error('刷新队伍失败:', error);
      this.initMembers();
    }
  },

  initMembers() {
    if (!this.data.user) return;

    const leaderParticipates = !!this.data.leaderParticipates;
    const members = [{
      user_id: this.data.user.id || this.data.user.user_id,
      name: this.data.user.name,
      avatar_url: this.data.user.avatar_url,
      isLeader: true,
      isParticipating: leaderParticipates,
      status: 'confirmed',
      isSingles: false
    }];
    const stats = this.buildParticipationStats(members, leaderParticipates);

    this.setData({
      hasExistingTeam: false,
      members,
      ...stats
    });
  },

  onToggleSingles(e) {
    const index = e.currentTarget.dataset.index;
    const member = this.data.members[index];
    if (!member) return;
    if (!member.isParticipating) {
      wx.showToast({ title: '该成员未参赛，不能标记单打', icon: 'none' });
      return;
    }

    const currentSinglesCount = this.data.members.filter(m => m.isParticipating && m.isSingles).length;

    if (!member.isSingles && currentSinglesCount >= 3) {
      wx.showToast({ title: '最多选择3名单打选手', icon: 'none' });
      return;
    }

    const key = `members[${index}].isSingles`;
    this.setData({ [key]: !member.isSingles });
  },

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

  onGoBack() {
    wx.navigateBack();
  },

  async onSubmit() {
    if (!this.data.teamName.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' });
      return;
    }

    if (this.data.participatingCount < this.data.minRequiredParticipants) {
      wx.showToast({ title: `至少需要${this.data.minRequiredParticipants}名参赛队员`, icon: 'none' });
      return;
    }

    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '确认提交报名',
        content: '提交后需要全员确认方可生效，是否继续？',
        success: res => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmed || this.data.isSubmitting) return;

    this.setData({ isSubmitting: true });

    try {
      await subscribe.requestEventSubscriptions();
    } catch (err) {
      console.log('订阅请求失败或用户拒绝', err);
    }

    try {
      const member_ids = this.data.members
        .filter(m => !m.isLeader)
        .map(m => m.user_id);

      const singles_player_ids = this.data.members
        .filter(m => m.isParticipating && m.isSingles)
        .map(m => m.user_id);

      const res = await this.request(`/api/events/${this.data.eventId}/register-team`, {
        user_id: app.globalData.userInfo?.id || app.globalData.userInfo?.user_id,
        team_name: this.data.teamName.trim(),
        member_ids,
        singles_player_ids
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '报名成功', icon: 'success' });
        await this.refreshTeamMembers();
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

  async onCancelTeamRegister() {
    if (!this.data.hasExistingTeam || this.data.isCanceling) return;

    const confirmed = await new Promise(resolve => {
      wx.showModal({
        title: '取消队伍报名',
        content: '确定要取消队伍报名吗？取消后将解散队伍并取消所有成员报名。',
        success: res => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmed) return;

    this.setData({ isCanceling: true });

    try {
      const res = await this.request(`/api/events/${this.data.eventId}/cancel-team`, {
        user_id: app.globalData.userInfo?.id || app.globalData.userInfo?.user_id
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '已取消', icon: 'success' });
        await this.refreshTeamMembers();
      } else {
        wx.showToast({ title: res.message || '取消失败', icon: 'none' });
      }
    } catch (error) {
      console.error('取消队伍报名失败:', error);
      wx.showToast({ title: '取消失败', icon: 'none' });
    } finally {
      this.setData({ isCanceling: false });
    }
  },

  async saveSinglesMarks() {
    const userId = app.globalData.userInfo?.id || app.globalData.userInfo?.user_id;
    const singlesIds = this.data.members
      .filter(m => m.isParticipating && m.isSingles)
      .map(m => m.user_id);

    try {
      await this.request(`/api/events/${this.data.eventId}/team-singles`, {
        user_id: userId,
        singles_player_ids: singlesIds
      }, 'PUT');
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (error) {
      console.error('保存单打标记失败:', error);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});
