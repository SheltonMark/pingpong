const app = getApp();

Page({
  data: {
    currentSchoolId: null,
    currentSchoolName: '',
    currentPostType: '', // '' | 'post' | 'invitation'
    schools: [],

    // 帖子
    posts: [],
    postsPage: 1,
    isLoading: false,
    isRefreshing: false,
    noMore: false,

    // 独立约球（没有关联帖子的）
    standaloneInvitations: []
  },

  onLoad() {
    this.loadSchools();
    this.loadPosts();
    this.loadStandaloneInvitations();
  },

  onShow() {
    this.loadPosts(true);
    this.loadStandaloneInvitations();
    // 更新自定义 tabBar 选中状态
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  // 加载学校列表
  async loadSchools() {
    try {
      const res = await this.request('/api/common/schools');
      if (res.success) {
        this.setData({ schools: res.data });
      } else {
        console.error('加载学校列表失败:', res.message);
        wx.showToast({ title: '加载学校列表失败', icon: 'none' });
      }
    } catch (error) {
      console.error('加载学校列表失败:', error);
      wx.showToast({ title: '网络错误', icon: 'none' });
    }
  },

  // 点击学校选择器（弹出下拉菜单）
  onTapSchoolSelector() {
    const { schools, currentSchoolId } = this.data;

    if (schools.length === 0) {
      wx.showToast({ title: '暂无学校数据', icon: 'none' });
      return;
    }

    // 构建选项列表，添加"全部学校"
    const itemList = ['全部学校', ...schools.map(s => s.short_name || s.name)];

    wx.showActionSheet({
      itemList,
      success: (res) => {
        if (res.tapIndex === 0) {
          // 选择"全部学校"
          if (currentSchoolId !== null) {
            this.setData({
              currentSchoolId: null,
              currentSchoolName: '',
              posts: [],
              postsPage: 1,
              noMore: false,
              standaloneInvitations: []
            });
            this.loadPosts();
            this.loadStandaloneInvitations();
          }
        } else {
          // 选择具体学校
          const selected = schools[res.tapIndex - 1];
          if (selected && selected.id !== currentSchoolId) {
            this.setData({
              currentSchoolId: selected.id,
              currentSchoolName: selected.short_name || selected.name,
              posts: [],
              postsPage: 1,
              noMore: false,
              standaloneInvitations: []
            });
            this.loadPosts();
            this.loadStandaloneInvitations();
          }
        }
      }
    });
  },

  // 选择学校筛选（保留兼容旧接口）
  onSelectSchool(e) {
    const id = e.currentTarget.dataset.id;
    const schoolId = id ? parseInt(id) : null;

    if (schoolId === this.data.currentSchoolId) return;

    this.setData({
      currentSchoolId: schoolId,
      posts: [],
      postsPage: 1,
      noMore: false,
      standaloneInvitations: []
    });

    this.loadPosts();
    this.loadStandaloneInvitations();
  },

  // 选择类型筛选
  onSelectType(e) {
    const postType = e.currentTarget.dataset.type || '';

    if (postType === this.data.currentPostType) return;

    this.setData({
      currentPostType: postType,
      posts: [],
      postsPage: 1,
      noMore: false,
      standaloneInvitations: []
    });

    this.loadPosts();
    // 只有选择全部或约球类型时才加载独立约球
    if (postType === '' || postType === 'invitation') {
      this.loadStandaloneInvitations();
    }
  },

  // 加载帖子
  async loadPosts(refresh = false) {
    if (this.data.isLoading) return;

    const page = refresh ? 1 : this.data.postsPage;
    this.setData({ isLoading: true });

    try {
      const params = {
        page,
        limit: 20
      };
      if (this.data.currentSchoolId) {
        params.school_id = this.data.currentSchoolId;
      }
      if (this.data.currentPostType) {
        params.post_type = this.data.currentPostType;
      }
      if (app.globalData.userInfo?.id) {
        params.user_id = app.globalData.userInfo.id;
      }

      const res = await this.request('/api/posts', params);

      if (res.success) {
        const posts = res.data.list.map(post => {
          const mapped = {
            ...post,
            time_label: this.formatTime(post.created_at),
            images: post.images || []
          };
          // 如果有关联的约球，格式化约球时间
          if (mapped.invitation && mapped.invitation.scheduled_time) {
            mapped.invitation = {
              ...mapped.invitation,
              time_label: this.formatDateTime(mapped.invitation.scheduled_time)
            };
          }
          return mapped;
        });

        this.setData({
          posts: refresh ? posts : [...this.data.posts, ...posts],
          postsPage: page + 1,
          noMore: posts.length < 20
        });
      } else {
        console.error('加载帖子失败:', res.message);
        wx.showToast({ title: '加载帖子失败', icon: 'none' });
      }
    } catch (error) {
      console.error('加载帖子失败:', error);
      wx.showToast({ title: '网络错误', icon: 'none' });
    } finally {
      this.setData({ isLoading: false, isRefreshing: false });
    }
  },

  // 加载独立约球（没有关联帖子的）
  async loadStandaloneInvitations() {
    try {
      const params = {
        standalone: true,
        limit: 10
      };
      if (this.data.currentSchoolId) {
        params.school_id = this.data.currentSchoolId;
      }

      const res = await this.request('/api/invitations', params);

      if (res.success) {
        const invitations = res.data.list.map(inv => ({
          ...inv,
          time_label: this.formatTime(inv.created_at),
          scheduled_time_label: this.formatDateTime(inv.scheduled_time)
        }));

        this.setData({ standaloneInvitations: invitations });
      } else {
        console.error('加载约球失败:', res.message);
      }
    } catch (error) {
      console.error('加载约球失败:', error);
    }
  },

  // 下拉刷新
  onRefresh() {
    this.setData({ isRefreshing: true });
    this.loadPosts(true);
    this.loadStandaloneInvitations();
  },

  // 加载更多
  onLoadMore() {
    if (!this.data.noMore) {
      this.loadPosts();
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

  // 分享
  onTapShare(e) {
    // 微信小程序分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
  },

  // 加入约球
  async onJoinInvitation(e) {
    const { id } = e.currentTarget.dataset;

    if (!app.globalData.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    try {
      const res = await this.request(`/api/invitations/${id}/join`, {
        user_id: app.globalData.userInfo.id
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '已加入', icon: 'success' });
        this.loadStandaloneInvitations();
      } else {
        wx.showToast({ title: res.message || '加入失败', icon: 'none' });
      }
    } catch (error) {
      console.error('加入失败:', error);
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

  // 页面分享
  onShareAppMessage() {
    return {
      title: '校乒网 - 广场',
      path: '/pages/square/square'
    };
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
