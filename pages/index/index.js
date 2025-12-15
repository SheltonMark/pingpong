const app = getApp();

Page({
  data: {
    // 状态
    isLoggedIn: false,
    isRegistered: false,
    userInfo: null,
    showPrivacyModal: false,
    greeting: '你好',

    // 公告
    announcement: {
      title: '体育馆12月25日闭馆通知',
      desc: '因设备维护，当日暂停开放'
    },

    // 快捷入口
    quickActions: [
      { icon: '🏆', label: '赛事', bgColor: 'bg-yellow', url: '/pages/events/events' },
      { icon: '🏓', label: '约球', bgColor: 'bg-pink', url: '/pages/square/square' },
      { icon: '📍', label: '签到', bgColor: 'bg-green', url: '' },
      { icon: '📚', label: '学习', bgColor: 'bg-blue', url: '' }
    ],

    // ============================================================
    // 【Mock 排行榜数据】
    // TODO: 上线后从后端 API 获取真实数据
    // ============================================================
    rankingList: [
      {
        user_id: 101,
        name: '张明远',
        college_name: '体育学院',
        user_type_label: '在校生',
        score: 2847,
        avatar_url: ''
      },
      {
        user_id: 102,
        name: '李思源',
        college_name: '计算机学院',
        user_type_label: '在校生',
        score: 2634,
        avatar_url: ''
      },
      {
        user_id: 103,
        name: '王浩然',
        college_name: '物理学院',
        user_type_label: '老师',
        score: 2518,
        avatar_url: ''
      },
      {
        user_id: 104,
        name: '陈雨婷',
        college_name: '外国语学院',
        user_type_label: '在校生',
        score: 2456,
        avatar_url: ''
      }
    ]
  },

  onLoad() {
    this.updateLoginStatus();
    this.updateGreeting();
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

  // 更新问候语（根据时间）
  updateGreeting() {
    const hour = new Date().getHours();
    let greeting = '你好';
    if (hour >= 5 && hour < 12) {
      greeting = '早上好';
    } else if (hour >= 12 && hour < 14) {
      greeting = '中午好';
    } else if (hour >= 14 && hour < 18) {
      greeting = '下午好';
    } else if (hour >= 18 && hour < 22) {
      greeting = '晚上好';
    } else {
      greeting = '夜深了';
    }
    this.setData({ greeting });
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

  // 点击学校选择器
  onTapSchoolSelector() {
    wx.showToast({ title: '学校切换功能开发中', icon: 'none' });
  },

  // 点击公告
  onTapAnnouncement() {
    wx.showToast({ title: '公告详情页开发中', icon: 'none' });
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

  // 查看排行榜详情
  onTapRankingMore() {
    wx.showToast({ title: '排行榜页面开发中', icon: 'none' });
  },

  // 点击排行榜用户
  onTapRankingUser(e) {
    const { id } = e.currentTarget.dataset;
    wx.showToast({ title: `用户详情 ${id}`, icon: 'none' });
  }
});
