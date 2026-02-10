const app = getApp();

Page({
  data: {
    currentTab: 'all',
    tabs: [
      { key: 'school', label: '本校' },
      { key: 'all', label: '全部' }
    ],
    rankings: [],
    isLoading: true,
    page: 1,
    noMore: false
  },

  onLoad() {
    this.loadRankings();
  },

  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({
      currentTab: tab,
      rankings: [],
      page: 1,
      noMore: false
    });

    this.loadRankings();
  },

  async loadRankings(loadMore = false) {
    const page = loadMore ? this.data.page : 1;
    this.setData({ isLoading: true });

    try {
      const params = { page, limit: 50 };
      if (this.data.currentTab === 'school' && app.globalData.userInfo?.school_id) {
        params.school_id = app.globalData.userInfo.school_id;
      }

      const res = await this.request('/api/rankings', params);

      if (res.success) {
        const rankings = res.data.list.map(r => ({
          ...r,
          badge_class: this.getBadgeClass(r.rank)
        }));

        this.setData({
          rankings: loadMore ? [...this.data.rankings, ...rankings] : rankings,
          page: page + 1,
          noMore: rankings.length < 50
        });
      }
    } catch (error) {
      console.error('获取排行榜失败:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onLoadMore() {
    if (!this.data.noMore) {
      this.loadRankings(true);
    }
  },

  onTapUser(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/user-profile/user-profile?id=${id}`
    });
  },

  getBadgeClass(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return 'normal';
  },

  request(url, data) {
    return app.request(url, data);
  }
});
