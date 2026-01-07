const app = getApp();

Page({
  data: {
    currentTab: 'video',
    tabs: [
      { key: 'video', label: '教学视频' },
      { key: 'document', label: 'PDF文档' },
      { key: 'ppt', label: 'PPT课件' }
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
        const materials = res.data.list.map(m => {
          // 处理封面URL，拼接完整路径
          let coverUrl = m.cover_url;
          if (coverUrl && !coverUrl.startsWith('http')) {
            coverUrl = app.globalData.baseUrl + coverUrl;
          }
          return {
            ...m,
            cover_url: coverUrl,
            view_label: this.formatViewCount(m.view_count)
          };
        });

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

    // 构建完整URL
    let fullUrl = url;
    if (url && !url.startsWith('http')) {
      fullUrl = app.globalData.baseUrl + url;
    }

    if (type === 'video') {
      wx.navigateTo({
        url: `/pages/video-player/video-player?id=${id}&url=${encodeURIComponent(fullUrl)}`
      });
    } else if (type === 'ppt') {
      // PPT 下载并打开
      wx.showModal({
        title: '提示',
        content: 'PPT文件将下载到手机，下载后可选择用其他应用打开',
        success: (res) => {
          if (res.confirm) {
            wx.showLoading({ title: '下载中...' });
            wx.downloadFile({
              url: fullUrl,
              success: (res) => {
                wx.hideLoading();
                if (res.statusCode === 200) {
                  // 直接用openDocument打开，用户可以通过右上角菜单保存或分享
                  wx.openDocument({
                    filePath: res.tempFilePath,
                    showMenu: true,
                    success: () => {
                      console.log('PPT打开成功');
                    },
                    fail: (err) => {
                      console.error('打开PPT失败:', err);
                      wx.showToast({ title: '打开失败，请重试', icon: 'none' });
                    }
                  });
                } else {
                  wx.showToast({ title: '下载失败', icon: 'none' });
                }
              },
              fail: (err) => {
                wx.hideLoading();
                console.error('下载PPT失败:', err);
                wx.showToast({ title: '下载失败，请检查网络', icon: 'none' });
              }
            });
          }
        }
      });
    } else {
      wx.showLoading({ title: '加载中...' });
      wx.downloadFile({
        url: fullUrl,
        success: (res) => {
          wx.hideLoading();
          if (res.statusCode === 200) {
            wx.openDocument({
              filePath: res.tempFilePath,
              showMenu: true,
              fail: (err) => {
                console.error('打开文档失败:', err);
                wx.showToast({ title: '打开失败', icon: 'none' });
              }
            });
          } else {
            wx.showToast({ title: '下载失败', icon: 'none' });
          }
        },
        fail: (err) => {
          wx.hideLoading();
          console.error('下载失败:', err);
          wx.showToast({ title: '下载失败', icon: 'none' });
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
