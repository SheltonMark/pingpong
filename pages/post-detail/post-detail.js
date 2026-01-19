const app = getApp();

Page({
  data: {
    postId: null,
    post: null,
    comments: [],
    commentText: ''
  },

  onLoad(options) {
    this.setData({ postId: options.id });
    this.loadPost();
    this.loadComments();
  },

  async loadPost() {
    try {
      const res = await this.request(`/api/posts/${this.data.postId}`, {
        user_id: app.globalData.userInfo?.id
      });
      if (res.success) {
        res.data.time_label = this.formatTime(res.data.created_at);
        this.setData({ post: res.data });
      }
    } catch (error) {
      console.error('加载帖子失败:', error);
    }
  },

  async loadComments() {
    try {
      const res = await this.request(`/api/posts/${this.data.postId}/comments`);
      if (res.success) {
        const comments = res.data.list.map(c => ({
          ...c,
          time_label: this.formatTime(c.created_at)
        }));
        this.setData({ comments });
      }
    } catch (error) {
      console.error('加载评论失败:', error);
    }
  },

  async onTapLike() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    try {
      const res = await this.request(`/api/posts/${this.data.postId}/like`, {
        user_id: app.globalData.userInfo.id
      }, 'POST');

      if (res.success) {
        this.setData({
          'post.is_liked': res.data.is_liked,
          'post.like_count': res.data.like_count
        });
      }
    } catch (error) {
      console.error('点赞失败:', error);
    }
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value });
  },

  async onSendComment() {
    if (!this.data.commentText.trim()) return;

    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    try {
      const res = await this.request(`/api/posts/${this.data.postId}/comments`, {
        user_id: app.globalData.userInfo.id,
        content: this.data.commentText
      }, 'POST');

      if (res.success) {
        this.setData({ commentText: '' });
        this.loadComments();
        wx.showToast({ title: '评论成功', icon: 'success' });
      }
    } catch (error) {
      console.error('评论失败:', error);
    }
  },

  onPreviewImage(e) {
    wx.previewImage({
      urls: this.data.post.images,
      current: e.currentTarget.dataset.current
    });
  },

  // 点击用户头像，查看他人主页
  onTapUserAvatar(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/pages/user-profile/user-profile?id=${id}` });
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now - date) / 1000;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  request(url, data, method = 'GET') {
    return new Promise((resolve, reject) => {
      wx.request({
        url: app.globalData.baseUrl + url,
        method,
        data,
        success: (res) => resolve(res.data),
        fail: reject
      });
    });
  }
});
