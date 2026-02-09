Component({
  properties: {
    show: { type: Boolean, value: false }
  },
  methods: {
    onAgree() {
      this.triggerEvent('agree');
    },
    onDisagree() {
      this.triggerEvent('disagree');
    },
    onTapPrivacy() {
      wx.navigateTo({ url: '/pages/privacy/privacy?type=privacy-policy' });
    },
    onTapAgreement() {
      wx.navigateTo({ url: '/pages/privacy/privacy?type=user-agreement' });
    }
  }
});
