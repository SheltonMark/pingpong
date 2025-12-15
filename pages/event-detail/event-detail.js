// pages/event-detail/event-detail.js
const app = getApp();

Page({
  data: {
    eventId: null,
    event: null,
    registrations: [],
    matches: [],
    currentTab: 'info', // info, players, matches
    isRegistered: false,
    myRegistration: null,
    loading: true,
    useMock: true
  },

  onLoad(options) {
    this.setData({ eventId: options.id });
    this.loadEventDetail();
  },

  // 加载赛事详情
  async loadEventDetail() {
    if (this.data.useMock) {
      setTimeout(() => {
        this.setData({
          event: this.getMockEvent(),
          registrations: this.getMockRegistrations(),
          matches: this.getMockMatches(),
          loading: false
        });
        this.checkRegistrationStatus();
      }, 500);
      return;
    }

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/events/${this.data.eventId}`,
          success: (res) => resolve(res.data),
          fail: reject
        });
      });

      if (res.success) {
        this.setData({
          event: res.data.event,
          registrations: res.data.registrations,
          loading: false
        });
        this.checkRegistrationStatus();
        this.loadMatches();
      }
    } catch (error) {
      console.error('加载失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 加载对阵表
  async loadMatches() {
    if (this.data.useMock) return;

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/events/${this.data.eventId}/matches`,
          success: (res) => resolve(res.data),
          fail: reject
        });
      });

      if (res.success) {
        this.setData({ matches: res.data });
      }
    } catch (error) {
      console.error('加载对阵表失败:', error);
    }
  },

  // 检查当前用户是否已报名
  checkRegistrationStatus() {
    const userId = app.globalData.userInfo?.user_id;
    if (!userId) return;

    const myReg = this.data.registrations.find(r => r.user_id === userId);
    this.setData({
      isRegistered: !!myReg,
      myRegistration: myReg
    });
  },

  // 切换标签
  onTabChange(e) {
    const { tab } = e.currentTarget.dataset;
    this.setData({ currentTab: tab });
  },

  // 报名
  onRegister() {
    const { event } = this.data;
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (event.event_type === 'singles') {
      this.registerSingles();
    } else if (event.event_type === 'doubles') {
      wx.navigateTo({ url: `/pages/doubles-register/doubles-register?event_id=${event.id}` });
    } else {
      wx.navigateTo({ url: `/pages/team-register/team-register?event_id=${event.id}` });
    }
  },

  // 单打报名
  async registerSingles() {
    wx.showModal({
      title: '确认报名',
      content: `确定报名参加"${this.data.event.title}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          if (this.data.useMock) {
            wx.showToast({ title: '报名成功', icon: 'success' });
            this.setData({ isRegistered: true });
            return;
          }

          try {
            const result = await new Promise((resolve, reject) => {
              wx.request({
                url: `${app.globalData.baseUrl}/api/events/${this.data.eventId}/register`,
                method: 'POST',
                data: { user_id: app.globalData.userInfo.user_id },
                success: (res) => resolve(res.data),
                fail: reject
              });
            });

            if (result.success) {
              wx.showToast({ title: '报名成功', icon: 'success' });
              this.setData({ isRegistered: true });
              this.loadEventDetail();
            } else {
              wx.showToast({ title: result.message || '报名失败', icon: 'none' });
            }
          } catch (error) {
            console.error('报名失败:', error);
            wx.showToast({ title: '报名失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 取消报名
  onCancelRegister() {
    wx.showModal({
      title: '取消报名',
      content: '确定要取消报名吗？',
      success: async (res) => {
        if (res.confirm) {
          if (this.data.useMock) {
            wx.showToast({ title: '已取消', icon: 'success' });
            this.setData({ isRegistered: false });
            return;
          }

          try {
            const result = await new Promise((resolve, reject) => {
              wx.request({
                url: `${app.globalData.baseUrl}/api/events/${this.data.eventId}/cancel`,
                method: 'POST',
                data: { user_id: app.globalData.userInfo.user_id },
                success: (res) => resolve(res.data),
                fail: reject
              });
            });

            if (result.success) {
              wx.showToast({ title: '已取消', icon: 'success' });
              this.setData({ isRegistered: false });
              this.loadEventDetail();
            }
          } catch (error) {
            console.error('取消失败:', error);
          }
        }
      }
    });
  },

  // Mock 数据
  getMockEvent() {
    return {
      id: 1,
      title: '新生杯乒乓球赛',
      description: '欢迎2024级新生参加！本次比赛采用淘汰赛制，5局3胜。获得前三名的选手将获得奖品和证书。',
      event_type: 'singles',
      event_format: 'knockout',
      best_of: 5,
      status: 'registration',
      registration_start: '2024-12-01 00:00',
      registration_end: '2024-12-18 23:59',
      event_start: '2024-12-20 09:00',
      event_end: '2024-12-20 18:00',
      location: '体育馆一楼',
      max_participants: 32,
      counts_for_ranking: true,
      school_name: '浙江工业大学',
      creator_name: '张老师'
    };
  },

  getMockRegistrations() {
    return [
      { id: 1, user_id: 101, name: '张明远', avatar_url: '', college_name: '计算机学院' },
      { id: 2, user_id: 102, name: '李思源', avatar_url: '', college_name: '机械学院' },
      { id: 3, user_id: 103, name: '王浩然', avatar_url: '', college_name: '材料学院' },
      { id: 4, user_id: 104, name: '陈晓东', avatar_url: '', college_name: '电气学院' },
      { id: 5, user_id: 105, name: '刘志强', avatar_url: '', college_name: '土木学院' }
    ];
  },

  getMockMatches() {
    return [
      { id: 1, round: 1, match_order: 1, player1_name: '张明远', player2_name: '李思源', status: 'scheduled' },
      { id: 2, round: 1, match_order: 2, player1_name: '王浩然', player2_name: '陈晓东', status: 'scheduled' }
    ];
  }
});
