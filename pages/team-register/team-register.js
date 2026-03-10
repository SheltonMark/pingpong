const app = getApp();
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    teamName: '',
    teamSlots: [],
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
        event.format_label = this.parseFormat(event.format);
        this.setData({ event });
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
        this.setData({
          hasExistingTeam: true,
          teamName: res.data.team_name || this.data.teamName
        });
        this.fillSlotsFromMembers(res.data.members);
      } else {
        this.initTeamSlots(this.data.event);
      }
    } catch (error) {
      console.error('刷新队伍失败:', error);
      this.initTeamSlots(this.data.event);
    }
  },

  // 用后端返回的成员数据填充槽位
  fillSlotsFromMembers(members) {
    if (!this.data.event) return;
    const slots = [];
    const format = this.data.event.format || '3S2D';
    const singlesMatch = format.match(/(\d+)S/i);
    const doublesMatch = format.match(/(\d+)D/i);
    const singlesCount = singlesMatch ? parseInt(singlesMatch[1]) : 3;
    const doublesCount = doublesMatch ? parseInt(doublesMatch[1]) : 2;
    const totalSlots = singlesCount + doublesCount;

    // 先放领队
    const leader = members.find(m => m.is_team_leader);
    const others = members.filter(m => !m.is_team_leader);

    // 填充槽位
    for (let i = 0; i < totalSlots; i++) {
      const position = i < singlesCount ? `单打${i + 1}` : `双打${i - singlesCount + 1}`;
      let member = null;

      if (i === 0 && leader) {
        member = leader;
      } else if (i > 0 && i - 1 < others.length) {
        member = others[i - 1];
      } else if (i === 0 && !leader && this.data.user) {
        // 领队还没提交报名，用本地用户信息
        slots.push({
          type: i < singlesCount ? 'singles' : 'doubles',
          position,
          user: this.data.user,
          isLeader: true,
          status: 'confirmed',
          isSingles: false
        });
        continue;
      }

      if (member) {
        slots.push({
          type: i < singlesCount ? 'singles' : 'doubles',
          position,
          user: { id: member.user_id, name: member.name, avatar_url: member.avatar_url },
          isLeader: !!member.is_team_leader,
          status: member.status || 'confirmed',
          isSingles: !!member.is_singles_player
        });
      } else {
        slots.push({
          type: i < singlesCount ? 'singles' : 'doubles',
          position,
          user: null,
          status: 'empty',
          isSingles: false
        });
      }
    }

    this.setData({ teamSlots: slots });
  },

  parseFormat(format) {
    if (!format) return '团体赛';
    const singles = format.match(/(\d+)S/i);
    const doubles = format.match(/(\d+)D/i);
    let label = '';
    if (singles) label += singles[1] + '单';
    if (doubles) label += doubles[1] + '双';
    return label || format;
  },

  initTeamSlots(event) {
    if (!event) return;
    const slots = [];
    const format = event.format || '3S2D';
    const singlesMatch = format.match(/(\d+)S/i);
    const doublesMatch = format.match(/(\d+)D/i);
    const singlesCount = singlesMatch ? parseInt(singlesMatch[1]) : 3;
    const doublesCount = doublesMatch ? parseInt(doublesMatch[1]) : 2;

    if (this.data.user) {
      slots.push({
        type: 'singles', position: '单打1',
        user: this.data.user, isLeader: true,
        status: 'confirmed', isSingles: false
      });
    }

    for (let i = slots.length; i < singlesCount; i++) {
      slots.push({ type: 'singles', position: `单打${i + 1}`, user: null, status: 'empty', isSingles: false });
    }
    for (let i = 0; i < doublesCount; i++) {
      slots.push({ type: 'doubles', position: `双打${i + 1}`, user: null, status: 'empty', isSingles: false });
    }

    this.setData({ teamSlots: slots });
  },

  onTeamNameInput(e) {
    this.setData({ teamName: e.detail.value });
  },

  // 点击已确认成员，切换单打标记
  onToggleSingles(e) {
    const index = e.currentTarget.dataset.index;
    const slot = this.data.teamSlots[index];
    if (!slot || !slot.user) return;

    const currentSinglesCount = this.data.teamSlots.filter(s => s.isSingles).length;

    if (!slot.isSingles && currentSinglesCount >= 3) {
      wx.showToast({ title: '最多选择3名单打选手', icon: 'none' });
      return;
    }

    const key = `teamSlots[${index}].isSingles`;
    this.setData({ [key]: !slot.isSingles });
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

  async onSubmit() {
    if (!this.data.teamName.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' });
      return;
    }

    const filledSlots = this.data.teamSlots.filter(s => s.user);
    if (filledSlots.length < this.data.teamSlots.length) {
      wx.showToast({ title: '队伍人数不足', icon: 'none' });
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
      const member_ids = this.data.teamSlots
        .filter(slot => slot.user && !slot.isLeader)
        .map(slot => slot.user.id);

      const singles_player_ids = this.data.teamSlots
        .filter(slot => slot.user && slot.isSingles)
        .map(slot => slot.user.id);

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
    const singlesIds = this.data.teamSlots
      .filter(s => s.user && s.isSingles)
      .map(s => s.user.id);

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

