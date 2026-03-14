const app = getApp();
const subscribe = require('../../utils/subscribe');

function getCurrentUserId() {
  return app.globalData.userInfo?.id || app.globalData.userInfo?.user_id || null;
}

function normalizeConfig(event = {}, draftConfig = {}) {
  const minTeamPlayers = Math.max(2, parseInt(draftConfig.minTeamPlayers || event.min_team_players || 2, 10) || 2);
  const maxTeamPlayers = Math.max(
    minTeamPlayers,
    parseInt(draftConfig.maxTeamPlayers || event.max_team_players || 10, 10) || 10
  );
  const singlesPlayerCount = Math.max(
    1,
    parseInt(draftConfig.singlesPlayerCount || event.singles_player_count || 3, 10) || 3
  );

  return {
    minTeamPlayers,
    maxTeamPlayers,
    singlesPlayerCount,
    genderRule: draftConfig.genderRule || event.gender_rule || 'unlimited',
    requiredMaleCount: parseInt(draftConfig.requiredMaleCount || event.required_male_count || 0, 10) || 0,
    requiredFemaleCount: parseInt(draftConfig.requiredFemaleCount || event.required_female_count || 0, 10) || 0
  };
}

function buildRuleText(config) {
  const parts = [
    `每队至少 ${config.minTeamPlayers} 人`,
    `最多 ${config.maxTeamPlayers} 人`,
    `单打 ${config.singlesPlayerCount} 人`
  ];

  switch (config.genderRule) {
    case 'male_only':
      parts.push('仅限男队');
      break;
    case 'female_only':
      parts.push('仅限女队');
      break;
    case 'fixed':
      parts.push(`固定男 ${config.requiredMaleCount} 人 / 女 ${config.requiredFemaleCount} 人`);
      break;
    case 'minimum':
      parts.push(`至少男 ${config.requiredMaleCount} 人 / 女 ${config.requiredFemaleCount} 人`);
      break;
    default:
      parts.push('性别不限');
      break;
  }

  return parts.join(' · ');
}

function normalizeMember(member = {}) {
  return {
    user_id: member.user_id,
    name: member.name || '',
    avatar_url: member.avatar_url || '',
    gender: member.gender || '',
    phone: member.phone || '',
    school_name: member.school_name || '',
    college_name: member.college_name || '',
    isLeader: !!member.is_team_leader,
    isParticipating: member.is_participating !== 0,
    isSingles: !!member.is_singles_player
  };
}

function buildDefaultLeader(user = {}, leaderParticipates = true) {
  return {
    user_id: user.id || user.user_id,
    name: user.name || app.globalData.userInfo?.name || '领队',
    avatar_url: user.avatar_url || app.globalData.userInfo?.avatar_url || '',
    gender: user.gender || app.globalData.userInfo?.gender || '',
    phone: user.phone || '',
    school_name: user.school_name || '',
    college_name: user.college_name || '',
    isLeader: true,
    isParticipating: !!leaderParticipates,
    isSingles: false
  };
}

function calcStats(members = [], pendingInvitations = []) {
  let actualPlayerCount = 0;
  let maleCount = 0;
  let femaleCount = 0;
  let singlesCount = 0;

  members.forEach((member) => {
    const counted = member.isLeader ? member.isParticipating : true;
    if (!counted) {
      return;
    }
    actualPlayerCount += 1;
    if (member.gender === 'male') {
      maleCount += 1;
    } else if (member.gender === 'female') {
      femaleCount += 1;
    }
    if (member.isSingles) {
      singlesCount += 1;
    }
  });

  return {
    actualPlayerCount,
    occupiedSlots: actualPlayerCount + (pendingInvitations || []).length,
    maleCount,
    femaleCount,
    singlesCount
  };
}

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    teamName: '',
    hasTeamName: false,
    leaderParticipates: true,
    members: [],
    pendingInvitations: [],
    submitted: false,
    isLoading: true,
    isSavingDraft: false,
    isCreatingInvitation: false,
    isSubmitting: false,
    ruleText: '',
    config: normalizeConfig(),
    actualPlayerCount: 0,
    occupiedSlots: 0,
    maleCount: 0,
    femaleCount: 0,
    singlesCount: 0
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ eventId: options.id });
      this.loadData();
    }
  },

  onShow() {
    if (this.data.eventId && getCurrentUserId()) {
      this.loadDraftStatus({ silent: true });
    }
  },

  async loadData() {
    const eventId = this.data.eventId;
    const currentUserId = getCurrentUserId();

    if (!eventId) {
      return;
    }

    try {
      const requests = [
        this.request(`/api/events/${eventId}`)
      ];

      if (app.globalData.userInfo?.openid) {
        requests.push(this.request('/api/user/profile', { openid: app.globalData.userInfo.openid }));
      } else {
        requests.push(Promise.resolve({ success: false }));
      }

      if (currentUserId) {
        requests.push(this.request(`/api/events/${eventId}/captain-status`, { user_id: currentUserId }));
      } else {
        requests.push(Promise.resolve({ success: false }));
      }

      const [eventRes, userRes, captainRes] = await Promise.all(requests);
      const event = eventRes.success ? eventRes.data.event : null;
      const user = userRes.success ? userRes.data : {
        ...(app.globalData.userInfo || {}),
        id: currentUserId,
        user_id: currentUserId
      };
      const leaderParticipates = captainRes.success && captainRes.data?.application
        ? captainRes.data.application.is_participating !== 0
        : true;

      this.setData({
        event,
        user,
        leaderParticipates,
        config: normalizeConfig(event),
        ruleText: buildRuleText(normalizeConfig(event))
      });

      await this.loadDraftStatus({ silent: true, fallbackLeaderParticipates: leaderParticipates });
    } catch (error) {
      console.error('加载团体赛报名页失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  syncState({
    teamName,
    leaderParticipates,
    members,
    pendingInvitations,
    submitted,
    config
  }) {
    const nextConfig = config || this.data.config || normalizeConfig(this.data.event);
    const normalizedMembers = members || [];
    const normalizedPendingInvitations = pendingInvitations || [];
    const stats = calcStats(normalizedMembers, normalizedPendingInvitations);

    this.setData({
      teamName,
      hasTeamName: !!(teamName || '').trim(),
      leaderParticipates,
      members: normalizedMembers,
      pendingInvitations: normalizedPendingInvitations,
      submitted: !!submitted,
      config: nextConfig,
      ruleText: buildRuleText(nextConfig),
      ...stats
    });
  },

  initDraftState(fallbackLeaderParticipates) {
    const leaderParticipates = typeof fallbackLeaderParticipates === 'boolean'
      ? fallbackLeaderParticipates
      : this.data.leaderParticipates;
    const leader = this.data.user ? [buildDefaultLeader(this.data.user, leaderParticipates)] : [];

    this.syncState({
      teamName: this.data.teamName || '',
      leaderParticipates,
      members: leader,
      pendingInvitations: [],
      submitted: false,
      config: normalizeConfig(this.data.event)
    });
  },

  async loadDraftStatus(options = {}) {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || !this.data.eventId) {
      return;
    }

    try {
      const res = await this.request(`/api/events/${this.data.eventId}/team-draft-status`, {
        user_id: currentUserId
      });

      if (!res.success) {
        if (!options.silent) {
          wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        }
        return;
      }

      const draft = res.data;
      const config = normalizeConfig(this.data.event, draft.config);
      const currentSinglesIds = new Set(
        (this.data.members || [])
          .filter((member) => member.isSingles)
          .map((member) => member.user_id)
      );

      let members = (draft.members || []).map(normalizeMember);
      if (members.length === 0 && this.data.user) {
        this.initDraftState(options.fallbackLeaderParticipates);
        return;
      }

      members = members.map((member) => {
        if ((draft.submitted || member.isSingles) && !(member.isLeader && !member.isParticipating)) {
          return member;
        }
        return {
          ...member,
          isSingles: member.isParticipating && currentSinglesIds.has(member.user_id)
        };
      });

      const leader = members.find((member) => member.isLeader);
      this.syncState({
        teamName: draft.team_name || '',
        leaderParticipates: leader ? leader.isParticipating : !!draft.leader_participating,
        members,
        pendingInvitations: (draft.pending_invitations || []).map((invitation, index) => ({
          ...invitation,
          display_name: invitation.invitee_name || `待分享邀请 ${index + 1}`
        })),
        submitted: draft.submitted,
        config
      });
    } catch (error) {
      console.error('加载队伍草稿失败:', error);
      if (!options.silent) {
        wx.showToast({ title: '加载队伍失败', icon: 'none' });
      }
      if (this.data.user) {
        this.initDraftState(options.fallbackLeaderParticipates);
      }
    }
  },

  onTeamNameInput(e) {
    const teamName = e.detail.value;
    this.setData({
      teamName,
      hasTeamName: !!teamName.trim()
    });
  },

  async onTeamNameBlur() {
    if (this.data.submitted || !this.data.teamName.trim()) {
      return;
    }
    await this.saveDraft({ silent: true });
  },

  onLeaderParticipatingChange(e) {
    if (this.data.submitted) {
      return;
    }

    const leaderParticipates = !!e.detail.value;
    const members = (this.data.members || []).map((member) => {
      if (!member.isLeader) {
        return member;
      }
      return {
        ...member,
        isParticipating: leaderParticipates,
        isSingles: leaderParticipates ? member.isSingles : false
      };
    });

    this.syncState({
      teamName: this.data.teamName,
      leaderParticipates,
      members,
      pendingInvitations: this.data.pendingInvitations,
      submitted: false
    });

    if (this.data.teamName.trim()) {
      this.saveDraft({ silent: true });
    }
  },

  async saveDraft(options = {}) {
    const currentUserId = getCurrentUserId();
    const teamName = (this.data.teamName || '').trim();

    if (!currentUserId) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return false;
    }

    if (!teamName) {
      if (!options.silent) {
        wx.showToast({ title: '请先填写队伍名称', icon: 'none' });
      }
      return false;
    }

    if (this.data.isSavingDraft) {
      return false;
    }

    this.setData({ isSavingDraft: true });

    try {
      const res = await this.request(
        `/api/events/${this.data.eventId}/team-draft`,
        {
          user_id: currentUserId,
          team_name: teamName,
          leader_participating: this.data.leaderParticipates ? 1 : 0
        },
        'PUT'
      );

      if (!res.success) {
        if (!options.silent) {
          wx.showToast({ title: res.message || '保存失败', icon: 'none' });
        }
        return false;
      }

      await this.loadDraftStatus({ silent: true });

      if (!options.silent) {
        wx.showToast({ title: '已保存', icon: 'success' });
      }
      return true;
    } catch (error) {
      console.error('保存草稿失败:', error);
      if (!options.silent) {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
      return false;
    } finally {
      this.setData({ isSavingDraft: false });
    }
  },

  async onCreateInvitation() {
    if (this.data.submitted || this.data.isCreatingInvitation) {
      return;
    }

    const { occupiedSlots, config } = this.data;
    if (occupiedSlots >= config.maxTeamPlayers) {
      wx.showToast({ title: '已达队伍人数上限', icon: 'none' });
      return;
    }

    const saved = await this.saveDraft({ silent: true });
    if (!saved) {
      return;
    }

    this.setData({ isCreatingInvitation: true });

    try {
      const res = await this.request(
        `/api/events/${this.data.eventId}/team-invitations`,
        {
          user_id: getCurrentUserId(),
          team_name: this.data.teamName.trim(),
          leader_participating: this.data.leaderParticipates ? 1 : 0
        },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message || '创建邀请失败', icon: 'none' });
        return;
      }

      await this.loadDraftStatus({ silent: true });
      wx.showModal({
        title: '邀请已创建',
        content: '请点击待处理邀请中的“分享邀请”，把链接发给队友。',
        showCancel: false
      });
    } catch (error) {
      console.error('创建邀请失败:', error);
      wx.showToast({ title: '创建邀请失败', icon: 'none' });
    } finally {
      this.setData({ isCreatingInvitation: false });
    }
  },

  onToggleSingles(e) {
    if (this.data.submitted) {
      return;
    }

    const userId = parseInt(e.currentTarget.dataset.userId, 10);
    const members = [...(this.data.members || [])];
    const memberIndex = members.findIndex((member) => member.user_id === userId);
    if (memberIndex < 0) {
      return;
    }

    const member = members[memberIndex];
    if (member.isLeader && !member.isParticipating) {
      wx.showToast({ title: '领队未参赛，不能设为单打', icon: 'none' });
      return;
    }

    const singlesCount = members.filter((item) => item.isSingles).length;
    if (!member.isSingles && singlesCount >= this.data.config.singlesPlayerCount) {
      wx.showToast({ title: `最多指定 ${this.data.config.singlesPlayerCount} 名单打`, icon: 'none' });
      return;
    }

    members[memberIndex] = {
      ...member,
      isSingles: !member.isSingles
    };

    this.syncState({
      teamName: this.data.teamName,
      leaderParticipates: this.data.leaderParticipates,
      members,
      pendingInvitations: this.data.pendingInvitations,
      submitted: false
    });
  },

  async onRemoveMember(e) {
    const memberId = parseInt(e.currentTarget.dataset.memberId, 10);
    if (!memberId) {
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '删除队员',
        content: '删除后该名额会立即释放，队员需要重新接受邀请才能再次加入。是否继续？',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmed) {
      return;
    }

    try {
      const res = await this.request(
        `/api/events/${this.data.eventId}/team-members/${memberId}/remove`,
        { user_id: getCurrentUserId() },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message || '删除失败', icon: 'none' });
        return;
      }

      await this.loadDraftStatus({ silent: true });
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (error) {
      console.error('删除队员失败:', error);
      wx.showToast({ title: '删除失败', icon: 'none' });
    }
  },

  async onCancelInvitation(e) {
    const invitationId = parseInt(e.currentTarget.dataset.invitationId, 10);
    if (!invitationId) {
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '取消邀请',
        content: '取消后该待处理邀请会失效，名额立即释放。是否继续？',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmed) {
      return;
    }

    try {
      const res = await this.request(
        `/api/events/${this.data.eventId}/team-invitations/${invitationId}/cancel`,
        { user_id: getCurrentUserId() },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message || '取消失败', icon: 'none' });
        return;
      }

      await this.loadDraftStatus({ silent: true });
      wx.showToast({ title: '已取消', icon: 'success' });
    } catch (error) {
      console.error('取消邀请失败:', error);
      wx.showToast({ title: '取消失败', icon: 'none' });
    }
  },

  async onSaveDraft() {
    await this.saveDraft();
  },

  async onSubmit() {
    if (this.data.submitted || this.data.isSubmitting) {
      return;
    }

    const teamName = (this.data.teamName || '').trim();
    if (!teamName) {
      wx.showToast({ title: '请先填写队伍名称', icon: 'none' });
      return;
    }

    if (this.data.pendingInvitations.length > 0) {
      wx.showToast({ title: '还有待处理邀请，暂不能提交', icon: 'none' });
      return;
    }

    if (this.data.actualPlayerCount < this.data.config.minTeamPlayers) {
      wx.showToast({ title: `至少需要 ${this.data.config.minTeamPlayers} 名参赛队员`, icon: 'none' });
      return;
    }

    if (this.data.actualPlayerCount > this.data.config.maxTeamPlayers) {
      wx.showToast({ title: `每队最多 ${this.data.config.maxTeamPlayers} 人`, icon: 'none' });
      return;
    }

    if (this.data.singlesCount !== this.data.config.singlesPlayerCount) {
      wx.showToast({ title: `请指定 ${this.data.config.singlesPlayerCount} 名单打队员`, icon: 'none' });
      return;
    }

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认正式提交',
        content: '提交后队名、队员名单和单打名单会立即锁定，且未提交队伍仍不会在前后台显示。是否继续？',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmed) {
      return;
    }

    const saved = await this.saveDraft({ silent: true });
    if (!saved) {
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      await subscribe.requestEventSubscriptions();
    } catch (error) {
      console.log('订阅消息授权失败或被拒绝:', error);
    }

    try {
      const singlesPlayerIds = (this.data.members || [])
        .filter((member) => member.isSingles)
        .map((member) => member.user_id);

      const res = await this.request(
        `/api/events/${this.data.eventId}/team-submit`,
        {
          user_id: getCurrentUserId(),
          team_name: teamName,
          leader_participating: this.data.leaderParticipates ? 1 : 0,
          singles_player_ids: singlesPlayerIds
        },
        'POST'
      );

      if (!res.success) {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
        return;
      }

      await this.loadDraftStatus({ silent: true });
      wx.showToast({ title: '报名成功', icon: 'success' });
    } catch (error) {
      console.error('正式提交失败:', error);
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
  },

  onStopPropagation() {
    // Prevent event bubbling
  },

  onGoBack() {
    wx.navigateBack();
  },

  onShareAppMessage(res) {
    const token = res?.target?.dataset?.token || this.data.pendingInvitations?.[0]?.invite_token;
    const teamName = (this.data.teamName || '我的队伍').trim();
    const eventTitle = this.data.event?.title || '团体赛';

    if (!token) {
      return {
        title: `${teamName} 邀请你参加 ${eventTitle}`,
        path: `/pages/event-detail/event-detail?id=${this.data.eventId}`
      };
    }

    return {
      title: `邀请你加入“${teamName}”参加 ${eventTitle}`,
      path: `/pages/team-invite/team-invite?token=${token}`
    };
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});
