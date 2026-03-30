Component({
  data: {
    selected: 0,
    color: "#9CA3AF",
    selectedColor: "#FF6B00",
    list: [
      {
        pagePath: "/pages/index/index",
        text: "首页",
        iconPath: "/images/tabbar/home.png",
        selectedIconPath: "/images/tabbar/home-active.png"
      },
      {
        pagePath: "/pages/square/square",
        text: "广场",
        iconPath: "/images/tabbar/square.png",
        selectedIconPath: "/images/tabbar/square-active.png"
      },
      {
        pagePath: "/pages/events/events",
        text: "赛事",
        iconPath: "/images/tabbar/trophy.png",
        selectedIconPath: "/images/tabbar/trophy-active.png"
      },
      {
        pagePath: "/pages/profile/profile",
        text: "我的",
        iconPath: "/images/tabbar/profile.png",
        selectedIconPath: "/images/tabbar/profile-active.png",
        badge: 0,
        badgeText: ""
      }
    ]
  },

  methods: {
    setInvitationBadge(count = 0) {
      const badgeCount = Math.max(0, Number(count) || 0);
      const badgeText = badgeCount > 99 ? '99+' : (badgeCount ? String(badgeCount) : '');
      const list = this.data.list.map((item) => {
        if (item.pagePath === '/pages/profile/profile') {
          return {
            ...item,
            badge: badgeCount,
            badgeText
          };
        }
        return item;
      });

      this.setData({ list });
    },

    async syncInvitationBadge() {
      const app = getApp();
      const count = await app.getPendingInvitationCount();
      this.setInvitationBadge(count);
    },

    switchTab(e) {
      const data = e.currentTarget.dataset;
      const url = data.path;
      wx.switchTab({ url });
    }
  }
});
