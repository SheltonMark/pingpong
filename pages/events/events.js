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
    page: 1,

    // Mock 数据
    useMock: false
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

    // Mock 模式
    if (this.data.useMock) {
      setTimeout(() => {
        const mockEvents = this.getMockEvents();
        const filtered = this.data.currentTab === 'all'
          ? mockEvents
          : mockEvents.filter(e => e.status === this.data.currentTab);

        this.setData({
          events: loadMore ? [...this.data.events, ...filtered] : filtered,
          loading: false,
          hasMore: false
        });
      }, 500);
      return;
    }

    // 真实 API 调用
    try {
      const { currentTab, page } = this.data;
      const params = { page, limit: 20 };
      if (currentTab !== 'all') params.status = currentTab;
      if (app.globalData.userInfo?.school_id) {
        params.school_id = app.globalData.userInfo.school_id;
      }

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/events`,
          data: params,
          success: (res) => resolve(res.data),
          fail: reject
        });
      });

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

  // Mock 数据
  getMockEvents() {
    return [
      {
        id: 1,
        title: '新生杯乒乓球赛',
        event_type: 'singles',
        event_format: 'knockout',
        status: 'registration',
        event_start: '2024-12-20 09:00',
        location: '体育馆一楼',
        participant_count: 24,
        max_participants: 32
      },
      {
        id: 2,
        title: '学院友谊赛',
        event_type: 'doubles',
        event_format: 'round_robin',
        status: 'ongoing',
        event_start: '2024-12-25 14:00',
        location: '体育馆二楼',
        participant_count: 16,
        max_participants: 16
      },
      {
        id: 3,
        title: '校际邀请赛',
        event_type: 'team',
        event_format: 'knockout',
        status: 'finished',
        event_start: '2024-12-10 09:00',
        location: '主体育馆',
        participant_count: 8,
        max_participants: 8
      }
    ];
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
