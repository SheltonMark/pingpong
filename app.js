App({
  onLaunch() {
    console.log('小程序启动');
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
    // 【开发模式配置】
    // TODO: 上线前务必设置为 false，启用真实后端登录
    // ============================================================
    useMockLogin: true
  },

  // ============================================================
  // 【Mock 用户数据】
  // 用于开发测试，模拟一个已注册的用户
  // TODO: 上线前删除或禁用此数据
  // ============================================================
  mockUser: {
    openid: 'mock_openid_004',
    user_id: 4,
    name: '张明远',
    gender: 'male',
    phone: '13800138000',
    user_type: 'student',
    school_id: 1,
    school_name: '浙江大学',
    college_id: 1,
    college_name: '体育学院',
    class_name: '体教2101',
    enrollment_year: 2021,
    avatar_url: '',
    is_registered: true,
    privacy_agreed: true
  },

  // 检查登录状态
  async checkLoginStatus() {
    try {
      // 尝试从本地存储恢复登录状态
      const openid = wx.getStorageSync('openid');
      const userInfo = wx.getStorageSync('userInfo');
      const hasAgreedPrivacy = wx.getStorageSync('hasAgreedPrivacy');

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
    // ============================================================
    // 【Mock 模式】直接使用模拟数据，不调用后端
    // ============================================================
    if (this.globalData.useMockLogin) {
      console.log('⚠️ 使用 Mock 登录模式');

      // 模拟登录成功
      this.globalData.openid = this.mockUser.openid;
      this.globalData.isLoggedIn = true;
      this.globalData.userInfo = this.mockUser;
      this.globalData.isRegistered = true;

      // 保存到本地存储
      wx.setStorageSync('openid', this.mockUser.openid);
      wx.setStorageSync('userInfo', this.mockUser);

      return {
        success: true,
        data: {
          openid: this.mockUser.openid,
          user: this.mockUser
        }
      };
    }

    // ============================================================
    // 【正式模式】调用真实后端接口
    // ============================================================
    return new Promise((resolve, reject) => {
      wx.login({
        success: async (res) => {
          if (res.code) {
            try {
              // 调用后端接口换取 openid
              const result = await this.requestWxLogin(res.code);
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

  // 请求后端微信登录接口
  requestWxLogin(code) {
    return new Promise((resolve, reject) => {
      wx.request({
        url: `${this.globalData.baseUrl}/api/auth/wx-login`,
        method: 'POST',
        data: { code },
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
  },

  // 同意隐私政策
  async agreePrivacy() {
    this.globalData.hasAgreedPrivacy = true;
    wx.setStorageSync('hasAgreedPrivacy', true);

    // Mock 模式下不调用后端
    if (this.globalData.useMockLogin) {
      console.log('⚠️ Mock 模式：跳过隐私政策后端调用');
      return;
    }

    if (this.globalData.openid) {
      try {
        await new Promise((resolve, reject) => {
          wx.request({
            url: `${this.globalData.baseUrl}/api/user/agree-privacy`,
            method: 'POST',
            data: { openid: this.globalData.openid },
            success: resolve,
            fail: reject
          });
        });
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
