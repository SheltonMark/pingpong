Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/index/index',
        text: '首页',
        iconPath: '/images/tabbar/home.png',
        selectedIconPath: '/images/tabbar/home-active.png'
      },
      {
        pagePath: '/pages/square/square',
        text: '广场',
        iconPath: '/images/tabbar/square.png',
        selectedIconPath: '/images/tabbar/square-active.png'
      },
      {
        pagePath: '/pages/events/events',
        text: '赛事',
        iconPath: '/images/tabbar/trophy.png',
        selectedIconPath: '/images/tabbar/trophy-active.png'
      },
      {
        pagePath: '/pages/profile/profile',
        text: '我的',
        iconPath: '/images/tabbar/profile.png',
        selectedIconPath: '/images/tabbar/profile-active.png'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
    }
  }
});
