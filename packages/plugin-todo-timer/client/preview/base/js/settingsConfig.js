class settingsConfig {
  constructor() {
    this.defaultConfig = {
      workDuration: 30,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      autoWork: false,
      autoBreak: false,
      showSuccessPopup: false,

      showFloatingWindow: true,
      showTomatoAnimation: true,
      autoHideAni: false,

      darkMode: "light",

      opacity: 1,
    };
    this.config = null;


    this.getConfig();


    this.onchange = () => { }; // 状态变更事件

    this.onClockChange = () => { }; // 时钟变更事件

    this.onShowFloatingWindowChange = () => { }; // 浮窗显示变更事件
    this.onShowTomatoAnimationChange = () => { }; // 番茄动画显示变更事件
    this.onAutoHideAniChange = () => { }; // 自动隐藏动画变更事件
  }

  // 获取配置
  getConfig() {
    let config = store.getItem("settings");
    if (!config) {
      config = this.defaultConfig;
    } else {
      // 合并默认配置
      config = { ...this.defaultConfig, ...config };
    }
    this.saveConfig(config);
  }

  // 保存配置
  saveConfig(config) {
    store.setItem("settings", config);
    this.config = config;
  }

  // 重新从存储加载配置，并触发全套应用回调（供设置页「确定」按钮一键重载，无需手动刷新）
  reload() {
    const saved = store.getItem("settings");
    this.config = { ...this.defaultConfig, ...(saved || {}) };
    this.saveConfig(this.config);

    this.onchange();
    this.onClockChange({
      workDuration: this.config.workDuration,
      shortBreakDuration: this.config.shortBreakDuration,
      longBreakDuration: this.config.longBreakDuration,
      longBreakInterval: this.config.longBreakInterval,
      autoWork: this.config.autoWork,
      autoBreak: this.config.autoBreak,
    });
    this.onDarkModeChange(this.config.darkMode);
    this.onOpacityChange(this.config.opacity);
    this.onShowFloatingWindowChange(this.config.showFloatingWindow);
    this.onShowTomatoAnimationChange(this.config.showTomatoAnimation);
    this.onAutoHideAniChange(this.config.autoHideAni);
  }



  // 更新配置
  updateConfig(key, value) {
    if (this.config[key] === value) return; // 如果配置没有变化，则不更新
        
    // 更新配置
    this.config[key] = value;
    this.saveConfig(this.config);
    this.onchange();

    // 根据具体属性触发对应的回调
    switch(key) {
      case 'showFloatingWindow':
        this.onShowFloatingWindowChange(value);
        return;
      case 'showTomatoAnimation':
        this.onShowTomatoAnimationChange(value);
        return;
      case 'autoHideAni':
        this.onAutoHideAniChange(value);
        return;
      case 'workDuration':
      case 'shortBreakDuration':
      case 'longBreakDuration':
      case 'longBreakInterval':
      case 'autoWork':
      case 'autoBreak':

        const clockConfig = {
          workDuration: this.config.workDuration,
          shortBreakDuration: this.config.shortBreakDuration,
          longBreakDuration: this.config.longBreakDuration,
          longBreakInterval: this.config.longBreakInterval,
          autoWork: this.config.autoWork,
          autoBreak: this.config.autoBreak,
        }

        this.onClockChange(clockConfig);
        return;
      case 'darkMode':
        this.onDarkModeChange(value);
        return;
      case 'opacity':
        this.onOpacityChange(value);
        return;
    }

  }
}
