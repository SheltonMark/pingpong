// pages/score-entry/score-entry.js
const app = getApp();
const subscribe = require('../../utils/subscribe');

Page({
  data: {
    matchId: null,
    match: null,
    bestOf: 5, // 默认5局3胜
    scores: [],
    totalScore: { player1: 0, player2: 0 },
    loading: true,
    submitting: false
  },

  onLoad(options) {
    this._scores = []; // 本地缓存比分，避免setData导致输入闪烁
    this.setData({ matchId: options.match_id });
    this.loadMatchDetail();
  },

  // 加载比赛详情
  async loadMatchDetail() {
    try {
      const res = await app.request(`/api/events/matches/${this.data.matchId}`);

      if (res.success) {
        this._scores = this.initScores(res.data.best_of || 5);
        this.setData({
          match: res.data,
          bestOf: res.data.best_of || 5,
          scores: this._scores,
          loading: false
        });
      }
    } catch (error) {
      console.error('加载失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
      this.setData({ loading: false });
    }
  },

  // 初始化比分数组
  initScores(bestOf) {
    const scores = [];
    for (let i = 0; i < bestOf; i++) {
      scores.push({
        game_number: i + 1,
        player1_score: '',
        player2_score: ''
      });
    }
    return scores;
  },

  // 输入比分
  onScoreInput(e) {
    const { game, player } = e.currentTarget.dataset;
    const value = e.detail.value;

    if (player == 1) {
      this._scores[game - 1].player1_score = value;
    } else {
      this._scores[game - 1].player2_score = value;
    }

    // 只更新总比分，不回写scores，避免input重新渲染闪烁
    const totalScore = this.calculateTotalScore(this._scores);
    this.setData({ totalScore });
  },

  // 计算总比分
  calculateTotalScore(scores) {
    let player1 = 0, player2 = 0;

    scores.forEach(s => {
      const p1 = parseInt(s.player1_score) || 0;
      const p2 = parseInt(s.player2_score) || 0;

      if (p1 > 0 || p2 > 0) {
        if (p1 > p2) player1++;
        else if (p2 > p1) player2++;
      }
    });

    return { player1, player2 };
  },

  // 提交比分
  async onSubmit() {
    const scores = this._scores;
    const { totalScore, bestOf } = this.data;
    const winGames = Math.ceil(bestOf / 2);

    // 验证比分
    const validScores = scores.filter(s =>
      s.player1_score !== '' && s.player2_score !== ''
    );

    if (validScores.length === 0) {
      wx.showToast({ title: '请输入比分', icon: 'none' });
      return;
    }

    // 检查是否有胜者
    if (totalScore.player1 < winGames && totalScore.player2 < winGames) {
      wx.showModal({
        title: '提示',
        content: `比赛尚未结束，需要${winGames}局才能决出胜负`,
        showCancel: false
      });
      return;
    }

    this.setData({ submitting: true });

    // 请求比分确认订阅消息授权（通知对手确认比分）
    try {
      await subscribe.requestScoreConfirmSubscription();
    } catch (err) {
      console.log('订阅请求失败或用户拒绝:', err);
      // 订阅失败不影响提交操作
    }

    try {
      const res = await app.request(`/api/events/matches/${this.data.matchId}/score`, {
            scores: validScores,
            recorded_by: app.globalData.userInfo?.user_id
          }, 'POST');

      if (res.success) {
        wx.showToast({ title: '提交成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    } catch (error) {
      console.error('提交失败:', error);
      wx.showToast({ title: '提交失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
