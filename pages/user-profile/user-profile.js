const app = getApp();

Page({
  data: {
    userId: null,
    user: null,
    recentMatches: [],
    isLoading: true
  },

  onLoad(options) {
    console.log('user-profile onLoad options:', options);
    if (options.id) {
      this.setData({ userId: parseInt(options.id) });
      this.loadProfile();
    } else {
      console.error('未传入用户ID');
      this.setData({ isLoading: false });
    }
  },

  async loadProfile() {
    try {
      console.log('加载用户主页, userId:', this.data.userId);
      const res = await this.request(`/api/user/${this.data.userId}/profile`);
      console.log('用户主页响应:', res);

      if (res.success) {
        const user = res.data;
        user.win_rate = (user.wins + user.losses) > 0
          ? Math.round(user.wins / (user.wins + user.losses) * 100)
          : 0;

        const recentMatches = (res.data.recent_matches || []).map(m => ({
          ...m,
          is_win: this.isWin(m, this.data.userId),
          opponent: this.getOpponent(m, this.data.userId),
          score: this.getScore(m, this.data.userId),
          date_label: this.formatDate(m.created_at)
        }));

        this.setData({ user, recentMatches });
      } else {
        console.error('加载用户主页失败:', res.message);
      }
    } catch (error) {
      console.error('获取用户主页失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  isWin(match, userId) {
    if (match.player1_id == userId) {
      return match.player1_games > match.player2_games;
    }
    return match.player2_games > match.player1_games;
  },

  getOpponent(match, userId) {
    if (match.player1_id == userId) {
      return match.player2_name;
    }
    return match.player1_name;
  },

  getScore(match, userId) {
    if (match.player1_id == userId) {
      return `${match.player1_games}:${match.player2_games}`;
    }
    return `${match.player2_games}:${match.player1_games}`;
  },

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
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
