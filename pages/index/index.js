const app = getApp();

Page({
  data: {
    // 状态
    isLoggedIn: false,
    isRegistered: false,
    userInfo: null,
    showPrivacyModal: false,

    // 快捷入口
    quickActions: [
      { icon: '🏓', label: '约球', desc: '找球友切磋', url: '/pages/square/square' },
      { icon: '📍', label: '签到', desc: '活动打卡', url: '' },
      { icon: '🏆', label: '赛事', desc: '报名比赛', url: '/pages/events/events' },
      { icon: '📊', label: '排行', desc: '积分排名', url: '' }
    ],

    // 最近赛事
    recentEvents: [
      { id: 1, title: '新生杯乒乓球赛', date: '12月20日', status: '报名中', statusColor: 'green' },
      { id: 2, title: '学院友谊赛', date: '12月25日', status: '即将开始', statusColor: 'orange' }
    ],

    // 统计数据
    stats: {
      matches: 0,
      wins: 0,
      events: 0,
      checkins: 0
    }
  },

  onLoad() {
    this.updateLoginStatus();
  },

  onShow() {
    this.updateLoginStatus();
  },

  // 更新登录状态
  updateLoginStatus() {
    const { isLoggedIn, isRegistered, userInfo } = app.globalData;
    this.setData({
      isLoggedIn,
      isRegistered,
      userInfo
    });
  },

  // 点击登录
  onTapLogin() {
    // 先显示隐私政策
    this.setData({ showPrivacyModal: true });
  },

  // 同意隐私政策
  async onAgreePrivacy() {
    this.setData({ showPrivacyModal: false });

    wx.showLoading({ title: '登录中...' });

    try {
      await app.wxLogin();
      await app.agreePrivacy();
      this.updateLoginStatus();

      wx.hideLoading();

      // 如果未注册，跳转到注册页
      if (!app.globalData.isRegistered) {
        wx.navigateTo({ url: '/pages/register/register' });
      } else {
        wx.showToast({ title: '登录成功', icon: 'success' });
      }
    } catch (error) {
      wx.hideLoading();
      console.error('登录失败:', error);
      wx.showToast({
        title: error.message || '登录失败',
        icon: 'none'
      });
    }
  },

  // 拒绝隐私政策
  onDisagreePrivacy() {
    this.setData({ showPrivacyModal: false });
    wx.showToast({
      title: '需要同意协议才能使用',
      icon: 'none'
    });
  },

  // 点击快捷入口
  onTapAction(e) {
    const { url } = e.currentTarget.dataset;
    if (!url) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
      return;
    }

    if (!this.data.isLoggedIn) {
      this.onTapLogin();
      return;
    }

    if (!this.data.isRegistered) {
      wx.navigateTo({ url: '/pages/register/register' });
      return;
    }

    // 判断是否是 tabBar 页面
    if (['/pages/square/square', '/pages/events/events'].includes(url)) {
      wx.switchTab({ url });
    } else {
      wx.navigateTo({ url });
    }
  },

  // 点击赛事
  onTapEvent(e) {
    const { id } = e.currentTarget.dataset;
    wx.showToast({ title: `赛事详情 ${id}`, icon: 'none' });
  },

  // 去完善信息
  goToRegister() {
    wx.navigateTo({ url: '/pages/register/register' });
  }
});
