Page({
  data: {
    menuItems: [
      { id: 'announcements', icon: '📢', label: '公告管理', desc: '管理首页公告', url: '/pages/admin-announcements/admin-announcements' },
      { id: 'learning', icon: '📚', label: '学习资料', desc: '管理学习资料', url: '/pages/admin-learning/admin-learning' },
      { id: 'checkin', icon: '📍', label: '签到点管理', desc: '管理签到位置', url: '/pages/admin-checkin/admin-checkin' },
      { id: 'carousel', icon: '🖼️', label: '轮播图管理', desc: '管理首页轮播', url: '/pages/admin-carousel/admin-carousel' }
    ]
  },

  onTapMenu(e) {
    const { url } = e.currentTarget.dataset;
    wx.navigateTo({ url });
  }
});
