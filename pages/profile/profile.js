const app = getApp();

Page({
  data: {
    isLoggedIn: false,
    isRegistered: false,
    userInfo: null,

    // 菜单列表
    menuItems: [
      { icon: '🏓', label: '我的约球', desc: '查看约球记录', url: '' },
      { icon: '🏆', label: '我的赛事', desc: '查看参赛记录', url: '' },
      { icon: '👥', label: '我的队伍', desc: '管理队伍信息', url: '' },
      { icon: '📊', label: '战绩统计', desc: '胜负数据分析', url: '' },
      { icon: '⚙️', label: '设置', desc: '账号与偏好设置', url: '/pages/settings/settings' }
    ]
  },

  onLoad() {
    this.updateUserInfo();
  },

  onShow() {
    this.updateUserInfo();
  },

  // 更新用户信息
  updateUserInfo() {
    const { isLoggedIn, isRegistered, userInfo } = app.globalData;
    this.setData({
      isLoggedIn,
      isRegistered,
      userInfo
    });
  },

  // 去登录
  goToLogin() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 去完善信息
  goToRegister() {
    wx.navigateTo({ url: '/pages/register/register' });
  },

  // 点击菜单项
  onTapMenu(e) {
    const { url } = e.currentTarget.dataset;

    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    if (!this.data.isRegistered) {
      wx.showToast({ title: '请先完善信息', icon: 'none' });
      return;
    }

    if (!url) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
      return;
    }

    wx.navigateTo({ url });
  },

  // 查看隐私政策
  viewPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy?type=privacy-policy' });
  },

  // 查看用户协议
  viewAgreement() {
    wx.navigateTo({ url: '/pages/privacy/privacy?type=user-agreement' });
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.logout();
          this.updateUserInfo();
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      }
    });
  }
});
