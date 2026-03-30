const app = getApp();

Page({
  data: {
    // 状态
    isLoggedIn: false,
    isRegistered: false,
    userInfo: null,
    showPrivacyModal: false,
    greeting: '你好',

    // 学校列表
    schools: [],
    schoolPickerList: [],  // picker显示列表
    schoolPickerIndex: 0,  // picker当前选中索引
    currentSchoolId: null,
    currentSchoolName: '',

    // 轮播公告
    announcements: [],
    currentSwiperIndex: 0,

    // 快捷入口
    quickActions: [
      { icon: '🏆', label: '赛事', bgColor: 'bg-yellow', url: '/pages/events/events' },
      { icon: '🏓', label: '约球', bgColor: 'bg-pink', url: '/pages/square/square' },
      { icon: '📍', label: '签到', bgColor: 'bg-green', url: '/pages/check-in/check-in' },
      { icon: '📚', label: '学习', bgColor: 'bg-blue', url: '/pages/learning/learning' }
    ],

    // 排行榜数据（从 API 获取）
    rankingList: []
  },

  onLoad() {
    this.updateLoginStatus();
    this.updateGreeting();
    this.loadSchools();
    this.loadAnnouncements();
    this.loadRankings();
  },

  onShow() {
    this.updateLoginStatus();
    this.loadAnnouncements();
    this.loadRankings();
    // 更新自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const tabBar = this.getTabBar();
      tabBar.setData({ selected: 0 });
      if (typeof tabBar.syncInvitationBadge === 'function') {
        tabBar.syncInvitationBadge();
      }
    }
  },

  // 更新登录状态
  updateLoginStatus() {
    const cachedOpenid = wx.getStorageSync('openid');
    const cachedUserInfo = wx.getStorageSync('userInfo');

    let { isLoggedIn, isRegistered, userInfo } = app.globalData;
    if (!userInfo && cachedUserInfo) {
      userInfo = cachedUserInfo;
      app.globalData.userInfo = cachedUserInfo;
    }
    if (!isLoggedIn && cachedOpenid) {
      isLoggedIn = true;
      app.globalData.isLoggedIn = true;
      app.globalData.openid = app.globalData.openid || cachedOpenid;
    }
    if (!isRegistered && userInfo) {
      isRegistered = true;
      app.globalData.isRegistered = true;
    }

    this.setData({
      isLoggedIn,
      isRegistered,
      userInfo,
      currentSchoolId: userInfo?.school_id || null,
      currentSchoolName: userInfo?.school_name || ''
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
      this.loadSchools();
      this.loadAnnouncements();
      this.loadRankings();
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        const tabBar = this.getTabBar();
        if (typeof tabBar.syncInvitationBadge === 'function') {
          tabBar.syncInvitationBadge();
        }
      }

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

  // 学校选择器变化
  onSchoolPickerChange(e) {
    const index = parseInt(e.detail.value);
    const { schools, currentSchoolId } = this.data;

    const selected = schools[index];
    if (selected && selected.id !== currentSchoolId) {
      this.setData({ schoolPickerIndex: index });
      this.switchSchool(selected);
    }
  },

  // 切换学校
  switchSchool(school) {
    this.setData({
      currentSchoolId: school.id,
      currentSchoolName: school.short_name || school.name
    });

    // 刷新公告和排行榜
    this.loadAnnouncements();
    this.loadRankings();

    wx.showToast({
      title: `已切换到${school.short_name || school.name}`,
      icon: 'success'
    });
  },

  // 加载学校列表
  async loadSchools() {
    try {
      const res = await app.request('/api/common/schools');

      if (res.success && res.data) {
        const schools = res.data;
        // 构建picker列表
        const schoolPickerList = schools.map(s => s.short_name || s.name);

        // 查找用户学校在列表中的索引
        let schoolPickerIndex = 0;
        const userSchoolId = app.globalData.userInfo?.school_id;
        if (userSchoolId) {
          const idx = schools.findIndex(s => s.id === userSchoolId);
          if (idx !== -1) {
            schoolPickerIndex = idx;
          }
        }

        this.setData({
          schools,
          schoolPickerList,
          schoolPickerIndex
        });
      }
    } catch (error) {
      console.error('加载学校列表失败:', error);
    }
  },

  // 点击公告
  onTapAnnouncement(e) {
    const { item } = e.currentTarget.dataset;
    if (!item) return;

    if (item.link_type === 'event' && item.link_event_id) {
      wx.navigateTo({ url: `/pages/event-detail/event-detail?id=${item.link_event_id}` });
    } else if (item.link_type === 'url' && item.link_url) {
      // 小程序内 webview 或复制链接
      wx.setClipboardData({
        data: item.link_url,
        success: () => wx.showToast({ title: '链接已复制', icon: 'success' })
      });
    }
  },

  // 轮播图切换
  onSwiperChange(e) {
    this.setData({ currentSwiperIndex: e.detail.current });
  },

  // 加载公告
  async loadAnnouncements() {
    try {
      const res = await app.request('/api/announcements', {
        school_id: app.globalData.userInfo?.school_id,
        limit: 5
      });

      if (res.success) {
        this.setData({ announcements: res.data });
      }
    } catch (error) {
      console.error('加载公告失败:', error);
    }
  },

  // 加载排行榜
  async loadRankings() {
    try {
      const params = { limit: 5 };
      const schoolId = this.data.currentSchoolId || (this.data.isLoggedIn ? this.data.userInfo?.school_id : null);
      if (schoolId) {
        params.school_id = schoolId;
      }

      const res = await app.request('/api/rankings', params);

      if (res.success && res.data && res.data.list) {
        // 格式化排行榜数据
        const rankingList = res.data.list.map(user => ({
          user_id: user.id,
          name: user.name,
          avatar_url: user.avatar_url,
          score: user.points || 0,
          college_name: user.college_name || user.school_short_name || user.school_name || '',
          user_type_label: user.wins > 0 ? `${user.wins}胜${user.losses}负` : '暂无战绩'
        }));
        this.setData({ rankingList });
      }
    } catch (error) {
      console.error('加载排行榜失败:', error);
    }
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
    wx.navigateTo({ url: '/pages/rankings/rankings' });
  },

  // 点击排行榜用户
  onTapRankingUser(e) {
    const { id } = e.currentTarget.dataset;
    console.log('点击排行榜用户, id:', id, 'dataset:', e.currentTarget.dataset);
    if (!id) {
      wx.showToast({ title: '用户ID无效', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/user-profile/user-profile?id=${id}` });
  }
});
