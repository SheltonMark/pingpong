// pages/events/events.js
const app = getApp();

Page({
  data: {
    // 筛选
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'registration', label: '报名中' },
      { key: 'ongoing', label: '进行中' },
      { key: 'finished', label: '已结束' }
    ],
    currentTab: 'all',

    // 数据
    events: [],
    loading: false,
    hasMore: true,
    page: 1
  },

  onLoad() {
    this.loadEvents();
  },

  onShow() {
    // 更新自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true });
    this.loadEvents().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadEvents(true);
    }
  },

  // 切换标签
  onTabChange(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ currentTab: key, page: 1, events: [], hasMore: true });
    this.loadEvents();
  },

  // 加载赛事列表
  async loadEvents(loadMore = false) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    // 真实 API 调用
    try {
      const { currentTab, page } = this.data;
      const params = { page, limit: 20 };
      if (currentTab !== 'all') params.status = currentTab;
      if (app.globalData.userInfo?.school_id) {
        params.school_id = app.globalData.userInfo.school_id;
      }

      const res = await app.request('/api/events', params);

      if (res.success) {
        this.setData({
          events: loadMore 
            ? [...this.data.events, ...res.data.list.map(e => ({...e, event_start: this.formatTime(e.event_start)}))]
            : res.data.list.map(e => ({...e, event_start: this.formatTime(e.event_start)})),
          page: page + 1,
          hasMore: res.data.list.length === 20
        });
      }
    } catch (error) {
      console.error('加载赛事失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },


  // 格式化时间
  formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  // 点击赛事
  onTapEvent(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?id=${id}` });
  }
});
