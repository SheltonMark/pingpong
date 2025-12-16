const app = getApp();

Page({
  data: {
    currentTab: 'video',
    tabs: [
      { key: 'video', label: '视频' },
      { key: 'ppt', label: 'PPT' },
      { key: 'document', label: '文档' }
    ],
    materials: [],
    isLoading: false,
    page: 1,
    noMore: false
  },

  onLoad() {
    this.loadMaterials();
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({
      currentTab: tab,
      materials: [],
      page: 1,
      noMore: false
    });

    this.loadMaterials();
  },

  async loadMaterials(loadMore = false) {
    if (this.data.isLoading) return;

    const page = loadMore ? this.data.page : 1;
    this.setData({ isLoading: true });

    try {
      const res = await this.request('/api/learning', {
        type: this.data.currentTab,
        school_id: app.globalData.userInfo?.school_id,
        page,
        limit: 20
      });

      if (res.success) {
        const materials = res.data.list.map(m => ({
          ...m,
          view_label: this.formatViewCount(m.view_count)
        }));

        this.setData({
          materials: loadMore ? [...this.data.materials, ...materials] : materials,
          page: page + 1,
          noMore: materials.length < 20
        });
      }
    } catch (error) {
      console.error('获取学习资料失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onLoadMore() {
    if (!this.data.noMore) {
      this.loadMaterials(true);
    }
  },

  onTapMaterial(e) {
    const { id, type, url } = e.currentTarget.dataset;

    if (type === 'video') {
      wx.navigateTo({
        url: `/pages/video-player/video-player?id=${id}&url=${encodeURIComponent(url)}`
      });
    } else {
      wx.downloadFile({
        url: url,
        success: (res) => {
          wx.openDocument({
            filePath: res.tempFilePath,
            showMenu: true
          });
        }
      });
    }
  },

  formatViewCount(count) {
    if (count >= 10000) {
      return (count / 10000).toFixed(1) + 'w';
    } else if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count + '';
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
