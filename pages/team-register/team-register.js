const app = getApp();
const subscribe = require('../../utils/subscribe');
const AUTO_REFRESH_INTERVAL = 10000;

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
  const parts = [`每队 ${config.minTeamPlayers}-${config.maxTeamPlayers} 人`];

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

function buildRequirementText(config) {
  switch (config.genderRule) {
    case 'male_only':
      return '仅限男队';
    case 'female_only':
      return '仅限女队';
    case 'fixed':
      return `固定男 ${config.requiredMaleCount} 人 / 女 ${config.requiredFemaleCount} 人`;
    case 'minimum':
      return `至少男 ${config.requiredMaleCount} 人 / 女 ${config.requiredFemaleCount} 人`;
    default:
      return `至少 ${config.minTeamPlayers} 人成队，性别不限`;
  }
}

function buildProgressText(actualPlayerCount, pendingInvitationCount, config) {
  if (actualPlayerCount < config.minTeamPlayers) {
    return `还差 ${config.minTeamPlayers - actualPlayerCount} 人达到最低报名人数`;
  }

  if (actualPlayerCount >= config.maxTeamPlayers) {
    return '队伍人数已满，可直接确认项目分配并提交';
  }

  if (pendingInvitationCount > 0) {
    return `已满足最低报名人数，当前还有 ${pendingInvitationCount} 条邀请待确认`;
  }

  return '已满足最低报名人数，可继续补充队员或完善项目分配';
}

function buildInvitationStatusText(status) {
  switch (status) {
    case 'accepted':
      return '已接受';
    case 'rejected':
      return '已拒绝';
    case 'cancelled':
      return '已取消';
    case 'removed':
      return '已移除';
    case 'expired':
      return '已过期';
    default:
      return '待处理';
  }
}

function buildInvitationStatusDescription(invitation) {
  switch (invitation.status) {
    case 'accepted':
      return '';
    case 'rejected':
      return '已明确拒绝邀请，名额已释放';
    case 'cancelled':
      return '领队已取消该邀请，名额已释放';
    case 'removed':
      return '该队员已被移出队伍，名额已重新释放';
    case 'expired':
      return '该邀请已失效，不可继续使用';
    default:
      return '邀请已创建，等待队员加入或拒绝';
  }
}

function buildInvitationDisplayName(invitation = {}) {
  if (invitation.invitee_name) {
    return invitation.invitee_name;
  }

  switch (invitation.status) {
    case 'pending':
      return '待分享邀请';
    case 'cancelled':
      return '已取消邀请';
    case 'expired':
      return '已失效邀请';
    default:
      return '邀请记录';
  }
}

function formatInvitation(invitation = {}) {
  return {
    ...invitation,
    display_name: buildInvitationDisplayName(invitation),
    status_text: buildInvitationStatusText(invitation.status),
    status_description: buildInvitationStatusDescription(invitation),
    is_pending: invitation.status === 'pending',
    is_registered: !!invitation.invitee_id
  };
}

function calcProjectAssignmentStats(projectConfig, projectAssignments = {}) {
  if (!projectConfig || !projectConfig.projects) {
    return {
      totalProjectSlots: 0,
      assignedProjectSlots: 0
    };
  }

  let totalProjectSlots = 0;
  let assignedProjectSlots = 0;

  Object.entries(projectConfig.projects).forEach(([projectType, project]) => {
    if (!project || !project.enabled) {
      return;
    }

    const positions = projectAssignments[projectType] || [];
    if (projectType.includes('singles')) {
      totalProjectSlots += project.count;
      assignedProjectSlots += positions.filter((assignment) => assignment && assignment.player_a).length;
      return;
    }

    totalProjectSlots += project.count * 2;
    positions.forEach((assignment) => {
      if (assignment?.player_a) {
        assignedProjectSlots += 1;
      }
      if (assignment?.player_b) {
        assignedProjectSlots += 1;
      }
    });
  });

  return {
    totalProjectSlots,
    assignedProjectSlots
  };
}

function applyMemberProjects(members = [], memberProjects = {}) {
  return members.map((member) => {
    const projects = memberProjects[member.user_id] || [];
    const isSingles = member.isParticipating && (
      projects.includes('men_singles') || projects.includes('women_singles')
    );

    return {
      ...member,
      projects,
      isSingles
    };
  });
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

function calcStats(members = [], pendingInvitationCount = 0) {
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
    occupiedSlots: actualPlayerCount + pendingInvitationCount,
    maleCount,
    femaleCount,
    singlesCount
  };
}

function buildMemberState(members = [], pendingInvitations = [], config = normalizeConfig()) {
  const stats = calcStats(members, pendingInvitations.length);
  const maleMembers = members
    .filter((member) => member.gender === 'male' && member.isParticipating)
    .map((member) => ({
      label: member.name,
      value: member.user_id
    }));

  const femaleMembers = members
    .filter((member) => member.gender === 'female' && member.isParticipating)
    .map((member) => ({
      label: member.name,
      value: member.user_id
    }));

  return {
    maleMembers,
    femaleMembers,
    pendingInvitationCount: pendingInvitations.length,
    progressText: buildProgressText(stats.actualPlayerCount, pendingInvitations.length, config),
    ...stats
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
    invitations: [],
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
    pendingInvitationCount: 0,
    maleCount: 0,
    femaleCount: 0,
    singlesCount: 0,
    progressText: '',
    requirementText: '',
    assignedProjectSlots: 0,
    totalProjectSlots: 0,
    hasDraftChanges: false,
    hasProjectChanges: false,
    // 项目配置
    projectConfig: null,
    // 项目分配
    projectAssignments: {
      men_singles: [],
      women_singles: [],
      men_doubles: [],
      women_doubles: [],
      mixed_doubles: []
    },
    // 队员选项列表
    maleMembers: [],
    femaleMembers: []
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
      this.startAutoRefresh();
    }
  },

  onHide() {
    this.stopAutoRefresh();
  },

  onUnload() {
    this.stopAutoRefresh();
  },

  async loadData() {
    const eventId = this.data.eventId;
    const currentUserId = getCurrentUserId();

    if (!eventId) {
      return;
    }

    try {
      const requests = [
        this.request(`/api/events/${eventId}`),
        this.request(`/api/events/${eventId}/team-project-config`)
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

      const [eventRes, projectConfigRes, userRes, captainRes] = await Promise.all(requests);
      const event = eventRes.success ? eventRes.data.event : null;
      const projectConfig = projectConfigRes.success ? projectConfigRes.data : null;
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
        projectConfig,
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

  startAutoRefresh() {
    this.stopAutoRefresh();
    this.autoRefreshTimer = setInterval(() => {
      if (!this.data.eventId || !getCurrentUserId()) {
        return;
      }
      if (
        this.data.isLoading ||
        this.data.isSavingDraft ||
        this.data.isCreatingInvitation ||
        this.data.isSubmitting ||
        this.data.hasDraftChanges ||
        this.data.hasProjectChanges
      ) {
        return;
      }

      this.loadDraftStatus({ silent: true });
    }, AUTO_REFRESH_INTERVAL);
  },

  stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  },

  syncState({
    teamName,
    leaderParticipates,
    members,
    invitations,
    pendingInvitations,
    submitted,
    config
  }) {
    const nextConfig = config || this.data.config || normalizeConfig(this.data.event);
    const normalizedMembers = members || [];
    const normalizedInvitations = invitations || this.data.invitations || [];
    const normalizedPendingInvitations = pendingInvitations || normalizedInvitations.filter((invitation) => invitation.status === 'pending');
    const memberState = buildMemberState(normalizedMembers, normalizedPendingInvitations, nextConfig);
    const assignmentStats = calcProjectAssignmentStats(this.data.projectConfig, this.data.projectAssignments);

    this.setData({
      teamName,
      hasTeamName: !!(teamName || '').trim(),
      leaderParticipates,
      members: normalizedMembers,
      invitations: normalizedInvitations,
      pendingInvitations: normalizedPendingInvitations,
      submitted: !!submitted,
      config: nextConfig,
      ruleText: buildRuleText(nextConfig),
      requirementText: buildRequirementText(nextConfig),
      assignedProjectSlots: assignmentStats.assignedProjectSlots,
      totalProjectSlots: assignmentStats.totalProjectSlots,
      ...memberState
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
      invitations: [],
      pendingInvitations: [],
      submitted: false,
      config: normalizeConfig(this.data.event)
    });
    this.setData({
      hasDraftChanges: false,
      hasProjectChanges: false
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
      const invitations = (draft.invitations || draft.pending_invitations || []).map((invitation) =>
        formatInvitation(invitation)
      );
      this.syncState({
        teamName: draft.team_name || '',
        leaderParticipates: leader ? leader.isParticipating : !!draft.leader_participating,
        members,
        invitations,
        pendingInvitations: invitations.filter((invitation) => invitation.status === 'pending'),
        submitted: draft.submitted,
        config
      });

      // 加载项目分配
      await this.loadProjectAssignments();
      this.setData({
        hasDraftChanges: false,
        hasProjectChanges: false
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
      hasTeamName: !!teamName.trim(),
      hasDraftChanges: true
    });
  },

  async onTeamNameBlur() {
    if (this.data.submitted || !this.data.teamName.trim()) {
      return;
    }
    await this.saveDraft({ silent: true, reloadAfterSave: false });
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

    this.setData({ hasDraftChanges: true });

    if (this.data.teamName.trim()) {
      this.saveDraft({ silent: true, reloadAfterSave: false });
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

      const shouldReload = options.reloadAfterSave === true;

      this.setData({ hasDraftChanges: false });

      if (shouldReload) {
        await this.loadDraftStatus({ silent: true });
      }

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

  async saveTeamState(options = {}) {
    const draftSaved = await this.saveDraft({
      silent: true,
      reloadAfterSave: false
    });
    if (!draftSaved) {
      if (!options.silent) {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
      return false;
    }

    const projectSaved = await this.saveProjectAssignments();
    if (!projectSaved) {
      if (!options.silent) {
        wx.showToast({ title: '保存项目分配失败', icon: 'none' });
      }
      return false;
    }

    if (options.reloadAfterSave !== false) {
      await this.loadDraftStatus({ silent: true });
    }

    if (!options.silent) {
      wx.showToast({ title: '已保存', icon: 'success' });
    }

    return true;
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

    const saved = await this.saveDraft({ silent: true, reloadAfterSave: false });
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
    await this.saveTeamState();
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

    const confirmed = await new Promise((resolve) => {
      wx.showModal({
        title: '确认正式提交',
        content: '提交后队名、队员名单和项目分配会立即锁定，且未提交队伍仍不会在前后台显示。是否继续？',
        success: (res) => resolve(!!res.confirm),
        fail: () => resolve(false)
      });
    });

    if (!confirmed) {
      return;
    }

    const saved = await this.saveTeamState({ silent: true, reloadAfterSave: false });
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
      const res = await this.request(
        `/api/events/${this.data.eventId}/team-submit`,
        {
          user_id: getCurrentUserId(),
          team_name: teamName,
          leader_participating: this.data.leaderParticipates ? 1 : 0
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

  onProjectPlayerSelect(e) {
    if (this.data.submitted) {
      return;
    }

    const { project, position, player } = e.currentTarget.dataset;
    const selectedValue = e.detail.value;

    if (!project || position === undefined) {
      return;
    }

    const pos = parseInt(position, 10);
    const projectAssignments = { ...this.data.projectAssignments };

    // 确保该项目的数组存在
    if (!projectAssignments[project]) {
      projectAssignments[project] = [];
    }

    // 确保该位置的对象存在
    if (!projectAssignments[project][pos]) {
      projectAssignments[project][pos] = { player_a: null, player_b: null };
    }

    // 单打项目或双打的选手A/B
    if (player === 'a' || !player) {
      projectAssignments[project][pos].player_a = selectedValue || null;
    } else if (player === 'b') {
      projectAssignments[project][pos].player_b = selectedValue || null;
    }

    // 验证单打项目：同一项目的不同位置不能选择同一人
    if (!player && project.includes('singles')) {
      const selectedPlayers = projectAssignments[project]
        .map(assignment => assignment?.player_a)
        .filter(id => id);

      const duplicates = selectedPlayers.filter((id, index) =>
        selectedPlayers.indexOf(id) !== index
      );

      if (duplicates.length > 0) {
        wx.showToast({
          title: '同一项目不能选择同一人',
          icon: 'none'
        });
        projectAssignments[project][pos].player_a = null;
      }
    }

    // 验证双打项目的两个选手不能相同
    if (player && projectAssignments[project][pos].player_a && projectAssignments[project][pos].player_b) {
      if (projectAssignments[project][pos].player_a === projectAssignments[project][pos].player_b) {
        wx.showToast({ title: '双打选手A和选手B不能是同一人', icon: 'none' });
        if (player === 'b') {
          projectAssignments[project][pos].player_b = null;
        } else {
          projectAssignments[project][pos].player_a = null;
        }
      }
    }

    this.setData({
      projectAssignments,
      hasProjectChanges: true
    });

    // 更新队员的项目信息
    this.updateMemberProjects();
  },

  updateMemberProjects() {
    const { projectAssignments, members } = this.data;
    const memberProjects = {};

    // 遍历所有项目分配，构建每个队员参加的项目列表
    Object.keys(projectAssignments).forEach(projectType => {
      const positions = projectAssignments[projectType];
      positions.forEach(assignment => {
        if (assignment && assignment.player_a) {
          if (!memberProjects[assignment.player_a]) {
            memberProjects[assignment.player_a] = [];
          }
          if (!memberProjects[assignment.player_a].includes(projectType)) {
            memberProjects[assignment.player_a].push(projectType);
          }
        }
        if (assignment && assignment.player_b) {
          if (!memberProjects[assignment.player_b]) {
            memberProjects[assignment.player_b] = [];
          }
          if (!memberProjects[assignment.player_b].includes(projectType)) {
            memberProjects[assignment.player_b].push(projectType);
          }
        }
      });
    });

    // 更新队员的项目信息
    const updatedMembers = applyMemberProjects(members, memberProjects);
    const memberState = buildMemberState(updatedMembers, this.data.pendingInvitations, this.data.config);
    const assignmentStats = calcProjectAssignmentStats(this.data.projectConfig, projectAssignments);

    this.setData({
      members: updatedMembers,
      assignedProjectSlots: assignmentStats.assignedProjectSlots,
      totalProjectSlots: assignmentStats.totalProjectSlots,
      ...memberState
    });
  },

  async loadProjectAssignments() {
    const currentUserId = getCurrentUserId();
    if (!currentUserId || !this.data.eventId) {
      return;
    }

    try {
      const res = await this.request(`/api/events/${this.data.eventId}/team-project-assignments`, {
        user_id: currentUserId
      });

      if (res.success && res.data) {
        const assignments = res.data.assignments || [];
        const memberProjects = res.data.member_projects || {};

        // 构建项目分配数据结构
        const projectAssignments = {
          men_singles: [],
          women_singles: [],
          men_doubles: [],
          women_doubles: [],
          mixed_doubles: []
        };

        assignments.forEach(assignment => {
          const { project_type, position, player_a_id, player_b_id } = assignment;
          if (!projectAssignments[project_type]) {
            projectAssignments[project_type] = [];
          }
          projectAssignments[project_type][position - 1] = {
            player_a: player_a_id,
            player_b: player_b_id
          };
        });

        // 更新队员的项目信息
        const members = applyMemberProjects(this.data.members, memberProjects);
        const memberState = buildMemberState(members, this.data.pendingInvitations, this.data.config);
        const assignmentStats = calcProjectAssignmentStats(this.data.projectConfig, projectAssignments);

        this.setData({
          projectAssignments,
          members,
          assignedProjectSlots: assignmentStats.assignedProjectSlots,
          totalProjectSlots: assignmentStats.totalProjectSlots,
          ...memberState
        });
      }
    } catch (error) {
      console.error('加载项目分配失败:', error);
    }
  },

  async saveProjectAssignments() {
    const currentUserId = getCurrentUserId();
    const teamName = (this.data.teamName || '').trim();

    if (!currentUserId || !teamName) {
      return false;
    }

    try {
      // 构建assignments数组
      const assignments = [];
      const { projectAssignments } = this.data;

      Object.keys(projectAssignments).forEach(projectType => {
        const positions = projectAssignments[projectType];
        positions.forEach((assignment, index) => {
          if (assignment && assignment.player_a) {
            assignments.push({
              project: projectType,
              position: index + 1,
              player_a: assignment.player_a,
              player_b: assignment.player_b || null
            });
          }
        });
      });

      const res = await this.request(
        `/api/events/${this.data.eventId}/team-project-assignments`,
        {
          user_id: currentUserId,
          team_name: teamName,
          assignments
        },
        'PUT'
      );

      if (res.success) {
        this.setData({ hasProjectChanges: false });
      }

      return res.success;
    } catch (error) {
      console.error('保存项目分配失败:', error);
      return false;
    }
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
