App({
  onLaunch() {
    console.log('小程序启动');

    // 初始化云托管
    wx.cloud.init({
      env: 'prod-1gc88z9k40350ea7',
      traceUser: true
    });

    // 检查登录状态
    this.checkLoginStatus();
  },

  globalData: {
    baseUrl: 'https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com',
    openid: null,
    userInfo: null,
    isLoggedIn: false,
    isRegistered: false,
    hasAgreedPrivacy: false,

    // ============================================================
    // 【审核模式】
    // 设置为 true 隐藏广场和发帖功能（用于应用商店审核）
    // 审核通过后改回 false 即可恢复
    // ============================================================
    reviewMode: false,

    // ============================================================
    // 【开发模式配置】
    // 设置为 false 启用真实后端登录
    // ============================================================
    useMockLogin: false,

    // ============================================================
    // 【云托管配置】
    // useCloudContainer: true 使用云托管调用（生产环境）
    // useCloudContainer: false 回退到 wx.request（本地开发）
    // ============================================================
    useCloudContainer: true,
    cloudConfig: {
      env: 'prod-1gc88z9k40350ea7',
      serviceName: 'express-lksv'
    }
  },

  // 统一请求方法
  request(path, data, method) {
    method = method || 'GET';
    if (this.globalData.useCloudContainer) {
      // GET 请求：参数拼到 URL query string，避免 callContainer 把 data 放 body
      let requestPath = path;
      let requestData = data;
      if (method === 'GET' && data && Object.keys(data).length > 0) {
        const qs = Object.keys(data)
          .filter(k => data[k] !== undefined && data[k] !== null)
          .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(data[k])}`)
          .join('&');
        requestPath = path + (path.includes('?') ? '&' : '?') + qs;
        requestData = {};
      }
      return new Promise((resolve, reject) => {
        wx.cloud.callContainer({
          config: {
            env: this.globalData.cloudConfig.env
          },
          path: requestPath,
          method: method,
          header: {
            'X-WX-SERVICE': this.globalData.cloudConfig.serviceName,
            'content-type': 'application/json'
          },
          data: requestData,
          success: (res) => {
            if (res.data) {
              resolve(res.data);
            } else {
              reject(new Error('服务器响应异常'));
            }
          },
          fail: (err) => {
            console.error('云托管请求失败:', path, err);
            reject(err);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        wx.request({
          url: this.globalData.baseUrl + path,
          method: method,
          data: data,
          success: (res) => {
            if (res.data) {
              resolve(res.data);
            } else {
              reject(new Error('服务器响应异常'));
            }
          },
          fail: reject
        });
      });
    }
  },

  // 检查登录状态
  async checkLoginStatus() {
    try {
      // 尝试从本地存储恢复登录状态
      const openid = wx.getStorageSync('openid');
      const userInfo = wx.getStorageSync('userInfo');
      const hasAgreedPrivacy = wx.getStorageSync('hasAgreedPrivacy');

      // 清理开发模式产生的无效缓存
      if (openid && openid.startsWith('dev_')) {
        console.log('清理开发模式缓存');
        wx.removeStorageSync('openid');
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('hasAgreedPrivacy');
        return;
      }

      if (openid) {
        this.globalData.openid = openid;
        this.globalData.isLoggedIn = true;
        this.globalData.hasAgreedPrivacy = hasAgreedPrivacy || false;

        if (userInfo) {
          this.globalData.userInfo = userInfo;
          this.globalData.isRegistered = true;
        }
      }
    } catch (error) {
      console.error('检查登录状态失败:', error);
    }
  },

  // 微信登录
  async wxLogin() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (res.code) {
            try {
              // 调用后端接口换取 openid
              const result = await this.request('/api/auth/wx-login', { code: res.code }, 'POST');
              if (result.success) {
                this.globalData.openid = result.data.openid;
                this.globalData.isLoggedIn = true;
                wx.setStorageSync('openid', result.data.openid);

                // 检查用户是否已注册
                if (result.data.user) {
                  this.globalData.userInfo = result.data.user;
                  this.globalData.isRegistered = true;
                  wx.setStorageSync('userInfo', result.data.user);
                }

                resolve(result);
              } else {
                reject(new Error(result.message || '登录失败'));
              }
            } catch (error) {
              reject(error);
            }
          } else {
            reject(new Error('获取登录凭证失败'));
          }
        },
        fail: reject
      });
    });
  },

  // 同意隐私政策
  async agreePrivacy() {
    this.globalData.hasAgreedPrivacy = true;
    wx.setStorageSync('hasAgreedPrivacy', true);

    if (this.globalData.openid) {
      try {
        await this.request('/api/user/agree-privacy', { openid: this.globalData.openid }, 'POST');
      } catch (error) {
        console.error('记录隐私政策同意状态失败:', error);
      }
    }
  },

  // 退出登录
  logout() {
    this.globalData.openid = null;
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    this.globalData.isRegistered = false;
    this.globalData.hasAgreedPrivacy = false;

    wx.removeStorageSync('openid');
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('hasAgreedPrivacy');
  }
});
