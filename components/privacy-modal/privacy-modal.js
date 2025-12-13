Component({
  properties: {
    // 是否显示
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {},

  methods: {
    // 同意
    onAgree() {
      this.triggerEvent('agree');
    },

    // 拒绝
    onDisagree() {
      this.triggerEvent('disagree');
    },

    // 查看用户协议
    viewUserAgreement() {
      wx.navigateTo({
        url: '/pages/privacy/privacy?type=user-agreement'
      });
    },

    // 查看隐私政策
    viewPrivacyPolicy() {
      wx.navigateTo({
        url: '/pages/privacy/privacy?type=privacy-policy'
      });
    },

    // 阻止冒泡
    preventBubble() {}
  }
});
