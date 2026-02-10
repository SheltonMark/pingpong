const app = getApp();

Page({
  data: {
    currentTab: 'ongoing',
    tabs: [
      { key: 'ongoing', label: '进行中' },
      { key: 'finished', label: '已结束' }
    ],
    events: [],
    isLoading: true
  },

  onLoad() {
    this.loadEvents();
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({
      currentTab: tab,
      events: []
    });

    this.loadEvents();
  },

  async loadEvents() {
    if (!app.globalData.userInfo?.id) {
      this.setData({ isLoading: false });
      return;
    }

    this.setData({ isLoading: true });

    try {
      const res = await this.request(`/api/user/${app.globalData.userInfo.id}/events`, {
        status: this.data.currentTab
      });

      if (res.success) {
        const events = res.data.map(e => ({
          ...e,
          date_label: this.formatDate(e.start_date),
          type_label: this.getTypeLabel(e.type)
        }));

        this.setData({ events });
      }
    } catch (error) {
      console.error('获取我的赛事失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onTapEvent(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/event-detail/event-detail?id=${id}`
    });
  },

  getTypeLabel(type) {
    const types = {
      singles: '单打',
      doubles: '双打',
      team: '团体赛'
    };
    return types[type] || type;
  },

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  request(url, data) {
    return app.request(url, data);
  }
});
