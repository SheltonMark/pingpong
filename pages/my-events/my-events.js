const app = getApp();

Page({
  data: {
    currentTab: 'all',
    tabs: [
      { key: 'all', label: '全部' },
      { key: 'registration', label: '报名中' },
      { key: 'pending_start', label: '待开始' },
      { key: 'ongoing', label: '进行中' },
      { key: 'finished', label: '已结束' }
    ],
    events: [],
    isLoading: true
  },

  onLoad() {
    this.loadEvents();
  },

  onShow() {
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
      const params = {};
      if (this.data.currentTab !== 'all') {
        params.status = this.data.currentTab;
      }

      const res = await this.request(`/api/user/${app.globalData.userInfo.id}/events`, params);

      if (res.success) {
        const events = res.data.map(e => ({
          ...e,
          date_label: this.formatDate(e.event_start),
          type_label: this.getTypeLabel(e.event_type),
          format_label: this.getFormatLabel(e.event_format),
          event_start_fmt: this.formatTime(e.event_start)
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
      team: '团体'
    };
    return types[type] || type || '';
  },

  getFormatLabel(format) {
    const formats = {
      knockout: '淘汰赛',
      round_robin: '循环赛',
      group_knockout: '小组+淘汰'
    };
    return formats[format] || format || '';
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hour}:${minute}`;
  },

  request(url, data) {
    return app.request(url, data);
  }
});
