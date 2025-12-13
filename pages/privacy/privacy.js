Page({
  data: {
    type: 'privacy-policy', // 'privacy-policy' | 'user-agreement'
    title: '隐私政策',
    updateDate: '2024年12月1日'
  },

  onLoad(options) {
    const type = options.type || 'privacy-policy';
    const title = type === 'user-agreement' ? '用户协议' : '隐私政策';

    this.setData({ type, title });
    wx.setNavigationBarTitle({ title });
  }
});
