// pages/score-confirm/score-confirm.js
const app = getApp();

Page({
  data: {
    matchId: null,
    match: null,
    scores: [],
    totalScore: { player1: 0, player2: 0 },
    loading: true,
    confirming: false
  },

  onLoad(options) {
    this.setData({ matchId: options.match_id });
    this.loadMatchDetail();
  },

  // 加载比赛详情和比分
  async loadMatchDetail() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/events/matches/${this.data.matchId}`,
          success: (res) => resolve(res.data),
          fail: reject
        });
      });

      if (res.success) {
        const totalScore = this.calculateTotalScore(res.data.scores || []);
        this.setData({
          match: res.data,
          scores: res.data.scores || [],
          totalScore,
          loading: false
        });
      }
    } catch (error) {
      console.error('加载失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 计算总比分
  calculateTotalScore(scores) {
    let player1 = 0, player2 = 0;

    scores.forEach(s => {
      if (s.player1_score > s.player2_score) player1++;
      else if (s.player2_score > s.player1_score) player2++;
    });

    return { player1, player2 };
  },

  // 确认比分
  async onConfirm() {
    this.setData({ confirming: true });

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/events/matches/${this.data.matchId}/confirm`,
          method: 'POST',
          data: {
            user_id: app.globalData.userInfo?.user_id
          },
          success: (res) => resolve(res.data),
          fail: reject
        });
      });

      if (res.success) {
        wx.showToast({ title: '确认成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.message || '确认失败', icon: 'none' });
      }
    } catch (error) {
      console.error('确认失败:', error);
      wx.showToast({ title: '确认失败', icon: 'none' });
    } finally {
      this.setData({ confirming: false });
    }
  },

  // 有异议
  onDispute() {
    wx.showModal({
      title: '比分异议',
      content: '您对比分有异议？请联系管理员处理。',
      confirmText: '我知道了',
      showCancel: false
    });
  }
});
