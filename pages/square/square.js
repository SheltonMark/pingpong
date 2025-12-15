const app = getApp();

Page({
  data: {
    currentTab: 'posts',
    currentSchoolId: null,
    currentSchoolName: '全部学校',

    // 帖子
    posts: [],
    postsPage: 1,
    isLoading: false,
    isRefreshing: false,
    noMore: false,

    // 约球
    invitations: [],
    invitationsPage: 1,
    isLoadingInvitations: false,
    isRefreshingInvitations: false,
    noMoreInvitations: false
  },

  onLoad() {
    this.loadPosts();
  },

  onShow() {
    // 刷新数据
    if (this.data.currentTab === 'posts') {
      this.loadPosts(true);
    } else {
      this.loadInvitations(true);
    }
  },

  // 切换标签
  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;

    this.setData({ currentTab: tab });

    if (tab === 'invitations' && this.data.invitations.length === 0) {
      this.loadInvitations();
    }
  },

  // 学校筛选
  onTapSchoolFilter() {
    wx.showToast({ title: '学校筛选开发中', icon: 'none' });
  },

  // 加载帖子
  async loadPosts(refresh = false) {
    if (this.data.isLoading) return;

    const page = refresh ? 1 : this.data.postsPage;
    this.setData({ isLoading: true });

    try {
      const res = await this.request('/api/posts', {
        school_id: this.data.currentSchoolId,
        user_id: app.globalData.userInfo?.id,
        page,
        limit: 20
      });

      if (res.success) {
        const posts = res.data.list.map(post => ({
          ...post,
          time_label: this.formatTime(post.created_at)
        }));

        this.setData({
          posts: refresh ? posts : [...this.data.posts, ...posts],
          postsPage: page + 1,
          noMore: posts.length < 20
        });
      }
    } catch (error) {
      console.error('加载帖子失败:', error);
    } finally {
      this.setData({ isLoading: false, isRefreshing: false });
    }
  },

  // 加载约球
  async loadInvitations(refresh = false) {
    if (this.data.isLoadingInvitations) return;

    const page = refresh ? 1 : this.data.invitationsPage;
    this.setData({ isLoadingInvitations: true });

    try {
      const res = await this.request('/api/invitations', {
        school_id: this.data.currentSchoolId,
        user_id: app.globalData.userInfo?.id,
        page,
        limit: 20
      });

      if (res.success) {
        const invitations = res.data.list.map(inv => ({
          ...inv,
          time_label: this.formatDateTime(inv.scheduled_time)
        }));

        this.setData({
          invitations: refresh ? invitations : [...this.data.invitations, ...invitations],
          invitationsPage: page + 1,
          noMoreInvitations: invitations.length < 20
        });
      }
    } catch (error) {
      console.error('加载约球失败:', error);
    } finally {
      this.setData({ isLoadingInvitations: false, isRefreshingInvitations: false });
    }
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ isRefreshing: true });
    this.loadPosts(true);
  },

  onRefreshInvitations() {
    this.setData({ isRefreshingInvitations: true });
    this.loadInvitations(true);
  },

  // 加载更多
  onLoadMore() {
    if (!this.data.noMore) {
      this.loadPosts();
    }
  },

  onLoadMoreInvitations() {
    if (!this.data.noMoreInvitations) {
      this.loadInvitations();
    }
  },

  // 点赞
  async onTapLike(e) {
    const { id, index } = e.currentTarget.dataset;

    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    try {
      const res = await this.request('/api/posts/' + id + '/like', {
        user_id: app.globalData.userInfo.id
      }, 'POST');

      if (res.success) {
        const posts = this.data.posts;
        posts[index].is_liked = res.data.is_liked;
        posts[index].like_count = res.data.like_count;
        this.setData({ posts });
      }
    } catch (error) {
      console.error('点赞失败:', error);
    }
  },

  // 预览图片
  onPreviewImage(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  },

  // 点击帖子
  onTapPost(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/post-detail/post-detail?id=${id}` });
  },

  // 点击约球
  onTapInvitation(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/invitation-detail/invitation-detail?id=${id}` });
  },

  // 发布
  onTapPublish() {
    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/post-publish/post-publish' });
  },

  // 格式化时间
  formatTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = (now - date) / 1000;

    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + '天前';

    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  // 格式化日期时间
  formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  // 请求封装
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
