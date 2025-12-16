const app = getApp();

Page({
  data: {
    announcements: [],
    isLoading: true,
    showEditor: false,
    editForm: {
      id: null,
      title: '',
      content: '',
      status: 'active'
    },
    statusOptions: [
      { value: 'active', label: '显示' },
      { value: 'hidden', label: '隐藏' }
    ],
    statusIndex: 0
  },

  onLoad() {
    this.loadAnnouncements();
  },

  onShow() {
    this.loadAnnouncements();
  },

  async loadAnnouncements() {
    this.setData({ isLoading: true });
    try {
      const res = await this.request('/api/admin/announcements', {
        user_id: app.globalData.userInfo.id
      });

      if (res.success) {
        const announcements = res.data.map(a => ({
          ...a,
          status_label: a.status === 'active' ? '显示' : '隐藏'
        }));
        this.setData({ announcements });
      }
    } catch (error) {
      console.error('Load announcements error:', error);
    } finally {
      this.setData({ isLoading: false });
    }
  },

  onShowCreate() {
    this.setData({
      showEditor: true,
      editForm: {
        id: null,
        title: '',
        content: '',
        status: 'active'
      },
      statusIndex: 0
    });
  },

  onShowEdit(e) {
    const { item } = e.currentTarget.dataset;
    const statusIndex = this.data.statusOptions.findIndex(s => s.value === item.status);
    this.setData({
      showEditor: true,
      editForm: {
        id: item.id,
        title: item.title,
        content: item.content,
        status: item.status
      },
      statusIndex: statusIndex >= 0 ? statusIndex : 0
    });
  },

  onCloseEditor() {
    this.setData({ showEditor: false });
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`editForm.${field}`]: e.detail.value });
  },

  onStatusChange(e) {
    const index = e.detail.value;
    this.setData({
      statusIndex: index,
      'editForm.status': this.data.statusOptions[index].value
    });
  },

  async onSubmit() {
    const { editForm } = this.data;

    if (!editForm.title) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }

    try {
      let res;
      if (editForm.id) {
        res = await this.request(`/api/admin/announcements/${editForm.id}`, {
          ...editForm,
          user_id: app.globalData.userInfo.id
        }, 'PUT');
      } else {
        res = await this.request('/api/admin/announcements', {
          ...editForm,
          user_id: app.globalData.userInfo.id
        }, 'POST');
      }

      if (res.success) {
        wx.showToast({ title: editForm.id ? '更新成功' : '创建成功', icon: 'success' });
        this.onCloseEditor();
        this.loadAnnouncements();
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (error) {
      console.error('Submit error:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  onDelete(e) {
    const { id } = e.currentTarget.dataset;

    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      success: async (res) => {
        if (res.confirm) {
          try {
            const result = await this.request(`/api/admin/announcements/${id}`, {
              user_id: app.globalData.userInfo.id
            }, 'DELETE');

            if (result.success) {
              wx.showToast({ title: '删除成功', icon: 'success' });
              this.loadAnnouncements();
            }
          } catch (error) {
            console.error('Delete error:', error);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
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
