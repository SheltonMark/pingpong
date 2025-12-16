Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    },
    user: {
      type: Object,
      value: null
    },
    roles: {
      type: Array,
      value: []
    }
  },

  methods: {
    onClose() {
      this.triggerEvent('close');
    },

    onPreventBubble() {
      // Prevent tap events from bubbling to overlay
    },

    onSelectRole(e) {
      const { code } = e.currentTarget.dataset;
      this.triggerEvent('assign', { roleCode: code });
    }
  }
});
