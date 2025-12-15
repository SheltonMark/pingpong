Component({
  properties: {
    options: { type: Array, value: [] },
    value: { type: String, value: '' },
    placeholder: { type: String, value: '请选择' },
    disabled: { type: Boolean, value: false }
  },
  data: {
    isOpen: false,
    selectedLabel: ''
  },
  observers: {
    'value, options': function(value, options) {
      const selected = options.find(opt => opt.value === value);
      this.setData({ selectedLabel: selected ? selected.label : '' });
    }
  },
  methods: {
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
