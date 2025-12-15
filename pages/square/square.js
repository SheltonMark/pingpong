const app = getApp();

// Mock数据（API不可用时使用）
const MOCK_POSTS = [
  {
    id: 1,
    author_name: '李思源',
    author_avatar: '',
    content: '今天下午有人想来体育馆打球吗？我在3号台，想找人练练反手！',
    like_count: 12,
    comment_count: 5,
    is_liked: false,
    created_at: new Date(Date.now() - 600000).toISOString(),
    school_name: '浙江工业大学',
    college_name: '计算机学院',
    images: []
  },
  {
    id: 2,
    author_name: '张明远',
    author_avatar: '',
    content: '🏆 恭喜在校联赛中获得冠军！这是连续第三年夺冠。希望其他同学向他学习，下学期还有更多赛事等着大家！',
    like_count: 48,
    comment_count: 16,
    is_liked: true,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    school_name: '浙江工业大学',
    college_name: '机械学院',
    images: []
  },
  {
    id: 3,
    author_name: '陈雨婷',
    author_avatar: '',
    content: '刚学会拉弧圈球，感觉手感还不太稳定，有没有大佬愿意指导一下新手 🙏',
    like_count: 8,
    comment_count: 12,
    is_liked: false,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    school_name: '浙江工业大学',
    college_name: '外国语学院',
    images: []
  },
  {
    id: 4,
    author_name: '刘大伟',
    author_avatar: '',
    content: '今天和李思源打了一场，3:2险胜！最后一局太紧张了，差点被翻盘。',
    like_count: 23,
    comment_count: 8,
    is_liked: false,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    school_name: '浙江工业大学',
    college_name: '土木学院',
    images: []
  }
];

const MOCK_INVITATIONS = [
  {
    id: 1,
    creator_name: '李思源',
    creator_avatar: '',
    title: '周末约球',
    location: '紫金港体育馆 3号台',
    scheduled_time: new Date(Date.now() + 172800000).toISOString(),
    max_participants: 2,
    participant_count: 1,
    status: 'open',
    school_name: '浙江工业大学',
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 2,
    creator_name: '王老师',
    creator_avatar: '',
    title: '练习赛找人',
    location: '紫金港体育馆 5号台',
    scheduled_time: new Date(Date.now() + 86400000).toISOString(),
    max_participants: 4,
    participant_count: 2,
    status: 'open',
    school_name: '浙江工业大学',
    created_at: new Date(Date.now() - 7200000).toISOString()
  }
];

const MOCK_SCHOOLS = [
  { id: 1, name: '浙江工业大学', short_name: '浙工大' },
  { id: 2, name: '浙江大学', short_name: '浙大' },
  { id: 3, name: '杭州电子科技大学', short_name: '杭电' }
];

Page({
  data: {
    currentSchoolId: null,
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
  },

  // 加载学校列表
  async loadSchools() {
    try {
      const res = await this.request('/api/common/schools');
      if (res.success) {
        this.setData({ schools: res.data });
      } else {
        // API失败，使用mock数据
        this.setData({ schools: MOCK_SCHOOLS });
      }
    } catch (error) {
      console.error('加载学校列表失败，使用mock数据:', error);
      this.setData({ schools: MOCK_SCHOOLS });
    }
  },

  // 选择学校筛选
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
      if (app.globalData.userInfo?.id) {
        params.user_id = app.globalData.userInfo.id;
      }

      const res = await this.request('/api/posts', params);

      if (res.success) {
        const posts = res.data.list.map(post => ({
          ...post,
          time_label: this.formatTime(post.created_at),
          images: post.images || []
        }));

        this.setData({
          posts: refresh ? posts : [...this.data.posts, ...posts],
          postsPage: page + 1,
          noMore: posts.length < 20
        });
      } else {
        // API失败，使用mock数据
        this.useMockPosts();
      }
    } catch (error) {
      console.error('加载帖子失败，使用mock数据:', error);
      this.useMockPosts();
    } finally {
      this.setData({ isLoading: false, isRefreshing: false });
    }
  },

  // 使用Mock帖子数据
  useMockPosts() {
    const posts = MOCK_POSTS.map(post => ({
      ...post,
      time_label: this.formatTime(post.created_at)
    }));
    this.setData({ posts, noMore: true });
  },

  // 使用Mock约球数据
  useMockInvitations() {
    const invitations = MOCK_INVITATIONS.map(inv => ({
      ...inv,
      time_label: this.formatTime(inv.created_at),
      scheduled_time_label: this.formatDateTime(inv.scheduled_time)
    }));
    this.setData({ standaloneInvitations: invitations });
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
        this.useMockInvitations();
      }
    } catch (error) {
      console.error('加载约球失败，使用mock数据:', error);
      this.useMockInvitations();
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
