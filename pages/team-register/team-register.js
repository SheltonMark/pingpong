const app = getApp();
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    eventId: null,
    event: null,
    user: null,
    teamName: '',
    teamSlots: [],
    availableUsers: [],
    isLoading: true,
    isSubmitting: false,
    showUserPicker: false,
    currentSlotIndex: null
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ eventId: options.id });
      this.loadData();
    }
  },

  async loadData() {
    try {
      const [eventRes, userRes, usersRes] = await Promise.all([
        this.request(`/api/events/${this.data.eventId}`),
        app.globalData.userInfo?.openid
          ? this.request('/api/user/profile', { openid: app.globalData.userInfo.openid })
          : Promise.resolve({ success: false }),
        this.request('/api/users/available')
      ]);

      if (eventRes.success) {
        const event = eventRes.data;
        event.format_label = this.parseFormat(event.format);
        this.setData({ event });
        this.initTeamSlots(event);
      }

      if (userRes.success) {
        this.setData({ user: userRes.data });
      }

      if (usersRes.success) {
        this.setData({ availableUsers: usersRes.data || [] });
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  parseFormat(format) {
    // Parse format like "3S2D" -> "3单2双"
    if (!format) return '团体赛';
    const singles = format.match(/(\d+)S/i);
    const doubles = format.match(/(\d+)D/i);
    let label = '';
    if (singles) label += singles[1] + '单';
    if (doubles) label += doubles[1] + '双';
    return label || format;
  },

  initTeamSlots(event) {
    const slots = [];
    const format = event.format || '3S2D';
    const singlesMatch = format.match(/(\d+)S/i);
    const doublesMatch = format.match(/(\d+)D/i);
    const singlesCount = singlesMatch ? parseInt(singlesMatch[1]) : 3;
    const doublesCount = doublesMatch ? parseInt(doublesMatch[1]) : 2;

    // Add leader as first slot
    if (this.data.user) {
      slots.push({
        type: 'singles',
        position: '单打1',
        user: this.data.user,
        isLeader: true,
        status: 'confirmed'
      });
    }

    // Add remaining singles slots
    for (let i = slots.length; i < singlesCount; i++) {
      slots.push({
        type: 'singles',
        position: `单打${i + 1}`,
        user: null,
        status: 'empty'
      });
    }

    // Add doubles slots
    for (let i = 0; i < doublesCount; i++) {
      slots.push({
        type: 'doubles',
        position: `双打${i + 1}`,
        user: null,
        status: 'empty'
      });
    }

    this.setData({ teamSlots: slots });
  },

  onInvite(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      showUserPicker: true,
      currentSlotIndex: index
    });
  },

  onSelectUser(e) {
    const user = e.currentTarget.dataset.user;
    const index = this.data.currentSlotIndex;

    if (index !== null) {
      const slots = [...this.data.teamSlots];
      slots[index] = {
        ...slots[index],
        user: user,
        status: 'pending'
      };
      this.setData({
        teamSlots: slots,
        showUserPicker: false,
        currentSlotIndex: null
      });

      // Send invitation
      this.sendInvitation(user.id, slots[index].position);
    }
  },

  async sendInvitation(userId, position) {
    try {
      await this.request('/api/events/team/invite', {
        event_id: this.data.eventId,
        inviter_id: app.globalData.userInfo.id,
        invitee_id: userId,
        position: position
      }, 'POST');
      wx.showToast({ title: '邀请已发送', icon: 'success' });
    } catch (error) {
      console.error('Invitation error:', error);
    }
  },

  onClosePicker() {
    this.setData({
      showUserPicker: false,
      currentSlotIndex: null
    });
  },

  onTeamNameInput(e) {
    this.setData({ teamName: e.detail.value });
  },

  async onSubmit() {
    if (!this.data.teamName.trim()) {
      wx.showToast({ title: '请输入队伍名称', icon: 'none' });
      return;
    }

    const allConfirmed = this.data.teamSlots.every(slot => slot.status === 'confirmed');
    if (!allConfirmed) {
      wx.showToast({ title: '需全员确认后才能提交', icon: 'none' });
      return;
    }

    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });

    // 请求赛事相关订阅消息授权（比赛提醒、比分确认）
    try {
      await subscribe.requestEventSubscriptions();
    } catch (err) {
      console.log('订阅请求失败或用户拒绝:', err);
      // 订阅失败不影响报名操作
    }

    try {
      // 提取队员ID（不包含领队自己）
      const member_ids = this.data.teamSlots
        .filter(slot => slot.user && !slot.isLeader)
        .map(slot => slot.user.id);

      const res = await this.request(`/api/events/${this.data.eventId}/register-team`, {
        user_id: app.globalData.userInfo.id,
        team_name: this.data.teamName.trim(),
        member_ids: member_ids
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

  getConfirmedCount() {
    return this.data.teamSlots.filter(s => s.status === 'confirmed').length;
  },

  request(url, data, method = 'GET') {
    return app.request(url, data, method);
  }
});
