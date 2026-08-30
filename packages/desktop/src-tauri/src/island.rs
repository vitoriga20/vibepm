//! 岛（widget）能力模块 —— 复用自 NetSpeed Dynamic Pro（MIT © 2026 GEORGEWU）src-tauri/src/lib.rs。
//! 代码原样保留（spec desktop-spec.md §10.2"原样复用不自创"）；仅剔除按拍板不搬的部分：
//! 任务栏挂件 ws server / FPS 插件（UDP 47292）/ NSD 托盘构建（M2 S8 与 vibepm 托盘合并时并入）。
//! 全屏检测线程从原 setup 内联提为 start_fullscreen_monitor，函数体未改。

use std::net::SocketAddr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::Networks;
use tauri::{Emitter, Manager, State};
use tokio::sync::Mutex as TokioMutex;

use std::sync::OnceLock;

// 全功能灵动岛智能双模动画锁
static ANIMATION_ID: AtomicU32 = AtomicU32::new(0);

// 将分散的坐标合并为一个结构体，并附带所有权 ID 防止误删
struct AnchorState {
    center_x: i32,
    origin_y: i32,
    left_x: i32,
    bottom_y: i32,
    active_id: u32,
}
static ANIMATION_ANCHOR: Mutex<Option<AnchorState>> = Mutex::new(None);

pub struct AppState {
    pub networks: Mutex<Networks>,
    // 歌词 WS 任务句柄（music_controller start/stop_websocket_lyrics 使用，NSD 原样）
    pub ws_task: TokioMutex<Option<tokio::task::JoinHandle<()>>>,
    // 换成专业的原生复选菜单项引用
    pub tray_items: Mutex<
        Option<(
            tauri::menu::CheckMenuItem<tauri::Wry>,
            tauri::menu::CheckMenuItem<tauri::Wry>,
            tauri::menu::CheckMenuItem<tauri::Wry>,
        )>,
    >,
}

#[tauri::command]
pub fn sync_tray_menu(
    state: State<'_, AppState>,
    island: Option<bool>,
    quiet: Option<bool>,
    glow: Option<bool>,
) {
    // 接收到 Vue 发来的状态，直接调用原生 API 改变打勾状态，不再拼接野路子字符串
    if let Some((island_item, quiet_item, glow_item)) = &*state.tray_items.lock().unwrap() {
        if let Some(v) = island {
            let _ = island_item.set_checked(v);
        }
        if let Some(v) = quiet {
            let _ = quiet_item.set_checked(v);
        }
        if let Some(v) = glow {
            let _ = glow_item.set_checked(v);
        }
    }
}

#[tauri::command]
pub fn get_network_stats(state: State<'_, AppState>) -> (u64, u64) {
    let mut networks = state.networks.lock().unwrap();
    networks.refresh_list();

    let mut total_rx = 0;
    let mut total_tx = 0;

    for (_interface_name, data) in networks.iter() {
        total_rx += data.total_received();
        total_tx += data.total_transmitted();
    }

    (total_rx, total_tx)
}

#[tauri::command]
pub async fn get_network_latency() -> Result<u128, String> {
    let timeout = Duration::from_millis(1500);
    // 主目标 + 备用目标：避免单一 IP/端口被网络环境拦截导致误判断网
    for addr_str in ["223.5.5.5:53", "114.114.114.114:53"] {
        let addr: SocketAddr = match addr_str.parse() {
            Ok(a) => a,
            Err(_) => continue,
        };
        let attempt_start = Instant::now();
        if tokio::time::timeout(timeout, tokio::net::TcpStream::connect(addr))
            .await
            .is_ok()
        {
            return Ok(attempt_start.elapsed().as_millis());
        }
    }
    Err("Timeout".to_string())
}

#[tauri::command]
pub fn is_widget_visible(app: tauri::AppHandle) -> bool {
    match app.get_webview_window("widget") {
        Some(win) => win.is_visible().unwrap_or(false),
        None => false,
    }
}

/// 打开 vibepm 主工作台并聚焦（岛右键"打开主窗"/双击岛入口；M2 S8 拍板语义）
#[tauri::command]
pub fn show_main_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// 读取系统剪贴板文本（Windows 专用），供灵动岛检测复制到链接
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    unsafe {
        use winapi::um::winbase::{GlobalLock, GlobalUnlock};
        use winapi::um::winuser::{CF_UNICODETEXT, CloseClipboard, GetClipboardData, OpenClipboard};

        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err("无法打开剪贴板".to_string());
        }

        // 若剪贴板为空或格式不含文本，全局句柄为 NULL
        let handle = GetClipboardData(CF_UNICODETEXT as u32);
        if handle.is_null() {
            CloseClipboard();
            return Ok(String::new());
        }

        let ptr = GlobalLock(handle) as *const u16;
        if ptr.is_null() {
            CloseClipboard();
            return Ok(String::new());
        }

        // 统计字符串长度直到遇到结尾空字符
        let mut len = 0usize;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        let text = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len));

        GlobalUnlock(handle);
        CloseClipboard();
        Ok(text)
    }
}

// 非 Windows 平台空实现，避免编译报错
#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    Ok(String::new())
}

#[tauri::command]
pub fn show_window_no_activate(app: tauri::AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = win.hwnd() {
                unsafe {
                    // SW_SHOWNOACTIVATE = 4，显示窗口但不抢占当前应用的焦点
                    winapi::um::winuser::ShowWindow(hwnd.0 as _, 4);
                    // 强制回到置顶带最顶端：防止被其他置顶窗口（全屏应用/视频播放器悬浮窗等）盖住
                    winapi::um::winuser::SetWindowPos(
                        hwnd.0 as _,
                        winapi::um::winuser::HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        // SWP_NOSIZE(0x0001) | SWP_NOMOVE(0x0002) | SWP_NOACTIVATE(0x0010)
                        0x0001 | 0x0002 | 0x0010,
                    );
                }
                // vibepm 时序坑（S7 实证）：setup 被 sidecar spawn 阻塞期间事件循环未启动，
                // 前端启动早期的 ShowWindow 会被窗口初始化吞掉且不自愈（NSD 原版 setup 无阻塞
                // 故无此问题）。命令语义不变：显示确认 + 有限次重试自愈。
                let hwnd_raw = hwnd.0 as isize;
                let win_clone = win.clone();
                std::thread::spawn(move || {
                    for _ in 0..3 {
                        std::thread::sleep(std::time::Duration::from_millis(800));
                        match win_clone.is_visible() {
                            Ok(true) => return,
                            _ => {}
                        }
                        unsafe {
                            winapi::um::winuser::ShowWindow(hwnd_raw as _, 4);
                            winapi::um::winuser::SetWindowPos(
                                hwnd_raw as _,
                                winapi::um::winuser::HWND_TOPMOST,
                                0,
                                0,
                                0,
                                0,
                                0x0001 | 0x0002 | 0x0010,
                            );
                        }
                    }
                });
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = win.show();
        }
    }
}

// 新增：底层原子化窗口调整指令，彻底消除位移闪烁
#[tauri::command]
pub fn set_window_bounds(app: tauri::AppHandle, x: i32, y: i32, width: i32, height: i32) {
    #[cfg(target_os = "windows")]
    {
        if let Some(win) = app.get_webview_window("widget") {
            if let Ok(hwnd) = win.hwnd() {
                unsafe {
                    // 0x0014 = SWP_NOACTIVATE (0x0010) | SWP_NOZORDER (0x0004)
                    // 确保同时修改坐标和尺寸时，不抢占用户焦点，不打乱窗口层级
                    winapi::um::winuser::SetWindowPos(
                        hwnd.0 as _,
                        std::ptr::null_mut(),
                        x,
                        y,
                        width,
                        height,
                        0x0014,
                    );
                }
            }
        }
    }
}

#[tauri::command]
pub async fn start_island_animation(
    window: tauri::WebviewWindow,
    start_width: f64,
    start_height: f64,
    target_width: f64,
    target_height: f64,
    spring_style: String,
) -> Result<(), String> {
    let id = ANIMATION_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let scale_factor = window.scale_factor().unwrap_or(1.0);

    #[cfg(target_os = "windows")]
    {
        if let Ok(hwnd) = window.hwnd() {
            use winapi::shared::windef::RECT;
            use winapi::um::winuser::{GetWindowRect, SetWindowPos};

            let mut rect: RECT = unsafe { std::mem::zeroed() };
            unsafe {
                GetWindowRect(hwnd.0 as _, &mut rect);
            }

            let (anchor_cx, anchor_cy, _anchor_lx, _anchor_by) = {
                let mut anchor_guard = ANIMATION_ANCHOR.lock().unwrap_or_else(|e| e.into_inner());

                if let Some(anchor) = anchor_guard.as_mut() {
                    anchor.active_id = id;
                    (
                        anchor.center_x,
                        anchor.origin_y,
                        anchor.left_x,
                        anchor.bottom_y,
                    )
                } else {
                    let cx = rect.left + (rect.right - rect.left) / 2;
                    let cy = rect.top;
                    let lx = rect.left;
                    let by = rect.bottom;
                    *anchor_guard = Some(AnchorState {
                        center_x: cx,
                        origin_y: cy,
                        left_x: lx,
                        bottom_y: by,
                        active_id: id,
                    });
                    (cx, cy, lx, by)
                }
            };

            let window_clone = window.clone();
            let hwnd_raw = hwnd.0 as isize;

            std::thread::spawn(move || {
                let start_time = std::time::Instant::now();

                // 2. 👈 根据参数动态匹配弹性物理常数
                // Stiff (克制): 提高频率，大幅拉高阻尼，使其快准狠
                // Bouncy (Q弹): 保持原本欢快的震喜感
                let (freq, decay, duration_ms) = if spring_style == "stiff" {
                    (3.8, 22.0, 250)
                } else {
                    (2.4, 12.0, 400)
                };

                let duration = std::time::Duration::from_millis(duration_ms);

                while start_time.elapsed() < duration {
                    std::thread::sleep(std::time::Duration::from_millis(8));

                    if ANIMATION_ID.load(Ordering::SeqCst) != id {
                        return;
                    }

                    let elapsed = start_time.elapsed().as_secs_f64();
                    let progress = elapsed / (duration_ms as f64 / 1000.0);
                    if progress >= 1.0 {
                        break;
                    }

                    let spring = 1.0
                        - (freq * elapsed * 2.0 * std::f64::consts::PI).cos()
                            * (-decay * elapsed).exp();
                    let current_w = start_width + (target_width - start_width) * spring;
                    let current_h = start_height + (target_height - start_height) * spring;

                    let phys_window_w = (current_w * scale_factor).round() as i32;
                    let phys_window_h = (current_h * scale_factor).round() as i32;

                    let final_x = anchor_cx - phys_window_w / 2;
                    let final_y = anchor_cy;

                    unsafe {
                        SetWindowPos(
                            hwnd_raw as _,
                            std::ptr::null_mut(),
                            final_x,
                            final_y,
                            phys_window_w,
                            phys_window_h,
                            0x0014,
                        );
                    }
                }

                if ANIMATION_ID.load(Ordering::SeqCst) == id {
                    let phys_target_w = (target_width * scale_factor).round() as i32;
                    let phys_target_h = (target_height * scale_factor).round() as i32;

                    let final_x = anchor_cx - phys_target_w / 2;
                    let final_y = anchor_cy;

                    unsafe {
                        SetWindowPos(
                            hwnd_raw as _,
                            std::ptr::null_mut(),
                            final_x,
                            final_y,
                            phys_target_w,
                            phys_target_h,
                            0x0014,
                        );
                    }
                    let _ = window_clone.emit("island-resize", vec![target_width, target_height]);

                    if let Ok(mut guard) = ANIMATION_ANCHOR.lock() {
                        if let Some(anchor) = guard.as_ref() {
                            if anchor.active_id == id {
                                *guard = None;
                            }
                        }
                    }
                }
            });
        }
    }
    Ok(())
}

// 缓存 AppHandle 供剪贴板监听线程的窗口过程使用
#[cfg(target_os = "windows")]
static CLIPBOARD_EMITTER: OnceLock<tauri::AppHandle> = OnceLock::new();

// 剪贴板监听窗口过程：一旦检测到剪贴板内容变化（WM_CLIPBOARDUPDATE），推送事件给前端
#[cfg(target_os = "windows")]
extern "system" fn clipboard_wndproc(
    hwnd: winapi::shared::windef::HWND,
    msg: winapi::shared::minwindef::UINT,
    wparam: winapi::shared::minwindef::WPARAM,
    lparam: winapi::shared::minwindef::LPARAM,
) -> winapi::shared::minwindef::LRESULT {
    use winapi::um::winuser::{
        DefWindowProcW, PostQuitMessage, WM_CLIPBOARDUPDATE, WM_DESTROY,
    };
    unsafe {
        if msg == WM_CLIPBOARDUPDATE {
            if let Some(app) = CLIPBOARD_EMITTER.get() {
                let _ = Emitter::emit(app, "clipboard-changed", ());
            }
            return 0;
        }
        if msg == WM_DESTROY {
            PostQuitMessage(0);
            return 0;
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }
}

// 启动剪贴板变更监听（事件驱动，无需轮询）：通过隐藏窗口 + AddClipboardFormatListener
#[cfg(target_os = "windows")]
pub fn start_clipboard_monitor(app: tauri::AppHandle) {
    use winapi::um::libloaderapi::GetModuleHandleW;
    use winapi::um::winuser::{
        AddClipboardFormatListener, CreateWindowExW, DispatchMessageW, GetMessageW,
        RegisterClassW, TranslateMessage, MSG, WNDCLASSW, WS_OVERLAPPEDWINDOW,
    };

    // 缓存 AppHandle 供窗口过程回调使用
    let _ = CLIPBOARD_EMITTER.set(app);

    std::thread::spawn(|| unsafe {
        let class_name = "NetSpeedClipboardListener"
            .encode_utf16()
            .chain(Some(0))
            .collect::<Vec<u16>>();
        let hinstance = GetModuleHandleW(std::ptr::null());

        let wc = WNDCLASSW {
            style: 0,
            lpfnWndProc: Some(clipboard_wndproc),
            cbClsExtra: 0,
            cbWndExtra: 0,
            hInstance: hinstance as _,
            hIcon: std::ptr::null_mut(),
            hCursor: std::ptr::null_mut(),
            hbrBackground: std::ptr::null_mut(),
            lpszMenuName: std::ptr::null(),
            lpszClassName: class_name.as_ptr(),
        };
        // 注册窗口失败则直接退出监听线程
        if RegisterClassW(&wc) == 0 {
            return;
        }

        let hwnd = CreateWindowExW(
            0,
            class_name.as_ptr(),
            class_name.as_ptr(),
            WS_OVERLAPPEDWINDOW,
            0,
            0,
            0,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            hinstance as _,
            std::ptr::null_mut(),
        );
        if hwnd.is_null() {
            return;
        }

        // 注册为剪贴板格式监听者，剪贴板变化时收到 WM_CLIPBOARDUPDATE
        AddClipboardFormatListener(hwnd);

        // 线程消息循环
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}

// 全屏应用检测线程（函数体与原 lib.rs setup 内联版一致，仅提出为函数）
pub fn start_fullscreen_monitor(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        unsafe {
            let _ = windows::Win32::System::Com::CoInitializeEx(
                None,
                windows::Win32::System::Com::COINIT_MULTITHREADED,
            );
        }

        let mut was_fullscreen = false;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(600));

            #[cfg(target_os = "windows")]
            {
                unsafe {
                    let mut is_fullscreen = false;
                    let fg_hwnd = winapi::um::winuser::GetForegroundWindow();
                    let shell_hwnd = winapi::um::winuser::GetShellWindow(); // 系统的根：explorer.exe

                    // 过滤掉无焦点窗口、桌面根节点
                    if !fg_hwnd.is_null()
                        && fg_hwnd != winapi::um::winuser::GetDesktopWindow()
                        && fg_hwnd != shell_hwnd
                    {
                        // 获取系统外壳 (explorer.exe) 的进程 ID
                        let mut shell_pid = 0;
                        if !shell_hwnd.is_null() {
                            winapi::um::winuser::GetWindowThreadProcessId(
                                shell_hwnd,
                                &mut shell_pid,
                            );
                        }

                        // 获取当前前景窗口的进程 ID
                        let mut fg_pid = 0;
                        winapi::um::winuser::GetWindowThreadProcessId(fg_hwnd, &mut fg_pid);

                        // 核心判定：如果抢占焦点的窗口 PID 和任务栏/桌面是一家人
                        // 说明这绝对是任务栏悬浮窗、音量面板或透明防误触层，直接忽略！
                        if shell_pid != 0 && fg_pid == shell_pid {
                            // 属于系统外壳组件，当做无事发生
                        } else {
                            // 进一步排除子窗口 (WS_CHILD) 和 鼠标穿透层 (WS_EX_TRANSPARENT)
                            let style = winapi::um::winuser::GetWindowLongPtrW(
                                fg_hwnd,
                                winapi::um::winuser::GWL_STYLE,
                            ) as u32;
                            let ex_style = winapi::um::winuser::GetWindowLongPtrW(
                                fg_hwnd,
                                winapi::um::winuser::GWL_EXSTYLE,
                            ) as u32;

                            if (style & winapi::um::winuser::WS_CHILD) == 0
                                && (ex_style & winapi::um::winuser::WS_EX_TRANSPARENT) == 0
                            {
                                let mut class_name = [0u16; 256];
                                let len = winapi::um::winuser::GetClassNameW(
                                    fg_hwnd,
                                    class_name.as_mut_ptr(),
                                    class_name.len() as i32,
                                );
                                let class_str =
                                    String::from_utf16_lossy(&class_name[..len as usize]);

                                // 保底黑名单（防一手那些不在 explorer.exe 里的新版 UWP 系统层）
                                let is_blacklisted = class_str
                                    .contains("Windows.UI.Core.CoreWindow")
                                    || class_str.contains("Xaml_WindowedPopupClass")
                                    || class_str.contains("SearchApp")
                                    || class_str.contains("NotifyIconOverflowWindow");

                                if !is_blacklisted {
                                    // 几何判定：真正判断它是否铺满了屏幕
                                    let mut rect: winapi::shared::windef::RECT =
                                        std::mem::zeroed();
                                    winapi::um::winuser::GetWindowRect(fg_hwnd, &mut rect);

                                    let monitor = winapi::um::winuser::MonitorFromWindow(
                                        fg_hwnd,
                                        winapi::um::winuser::MONITOR_DEFAULTTONEAREST,
                                    );
                                    let mut mi: winapi::um::winuser::MONITORINFO =
                                        std::mem::zeroed();
                                    mi.cbSize = std::mem::size_of::<
                                        winapi::um::winuser::MONITORINFO,
                                    >(
                                    )
                                        as u32;
                                    winapi::um::winuser::GetMonitorInfoW(monitor, &mut mi);

                                    if rect.left <= mi.rcMonitor.left
                                        && rect.top <= mi.rcMonitor.top
                                        && rect.right >= mi.rcMonitor.right
                                        && rect.bottom >= mi.rcMonitor.bottom
                                    {
                                        is_fullscreen = true;
                                    }
                                }
                            }
                        }
                    }

                    // 状态翻转时发送信号
                    if is_fullscreen != was_fullscreen {
                        let _ = app_handle.emit("fullscreen-changed", is_fullscreen);
                        was_fullscreen = is_fullscreen;
                    }
                }
            }
        }
    });
}
