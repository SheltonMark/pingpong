const app = getApp();

Page({
  data: {
    announcement: null,
    isLoading: true
  },

  onLoad(options) {
    if (options.id) {
      this.loadAnnouncement(options.id);
    }
  },

  async loadAnnouncement(id) {
    try {
      const res = await this.request(`/api/announcements/${id}`);

      if (res.success) {
        const announcement = res.data;
        announcement.date_label = this.formatDate(announcement.created_at);
        this.setData({ announcement });
      }
    } catch (error) {
      console.error('获取公告详情失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onTapEvent() {
    if (this.data.announcement?.link_event_id) {
      wx.navigateTo({
        url: `/pages/event-detail/event-detail?id=${this.data.announcement.link_event_id}`
      });
    }
  },

  formatDate(dateStr) {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  request(url, data) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.baseUrl + url,
        data,
        success: (res) => resolve(res.data),
        fail: reject
      });
    });
  }
});
