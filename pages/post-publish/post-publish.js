const app = getApp();

Page({
  data: {
    reviewMode: false,
    postType: 'post',
    content: '',
    images: [],
    location: '',
    date: '',
    time: '',
    maxParticipants: 2,
    isSubmitting: false
  },

  onLoad() {
    // 审核模式下返回上一页
    if (app.globalData.reviewMode) {
      wx.showToast({ title: '功能开发中', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 500);
      return;
    }
  },

  onSelectType(e) {
    this.setData({ postType: e.currentTarget.dataset.type });
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  onLocationInput(e) {
    this.setData({ location: e.detail.value });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onTimeChange(e) {
    this.setData({ time: e.detail.value });
  },

  onIncrease() {
    if (this.data.maxParticipants < 10) {
      this.setData({ maxParticipants: this.data.maxParticipants + 1 });
    }
  },

  onDecrease() {
    if (this.data.maxParticipants > 2) {
      this.setData({ maxParticipants: this.data.maxParticipants - 1 });
    }
  },

  onAddImage() {
    const remaining = 9 - this.data.images.length;
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      success: (res) => {
        const newImages = res.tempFiles.map(f => f.tempFilePath);
        this.setData({ images: [...this.data.images, ...newImages] });
      }
    });
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    images.splice(index, 1);
    this.setData({ images });
  },

  async onSubmit() {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }

    this.setData({ isSubmitting: true });

    try {
      const imageUrls = this.data.images;
      let url, data;

      if (this.data.postType === 'invitation') {
        let scheduledTime = null;
        if (this.data.date && this.data.time) {
          scheduledTime = `${this.data.date} ${this.data.time}:00`;
        }
        url = '/api/invitations';
        data = {
          user_id: app.globalData.userInfo.id,
          post_content: this.data.content,
          post_images: imageUrls,
          location: this.data.location,
          scheduled_time: scheduledTime,
          max_participants: this.data.maxParticipants,
          school_id: app.globalData.userInfo.school_id
        };
      } else {
        url = '/api/posts';
        data = {
          user_id: app.globalData.userInfo.id,
          content: this.data.content,
          images: imageUrls,
          school_id: app.globalData.userInfo.school_id
        };
      }

      const res = await this.request(url, data, 'POST');

      if (res.success) {
        wx.showToast({ title: '发布成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      } else {
        wx.showToast({ title: res.message || '发布失败', icon: 'none' });
      }
    } catch (error) {
      console.error('发布失败:', error);
      wx.showToast({ title: '发布失败', icon: 'none' });
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
