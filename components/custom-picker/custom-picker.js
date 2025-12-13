Component({
  properties: {
    // 标签文字
    label: {
      type: String,
      value: ''
    },
    // 占位文字
    placeholder: {
      type: String,
      value: '请选择'
    },
    // 选项列表 [{id, name}]
    options: {
      type: Array,
      value: []
    },
    // 当前选中值
    value: {
      type: Number,
      value: null
    },
    // 是否必填
    required: {
      type: Boolean,
      value: false
    },
    // 是否禁用
    disabled: {
      type: Boolean,
      value: false
    }
  },

  data: {
    isOpen: false,
    selectedItem: null
  },

  observers: {
    'value, options': function(value, options) {
      if (value && options && options.length > 0) {
        const item = options.find(opt => opt.id === value);
        this.setData({ selectedItem: item || null });
      } else {
        this.setData({ selectedItem: null });
      }
    }
  },

  methods: {
    toggleDropdown() {
      if (this.data.disabled) return;
      this.setData({ isOpen: !this.data.isOpen });
    },

    selectOption(e) {
      const { id, name } = e.currentTarget.dataset;
      this.setData({
        selectedItem: { id, name },
        isOpen: false
      });
      this.triggerEvent('change', { value: id, item: { id, name } });
    },

    closeDropdown() {
      this.setData({ isOpen: false });
    }
  }
});
