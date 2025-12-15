// pages/score-confirm/score-confirm.js
const app = getApp();

Page({
  data: {
    matchId: null,
    match: null,
    scores: [],
    totalScore: { player1: 0, player2: 0 },
    loading: true,
    confirming: false,
    useMock: true
  },

  onLoad(options) {
    this.setData({ matchId: options.match_id });
    this.loadMatchDetail();
  },

  // 加载比赛详情和比分
  async loadMatchDetail() {
    if (this.data.useMock) {
      setTimeout(() => {
        this.setData({
          match: this.getMockMatch(),
          scores: this.getMockScores(),
          totalScore: { player1: 3, player2: 1 },
          loading: false
        });
      }, 300);
      return;
    }

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

    if (this.data.useMock) {
      setTimeout(() => {
        wx.showToast({ title: '确认成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      }, 500);
      return;
    }

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
  },

  // Mock 数据
  getMockMatch() {
    return {
      id: 1,
      event_id: 1,
      round: 1,
      match_order: 1,
      player1_id: 101,
      player2_id: 102,
      player1_name: '张明远',
      player2_name: '李思源',
      player1_avatar: '',
      player2_avatar: '',
      status: 'pending_confirm'
    };
  },

  getMockScores() {
    return [
      { game_number: 1, player1_score: 11, player2_score: 9 },
      { game_number: 2, player1_score: 9, player2_score: 11 },
      { game_number: 3, player1_score: 11, player2_score: 7 },
      { game_number: 4, player1_score: 11, player2_score: 8 }
    ];
  }
});
