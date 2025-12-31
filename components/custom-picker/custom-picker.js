Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: null, value: null },
    placeholder: { type: String, value: '请选择' },
    disabled: { type: Boolean, value: false }
  },
  data: {
    isOpen: false,
    selectedLabel: '',
    normalizedOptions: []
  },
  observers: {
    'options': function(options) {
      // 兼容 { id, name } 和 { value, label } 两种格式
      const normalized = (options || []).map(opt => ({
        value: opt.value !== undefined ? opt.value : opt.id,
        label: opt.label !== undefined ? opt.label : opt.name
      }));
      this.setData({ normalizedOptions: normalized });
      this.updateSelectedLabel();
    },
    'value': function() {
      this.updateSelectedLabel();
    }
  },
  methods: {
    updateSelectedLabel() {
      const { value, normalizedOptions } = this.data;
      const selected = normalizedOptions.find(opt => opt.value === value);
      this.setData({ selectedLabel: selected ? selected.label : '' });
    },
    onTapTrigger() {
      if (this.data.disabled) return;
      this.setData({ isOpen: !this.data.isOpen });
    },
    onSelectOption(e) {
      const { value } = e.currentTarget.dataset;
      this.setData({ isOpen: false });
      this.triggerEvent('change', { value });
    },
    onClose() {
      this.setData({ isOpen: false });
    }
  }
});
