const app = getApp();

Page({
  data: {
    // 用户类型：student(在校生), graduate(毕业生), teacher(老师), staff(教职工)
    userTypes: [
      { key: 'student', label: '在校生' },
      { key: 'graduate', label: '毕业生' },
      { key: 'teacher', label: '老师' },
      { key: 'staff', label: '教职工' }
    ],
    selectedType: 'student',

    // 表单数据
    form: {
      name: '',
      gender: null,
      phone: '',
      schoolId: null,
      collegeId: null,
      departmentId: null,
      className: '',
      enrollmentYear: null
    },

    // 下拉选项
    genderOptions: [
      { id: 'male', name: '男' },
      { id: 'female', name: '女' }
    ],
    schools: [],
    colleges: [],
    departments: [],
    yearOptions: [],

    // 状态
    loading: false,
    submitting: false
  },

  onLoad() {
    this.generateYearOptions();
    this.loadSchools();
  },

  // 生成年份选项（最近10年）
  generateYearOptions() {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let i = currentYear; i >= currentYear - 10; i--) {
      years.push({ id: i, name: String(i) });
    }
    this.setData({ yearOptions: years });
  },

  // 加载学校列表
  async loadSchools() {
    try {
      this.setData({ loading: true });
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/common/schools`,
          success: (res) => resolve(res),
          fail: reject
        });
      });

      if (res.data && res.data.data) {
        this.setData({
          schools: res.data.data,
          loading: false
        });
      }
    } catch (error) {
      console.error('加载学校失败:', error);
      this.setData({ loading: false });
      // 使用模拟数据
      this.setData({
        schools: [
          { id: 1, name: '浙江工业大学' },
          { id: 2, name: '浙江大学' },
          { id: 3, name: '复旦大学' },
          { id: 4, name: '上海交通大学' }
        ]
      });
    }
  },

  // 加载学院列表
  async loadColleges(schoolId) {
    if (!schoolId) {
      this.setData({ colleges: [], departments: [] });
      return;
    }

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/common/colleges?school_id=${schoolId}`,
          success: (res) => resolve(res),
          fail: reject
        });
      });

      if (res.data && res.data.data) {
        this.setData({ colleges: res.data.data });
      }
    } catch (error) {
      console.error('加载学院失败:', error);
    }
  },

  // 加载下属单位列表
  async loadDepartments(schoolId) {
    if (!schoolId) {
      this.setData({ departments: [] });
      return;
    }

    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/common/departments?school_id=${schoolId}`,
          success: (res) => resolve(res),
          fail: reject
        });
      });

      if (res.data && res.data.data) {
        this.setData({ departments: res.data.data });
      }
    } catch (error) {
      console.error('加载单位失败:', error);
    }
  },

  // 选择用户类型
  selectType(e) {
    const { type } = e.currentTarget.dataset;
    this.setData({
      selectedType: type,
      'form.collegeId': null,
      'form.departmentId': null,
      'form.className': '',
      'form.enrollmentYear': null
    });

    // 教职工需要加载下属单位
    if (type === 'staff' && this.data.form.schoolId) {
      this.loadDepartments(this.data.form.schoolId);
    }
  },

  // 输入框变化
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    this.setData({ [`form.${field}`]: value });
  },

  // 下拉选择变化
  onPickerChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    this.setData({ [`form.${field}`]: value });

    // 学校变化时，重新加载学院/单位
    if (field === 'schoolId') {
      this.setData({
        'form.collegeId': null,
        'form.departmentId': null
      });
      this.loadColleges(value);
      if (this.data.selectedType === 'staff') {
        this.loadDepartments(value);
      }
    }
  },

  // 表单验证
  validateForm() {
    const { form, selectedType } = this.data;
    const errors = [];

    if (!form.name || form.name.trim() === '') {
      errors.push('请输入姓名');
    }
    if (!form.gender) {
      errors.push('请选择性别');
    }
    if (!form.phone || !/^1\d{10}$/.test(form.phone)) {
      errors.push('请输入正确的手机号');
    }
    if (!form.schoolId) {
      errors.push('请选择学校');
    }

    // 根据用户类型验证
    if (selectedType === 'student') {
      if (!form.collegeId) errors.push('请选择学院');
      if (!form.className) errors.push('请输入班级');
      if (!form.enrollmentYear) errors.push('请选择入学年份');
    } else if (selectedType === 'graduate') {
      if (!form.collegeId) errors.push('请选择学院');
      if (!form.enrollmentYear) errors.push('请选择入学年份');
    } else if (selectedType === 'teacher') {
      if (!form.collegeId) errors.push('请选择学院');
    } else if (selectedType === 'staff') {
      if (!form.departmentId) errors.push('请选择下属单位');
    }

    return errors;
  },

  // 提交表单
  async onSubmit() {
    const errors = this.validateForm();
    if (errors.length > 0) {
      wx.showToast({
        title: errors[0],
        icon: 'none'
      });
      return;
    }

    this.setData({ submitting: true });

    try {
      const { form, selectedType } = this.data;
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/user/register`,
          method: 'POST',
          data: {
            openid: app.globalData.openid,
            user_type: selectedType,
            name: form.name.trim(),
            gender: form.gender,
            phone: form.phone,
            school_id: form.schoolId,
            college_id: form.collegeId,
            department_id: form.departmentId,
            class_name: form.className,
            enrollment_year: form.enrollmentYear
          },
          success: (res) => resolve(res),
          fail: reject
        });
      });

      if (res.data && res.data.success) {
        wx.showToast({
          title: '注册成功',
          icon: 'success'
        });

        // 更新全局用户信息
        app.globalData.userInfo = res.data.data;
        app.globalData.isRegistered = true;

        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 1500);
      } else {
        throw new Error(res.data?.message || '注册失败');
      }
    } catch (error) {
      console.error('注册失败:', error);
      wx.showToast({
        title: error.message || '注册失败，请重试',
        icon: 'none'
      });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
