const app = getApp();

Page({
  data: {
    message: 'Hello World',
    timestamp: '',
    loading: false,
    error: ''
  },

  onLoad() {
    console.log('页面加载');
    this.setData({
      timestamp: new Date().toLocaleString('zh-CN')
    });
  },

  // 获取 Hello World
  fetchHello() {
    this.setData({
      loading: true,
      error: ''
    });

    // 注意：这里需要替换为实际的云托管地址
    // 在微信公众平台后台配置服务器域名白名单
    const apiUrl = `${app.globalData.apiBase}/api/hello`;

    wx.request({
      url: apiUrl,
      method: 'GET',
      success: (res) => {
        console.log('API 响应:', res);
        if (res.data && res.data.success) {
          this.setData({
            message: res.data.data.text,
            timestamp: new Date(res.data.data.timestamp).toLocaleString('zh-CN'),
            loading: false
          });
          wx.showToast({
            title: '获取成功',
            icon: 'success'
          });
        } else {
          this.setData({
            error: '数据格式错误',
            loading: false
          });
        }
      },
      fail: (err) => {
        console.error('API 请求失败:', err);
        this.setData({
          error: `请求失败: ${err.errMsg || '未知错误'}`,
          loading: false
        });
        wx.showToast({
          title: '请求失败',
          icon: 'none'
        });
      }
    });
  }
})
