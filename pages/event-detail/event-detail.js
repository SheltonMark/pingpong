// pages/event-detail/event-detail.js
const app = getApp();
const subscribe = require('../../utils/subscribe');

// 日期格式化工具
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours().toString().padStart(2, '0');
  const minute = d.getMinutes().toString().padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
};

// 处理富文本中的图片，限制尺寸并补全URL
const processRichTextImages = (html) => {
  if (!html) return '';
  const baseUrl = getApp().globalData.baseUrl;
  // 将相对路径 src="/uploads/..." 补全为绝对URL
  let processed = html.replace(/src="(\/uploads\/[^"]+)"/gi, `src="${baseUrl}$1"`);
  // 给所有 img 标签：移除 data-href 等不支持的属性，添加样式限制宽度
  processed = processed.replace(/<img([^>]*)>/gi, (match, attrs) => {
    // 提取 src 属性
    const srcMatch = attrs.match(/src="([^"]*)"/i);
    const src = srcMatch ? srcMatch[1] : '';
    if (!src) return '';
    return `<img src="${src}" style="max-width:100%;height:auto;display:block;">`;
  });
  return processed;
};

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
    // 领队申请相关
    captainStatus: null, // null: 未申请, pending: 待审批, approved: 已通过, rejected: 已拒绝
    isCaptain: false,
    // 团体赛相关
    teamCount: 0,
    hasTeamRegistered: false,
    teams: []
  },

  onLoad(options) {
    this.setData({ eventId: options.id });
    this.loadEventDetail();
  },

  // 加载赛事详情
  async loadEventDetail() {
    try {
      const res = await app.request(`/api/events/${this.data.eventId}`);

      if (res.success) {
        const event = res.data.event;
        // 格式化日期显示
        event.event_start_display = formatDate(event.event_start);
        event.event_end_display = formatDate(event.event_end);
        event.registration_end_display = formatDate(event.registration_end);
        // 处理赛事说明中的图片尺寸
        if (event.description) {
          event.description = processRichTextImages(event.description);
        }

        this.setData({
          event: event,
          registrations: res.data.registrations,
          loading: false
        });
        this.checkRegistrationStatus();
        this.loadMatches();
        // 团体赛加载领队状态
        if (event.event_type === 'team') {
          this.loadCaptainStatus();
        }
      }
    } catch (error) {
      console.error('加载失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 加载对阵表
  async loadMatches() {
    try {
      const res = await app.request(`/api/events/${this.data.eventId}/matches`);

      if (res.success) {
        this.setData({ matches: res.data });
      }
    } catch (error) {
      console.error('加载对阵表失败:', error);
    }
  },

  // 加载领队状态
  async loadCaptainStatus() {
    const userId = app.globalData.userInfo?.user_id;
    if (!userId) return;

    try {
      const res = await app.request(`/api/events/${this.data.eventId}/captain-status`, { user_id: userId });

      if (res.success) {
        this.setData({
          isCaptain: res.data.isCaptain,
          captainStatus: res.data.application?.status || null
        });
      }
    } catch (error) {
      console.error('加载领队状态失败:', error);
    }
  },

  // 申请成为领队
  async onApplyCaptain() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '申请成为领队',
      content: '领队可以组建队伍并管理队员报名。确定申请吗？',
      success: async (res) => {
        if (res.confirm) {
          // 请求审核结果订阅消息授权
          try {
            await subscribe.requestApprovalSubscription();
          } catch (err) {
            console.log('订阅请求失败或用户拒绝:', err);
          }

          try {
            const result = await app.request(`/api/events/${this.data.eventId}/apply-captain`, { user_id: app.globalData.userInfo.user_id }, 'POST');

            if (result.success) {
              wx.showToast({ title: '申请已提交', icon: 'success' });
              this.setData({ captainStatus: 'pending' });
            } else {
              wx.showToast({ title: result.message || '申请失败', icon: 'none' });
            }
          } catch (error) {
            console.error('申请领队失败:', error);
            wx.showToast({ title: '申请失败', icon: 'none' });
          }
        }
      }
    });
  },

  // 检查当前用户是否已报名
  checkRegistrationStatus() {
    const userId = app.globalData.userInfo?.user_id;
    if (!userId) return;

    const myReg = this.data.registrations.find(r => r.user_id === userId);
    this.setData({
      isRegistered: !!myReg,
      myRegistration: myReg || null
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
      wx.navigateTo({ url: `/pages/doubles-register/doubles-register?id=${event.id}` });
    } else {
      wx.navigateTo({ url: `/pages/team-register/team-register?id=${event.id}` });
    }
  },

  // 单打报名
  async registerSingles() {
    wx.showModal({
      title: '确认报名',
      content: `确定报名参加"${this.data.event.title}"吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await app.request(`/api/events/${this.data.eventId}/register`, { user_id: app.globalData.userInfo.user_id }, 'POST');

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
          try {
            const result = await app.request(`/api/events/${this.data.eventId}/cancel`, { user_id: app.globalData.userInfo.user_id }, 'POST');

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

  // 双打报名
  onRegisterDoubles() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/doubles-register/doubles-register?id=${this.data.eventId}`
    });
  },

  // 团体赛报名（领队）
  onRegisterTeam() {
    if (!this.data.isCaptain) {
      wx.showToast({ title: '请先申请成为领队', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/team-register/team-register?id=${this.data.eventId}`
    });
  },

  // 取消团体赛报名
  onCancelTeamRegister() {
    wx.showModal({
      title: '取消队伍报名',
      content: '确定要取消队伍报名吗？队伍中的所有队员报名都将被取消。',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await app.request(`/api/events/${this.data.eventId}/cancel-team`, { user_id: app.globalData.userInfo.user_id }, 'POST');

            if (result.success) {
              wx.showToast({ title: '已取消', icon: 'success' });
              this.setData({ hasTeamRegistered: false });
              this.loadEventDetail();
            } else {
              wx.showToast({ title: result.message || '取消失败', icon: 'none' });
            }
          } catch (error) {
            console.error('取消失败:', error);
            wx.showToast({ title: '取消失败', icon: 'none' });
          }
        }
      }
    });
  }
});
