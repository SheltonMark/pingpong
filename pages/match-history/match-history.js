const app = getApp();

Page({
  data: {
    stats: { wins: 0, losses: 0, win_rate: 0 },
    matches: [],
    isLoading: true,
    page: 1,
    noMore: false
  },

  onLoad() {
    this.loadMatchHistory();
  },

  async loadMatchHistory(loadMore = false) {
    if (!app.globalData.userInfo?.id) {
      this.setData({ isLoading: false });
      return;
    }

    const page = loadMore ? this.data.page : 1;

    try {
      const res = await this.request(`/api/user/${app.globalData.userInfo.id}/match-history`, {
        page,
        limit: 20
      });

      if (res.success) {
        const matches = res.data.matches.map(m => ({
          ...m,
          is_win: this.isWin(m, app.globalData.userInfo.id),
          opponent: this.getOpponent(m, app.globalData.userInfo.id),
          score: this.getScore(m, app.globalData.userInfo.id),
          date_label: this.formatDate(m.created_at)
        }));

        this.setData({
          stats: res.data.stats,
          matches: loadMore ? [...this.data.matches, ...matches] : matches,
          page: page + 1,
          noMore: matches.length < 20
        });
      }
    } catch (error) {
      console.error('获取交手记录失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onLoadMore() {
    if (!this.data.noMore) {
      this.loadMatchHistory(true);
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
      return { name: match.player2_name, avatar: match.player2_avatar };
    }
    return { name: match.player1_name, avatar: match.player1_avatar };
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
    return app.request(url, data);
  }
});
