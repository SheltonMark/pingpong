const app = getApp();

Page({
  data: {
    posts: [],
    currentType: '',
    isLoading: false,
    isRefreshing: false,
    noMore: false,
    page: 1
  },

  onLoad() {
    this.loadPosts();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, noMore: false, posts: [] });
    this.loadPosts().then(() => wx.stopPullDownRefresh());
  },

  onSelectType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ currentType: type, page: 1, noMore: false, posts: [] });
    this.loadPosts();
  },

  onLoadMore() {
    if (!this.data.noMore && !this.data.isLoading) {
      this.loadPosts();
    }
  },

  async loadPosts() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    try {
      const params = {
        user_id: app.globalData.userInfo.id,
        page: this.data.page,
        limit: 20
      };
      if (this.data.currentType) {
        params.post_type = this.data.currentType;
      }

      const res = await this.request('/api/posts', params);

      if (res.success) {
        const newPosts = (res.data.list || []).map(post => {
          post.time_label = this.formatTime(post.created_at);
          if (post.images && typeof post.images === 'string') {
            try { post.images = JSON.parse(post.images); } catch (e) { post.images = []; }
          }
          if (post.invitation && post.invitation.scheduled_time) {
            post.invitation.time_label = this.formatTime(post.invitation.scheduled_time);
          }
          return post;
        });

        this.setData({
          posts: this.data.page === 1 ? newPosts : [...this.data.posts, ...newPosts],
          page: this.data.page + 1,
          noMore: newPosts.length < 20
        });
      }
    } catch (error) {
      console.error('加载失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ isLoading: false, isRefreshing: false });
    }
  },

  onTapPost(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` });
  },

  onTapInvitation(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/invitation-detail/invitation-detail?id=${id}` });
  },

  onPreviewImage(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ current, urls });
  },

  onDelete(e) {
    const { id, index } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条发布吗？删除后不可恢复。',
      confirmColor: '#FF4757',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await app.request(`/api/posts/${id}`, {
              user_id: app.globalData.userInfo.id
            }, 'DELETE');

            if (result.success) {
              const posts = this.data.posts;
              posts.splice(index, 1);
              this.setData({ posts });
              wx.showToast({ title: '已删除', icon: 'success' });
            } else {
              wx.showToast({ title: result.message || '删除失败', icon: 'none' });
            }
          } catch (error) {
            console.error('删除失败:', error);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  request(url, data) {
    return app.request(url, data);
  }
});
