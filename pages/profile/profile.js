const app = getApp();

// 用户类型标签映射
const USER_TYPE_LABELS = {
  student: '在校生',
  graduate: '毕业生',
  teacher: '老师',
  staff: '教职工'
};

Page({
  data: {
    isLoggedIn: false,
    isRegistered: false,
    userInfo: null,
    userTypeLabel: '',
    isRefreshing: false,

    // 用户统计数据（从 API 获取）
    stats: {
      score: 0,
      rank: '-',
      winRate: 0
    },

    // 菜单列表（匹配设计稿）
    menuItems: [
      { icon: '📊', label: '交手记录', url: '/pages/match-history/match-history' },
      { icon: '📝', label: '我的发布', url: '/pages/my-posts/my-posts' },
      { icon: '🏆', label: '我的赛事', url: '/pages/my-events/my-events' },
      { icon: '✉️', label: '邀请管理', url: '/pages/invitations/invitations', badge: 0 },
      { icon: '⚙️', label: '设置', url: '/pages/settings/settings' }
    ]
  },

  onLoad() {
    this.updateUserInfo();
  },

  onShow() {
    this.updateUserInfo();
    this.loadPendingInvitationCount();
    this.loadUserProfile();  // 从服务器刷新用户数据
    // 更新自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    this.setData({ isRefreshing: true });
    try {
      await Promise.all([
        this.loadUserProfile(),
        this.loadPendingInvitationCount()
      ]);
    } catch (error) {
      console.error('刷新失败:', error);
    } finally {
      this.setData({ isRefreshing: false });
    }
  },

  // 加载待处理邀请数量
  async loadPendingInvitationCount() {
    const { isLoggedIn, isRegistered, userInfo } = app.globalData;
    if (!isLoggedIn || !isRegistered || !userInfo) {
      return;
    }

    try {
      const res = await app.request(`/api/user/${userInfo.id}/invitations`, { status: 'pending' });

      if (res.success && res.data) {
        const count = res.data.length;
        // 更新菜单项的 badge
        const menuItems = this.data.menuItems.map(item => {
          if (item.label === '邀请管理') {
            return { ...item, badge: count };
          }
          return item;
        });
        this.setData({ menuItems });
      }
    } catch (error) {
      console.error('加载邀请数量失败:', error);
    }
  },

  // 更新用户信息
  updateUserInfo() {
    const { isLoggedIn, isRegistered, userInfo } = app.globalData;

    let userTypeLabel = '';
    if (userInfo && userInfo.user_type) {
      userTypeLabel = USER_TYPE_LABELS[userInfo.user_type] || userInfo.user_type;
    }

    this.setData({
      isLoggedIn,
      isRegistered,
      userInfo,
      userTypeLabel
    });
  },

  // 去登录
  goToLogin() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 从服务器加载最新用户数据
  async loadUserProfile() {
    const { isLoggedIn, isRegistered, userInfo } = app.globalData;
    if (!isLoggedIn || !isRegistered || !userInfo) {
      return;
    }

    // 确保有有效的用户ID
    const userId = userInfo.id || userInfo.user_id;
    if (!userId) {
      console.error('无法获取用户ID');
      return;
    }

    try {
      // 直接调用排行榜接口获取积分和排名（与积分榜使用相同逻辑）
      const res = await app.request('/api/rankings', { limit: 1000 });

      if (res.success && res.data && res.data.list) {
        // 在排行榜中找到当前用户
        const myRanking = res.data.list.find(r => r.id === userId);

        if (myRanking) {
          // 更新全局用户数据
          app.globalData.userInfo = {
            ...app.globalData.userInfo,
            points: myRanking.points,
            wins: myRanking.wins,
            losses: myRanking.losses
          };

          // 同步更新本地存储
          wx.setStorageSync('userInfo', app.globalData.userInfo);

          // 更新页面数据
          this.setData({
            userInfo: app.globalData.userInfo,
            stats: {
              score: myRanking.points || 0,
              rank: myRanking.rank || '-',
              winRate: myRanking.win_rate || 0
            }
          });
        } else {
          // 用户不在排行榜中，显示默认值
          this.setData({
            stats: {
              score: userInfo.points || 0,
              rank: '-',
              winRate: 0
            }
          });
        }
      }
    } catch (error) {
      console.error('加载用户数据失败:', error);
    }
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
  }
});
