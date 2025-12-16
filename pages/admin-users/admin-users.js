const app = getApp();

Page({
  data: {
    users: [],
    keyword: '',
    page: 1,
    hasMore: true,
    isLoading: true,
    showRolePicker: false,
    selectedUser: null,
    availableRoles: [
      { code: 'school_admin', name: '校区管理员' },
      { code: 'event_manager', name: '赛事管理员' },
      { code: 'event_admin', name: '赛事裁判' }
    ]
  },

  onLoad() {
    this.loadUsers();
  },

  onShow() {
    this.loadUsers();
  },

  async loadUsers(append = false) {
    if (!append) {
      this.setData({ isLoading: true, page: 1 });
    }

    try {
      const res = await this.request('/api/admin/users', {
        user_id: app.globalData.userInfo.id,
        keyword: this.data.keyword,
        page: this.data.page,
        limit: 20
      });

      if (res.success) {
        const users = res.data.map(u => ({
          ...u,
          type_label: this.getTypeLabel(u.user_type),
          roles_list: u.roles ? u.roles.split(',') : []
        }));

        this.setData({
          users: append ? [...this.data.users, ...users] : users,
          hasMore: users.length === 20
        });
      }
    } catch (error) {
      console.error('Load users error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  getTypeLabel(type) {
    const map = {
      student: '学生',
      teacher: '教师',
      alumni: '校友',
      other: '其他'
    };
    return map[type] || type;
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  onSearch() {
    this.loadUsers();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.setData({ page: this.data.page + 1 });
      this.loadUsers(true);
    }
  },

  onShowRolePicker(e) {
    const { user } = e.currentTarget.dataset;
    this.setData({
      selectedUser: user,
      showRolePicker: true
    });
  },

  onCloseRolePicker() {
    this.setData({
      showRolePicker: false,
      selectedUser: null
    });
  },

  async onAssignRole(e) {
    const { roleCode } = e.detail;
    const { selectedUser } = this.data;

    try {
      const res = await this.request(`/api/admin/users/${selectedUser.id}/role`, {
        user_id: app.globalData.userInfo.id,
        role_code: roleCode,
        granted_by: app.globalData.userInfo.id
      }, 'POST');

      if (res.success) {
        wx.showToast({ title: '分配成功', icon: 'success' });
        this.onCloseRolePicker();
        this.loadUsers();
      } else {
        wx.showToast({ title: res.message || '分配失败', icon: 'none' });
      }
    } catch (error) {
      console.error('Assign role error:', error);
      wx.showToast({ title: '分配失败', icon: 'none' });
    }
  },

  onViewProfile(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/user-profile/user-profile?id=${id}` });
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
