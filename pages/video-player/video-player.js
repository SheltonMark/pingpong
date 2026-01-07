const app = getApp();

Page({
  data: {
    videoUrl: '',
    videoInfo: null
  },

  onLoad(options) {
    const { id, url } = options;

    // 构建完整的视频URL
    let videoUrl = decodeURIComponent(url || '');
    if (videoUrl && !videoUrl.startsWith('http')) {
      videoUrl = app.globalData.baseUrl + videoUrl;
    }

    this.setData({ videoUrl });

    // 获取视频详情并增加观看次数
    if (id) {
      this.loadVideoInfo(id);
    }
  },

  async loadVideoInfo(id) {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/learning/${id}`,
          success: (res) => resolve(res.data),
          fail: reject
        });
      });

      if (res.success) {
        this.setData({ videoInfo: res.data });
        wx.setNavigationBarTitle({ title: res.data.title || '视频播放' });
      }
    } catch (error) {
      console.error('获取视频信息失败:', error);
    }
  },

  onVideoError(e) {
    console.error('视频播放错误:', e.detail);
    wx.showToast({
      title: '视频加载失败',
      icon: 'none'
    });
  },

  onVideoEnded() {
    console.log('视频播放结束');
  },

  onShareAppMessage() {
    const { videoInfo, videoUrl } = this.data;
    return {
      title: videoInfo?.title || '视频分享',
      path: `/pages/video-player/video-player?url=${encodeURIComponent(videoUrl)}`
    };
  }
});
