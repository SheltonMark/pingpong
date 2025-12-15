const app = getApp();

Page({
  data: {
    notificationEnabled: true
  },

  onLoad() {
    // 读取通知设置
    const notificationEnabled = wx.getStorageSync('notificationEnabled');
    if (notificationEnabled !== '') {
      this.setData({ notificationEnabled });
    }
  },

  // 编辑资料
  onTapEditProfile() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  // 切换通知
  onToggleNotification(e) {
    const enabled = e.detail.value;
    this.setData({ notificationEnabled: enabled });
    wx.setStorageSync('notificationEnabled', enabled);
    wx.showToast({
      title: enabled ? '已开启通知' : '已关闭通知',
      icon: 'none'
    });
  },

  // 隐私政策
  onTapPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy?type=privacy-policy' });
  },

  // 用户协议
  onTapAgreement() {
    wx.navigateTo({ url: '/pages/privacy/privacy?type=user-agreement' });
  },

  // 关于我们
  onTapAbout() {
    wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.logout();
          wx.showToast({ title: '已退出登录', icon: 'success' });
          setTimeout(() => {
            wx.switchTab({ url: '/pages/index/index' });
          }, 1500);
        }
      }
    });
  }
});
