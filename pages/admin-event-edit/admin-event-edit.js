const app = getApp();

Page({
  data: {
    eventId: null,
    isEdit: false,
    form: {
      title: '',
      description: '',
      event_type: 'singles',
      event_format: 'round_robin',
      scope: 'school',
      best_of: 5,
      points_per_game: 11,
      counts_for_ranking: true,
      registration_start: '',
      registration_end: '',
      event_start: '',
      event_end: '',
      location: '',
      max_participants: 32,
      status: 'draft'
    },
    typeOptions: [
      { value: 'singles', label: '单打' },
      { value: 'doubles', label: '双打' },
      { value: 'team', label: '团体' }
    ],
    formatOptions: [
      { value: 'round_robin', label: '循环赛' },
      { value: 'knockout', label: '淘汰赛' }
    ],
    statusOptions: [
      { value: 'draft', label: '草稿' },
      { value: 'registration', label: '报名中' },
      { value: 'ongoing', label: '进行中' },
      { value: 'finished', label: '已结束' }
    ],
    typeIndex: 0,
    formatIndex: 0,
    statusIndex: 0,
    isSubmitting: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ eventId: options.id, isEdit: true });
      wx.setNavigationBarTitle({ title: '编辑赛事' });
      this.loadEvent(options.id);
    } else {
      wx.setNavigationBarTitle({ title: '创建赛事' });
    }
  },

  async loadEvent(id) {
    try {
      const res = await this.request(`/api/events/${id}`);
      if (res.success) {
        const form = res.data;
        // Calculate picker indices
        const typeIndex = this.data.typeOptions.findIndex(t => t.value === form.event_type);
        const formatIndex = this.data.formatOptions.findIndex(f => f.value === form.event_format);
        const statusIndex = this.data.statusOptions.findIndex(s => s.value === form.status);

        this.setData({
          form,
          typeIndex: typeIndex >= 0 ? typeIndex : 0,
          formatIndex: formatIndex >= 0 ? formatIndex : 0,
          statusIndex: statusIndex >= 0 ? statusIndex : 0
        });
      }
    } catch (error) {
      console.error('Load event error:', error);
    }
  },

  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onTypeChange(e) {
    const index = e.detail.value;
    this.setData({
      typeIndex: index,
      'form.event_type': this.data.typeOptions[index].value
    });
  },

  onFormatChange(e) {
    const index = e.detail.value;
    this.setData({
      formatIndex: index,
      'form.event_format': this.data.formatOptions[index].value
    });
  },

  onStatusChange(e) {
    const index = e.detail.value;
    this.setData({
      statusIndex: index,
      'form.status': this.data.statusOptions[index].value
    });
  },

  onDateChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onSwitchChange(e) {
    const { field } = e.currentTarget.dataset;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  async onSubmit() {
    const { form, eventId, isEdit, isSubmitting } = this.data;

    if (!form.title) {
      wx.showToast({ title: '请输入赛事名称', icon: 'none' });
      return;
    }

    if (isSubmitting) return;
    this.setData({ isSubmitting: true });

    try {
      const payload = {
        ...form,
        user_id: app.globalData.userInfo.id,
        school_id: app.globalData.userInfo.school_id
      };

      let res;
      if (isEdit) {
        res = await this.request(`/api/admin/events/${eventId}`, payload, 'PUT');
      } else {
        res = await this.request('/api/admin/events', payload, 'POST');
      }

      if (res.success) {
        wx.showToast({ title: isEdit ? '更新成功' : '创建成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    } catch (error) {
      console.error('Submit error:', error);
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      this.setData({ isSubmitting: false });
    }
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
