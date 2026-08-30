// vibepm 桌面壳（spec §7）：S1 骨架（sidecar 生命周期/单实例/错误窗）+ S2 主窗（无边框/拖拽/关闭隐藏）。
// S3 起胶囊窗、S4 托盘在本文件上叠加。
// M2 S7：岛落地（spec §10）——岛窗 widget / 控制台窗 panel（NSD 复用前端，tauri://localhost 双源），
// 能力模块在 island.rs（NetSpeed Dynamic Pro MIT 代码原样并入）。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio_spectrum;
mod island;
mod music_controller;
mod notification;
mod sidecar;
mod system_events;

use std::sync::Mutex;

// NSD 原码里 AppState 在 crate root（music_controller 以 crate::AppState 引用），此处保持同构
use island::AppState;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_autostart::MacosLauncher;

struct SidecarState(Mutex<Option<sidecar::Sidecar>>);

/// S2 拖拽：注入主窗的顶部 hit-test（不挡 web 交互，非交互元素才接管拖动）。
/// 壳层资产，不碰 web 源文件（spec §1 总原则）。需要 capability: core:window:allow-start-dragging。
const DRAG_REGION_SCRIPT: &str = r#"(function () {
  if (window.__vibepmDragInit) return;
  window.__vibepmDragInit = true;
  var TH = 28;
  var INTERACTIVE = 'a,button,input,select,textarea,label,iframe,[role="button"],.rail,.nav';
  document.addEventListener("mousedown", function (e) {
    if (e.button !== 0 || e.clientY > TH) return;
    if (e.target && e.target.closest && e.target.closest(INTERACTIVE)) return;
    e.preventDefault();
    try { window.__TAURI_INTERNALS__.invoke("plugin:window|start_dragging"); } catch (_) {}
  }, true);
  document.addEventListener("dblclick", function (e) {
    if (e.clientY > TH) return;
    if (e.target && e.target.closest && e.target.closest(INTERACTIVE)) return;
    try { window.__TAURI_INTERNALS__.invoke("plugin:window|toggle_maximize"); } catch (_) {}
  }, true);
})();"#;

fn main() {
    let app = tauri::Builder::default()
        // 单实例必须最先注册：二次启动 → 唤出已有主窗（spec §2；S2 关闭=隐藏后这也是再唤出路径）
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        // S2：关闭=隐藏到托盘（S4 托盘落地前由单实例二次启动唤出兜底）
        // M2 S8：主窗失焦收纳（spec §10.3）——失焦后前台窗非岛/胶囊（点岛不算外部）→ 收起主窗回岛
        .on_window_event(|win, event| {
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if win.label() == "main" || win.label() == "capsule" {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                }
                tauri::WindowEvent::Focused(false) => {
                    if win.label() == "main" {
                        let app = win.app_handle().clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(350));
                            // 点岛（或胶囊）不算外部：前台窗句柄等于岛/胶囊句柄则不收纳
                            #[cfg(target_os = "windows")]
                            {
                                let fg = unsafe { winapi::um::winuser::GetForegroundWindow() } as isize;
                                let keep = ["widget", "capsule"].iter().any(|lbl| {
                                    app.get_webview_window(lbl)
                                        .and_then(|w| w.hwnd().ok())
                                        .map(|h| h.0 as isize == fg)
                                        .unwrap_or(false)
                                });
                                if !keep {
                                    if let Some(m) = app.get_webview_window("main") {
                                        let _ = m.hide();
                                    }
                                }
                            }
                        });
                    }
                }
                _ => {}
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| {
            let handle = app.handle().clone();
            // M2 S7：岛能力状态（网速统计）+ 系统级监听（NSD 原样：频谱/系统事件/剪贴板/全屏检测）
            let networks = sysinfo::Networks::new_with_refreshed_list();
            app.manage(AppState {
                networks: Mutex::new(networks),
                ws_task: tokio::sync::Mutex::new(None),
                tray_items: Mutex::new(None),
            });
            audio_spectrum::start_monitor();
            system_events::start_monitor(handle.clone());
            #[cfg(target_os = "windows")]
            island::start_clipboard_monitor(handle.clone());
            island::start_fullscreen_monitor(handle.clone());
            // M2 S8：岛窗(widget) 由 tauri.conf 静态定义（NSD 原样做法；setup 内运行时建 hidden 窗
            // 会阻塞——实测踩坑）。控制台窗(panel)已退役：功能集成进主窗 plugin-island-settings。
            if let Some(w) = app.get_webview_window("widget") {
                eprintln!("[shell] island window: topmost={:?} visible={:?}", w.is_always_on_top(), w.is_visible());
            } else {
                eprintln!("[shell] island window missing!");
            }
            // S4 托盘：三项菜单；退出 = kill sidecar → 退 app（spec §4 唯一退出入口）
            let show_main = tauri::menu::MenuItem::with_id(app, "show_main", "显示主窗", true, None::<&str>)?;
            let toggle_cap = tauri::menu::MenuItem::with_id(app, "toggle_capsule", "显示·隐藏胶囊", true, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show_main, &toggle_cap, &quit])?;
            let icon = app
                .default_window_icon()
                .cloned()
                .expect("default window icon missing (check bundle.icon)");
            tauri::tray::TrayIconBuilder::with_id("vibepm-tray")
                .icon(icon)
                .tooltip("vibepm")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show_main" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.unminimize();
                            let _ = w.set_focus();
                        }
                    }
                    "toggle_capsule" => {
                        if let Some(c) = app.get_webview_window("capsule") {
                            if c.is_visible().unwrap_or(false) { let _ = c.hide(); } else { let _ = c.show(); }
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            match sidecar::spawn_and_wait(&handle) {
                Ok(sc) => {
                    let port = sc.port;
                    app.manage(SidecarState(Mutex::new(Some(sc))));
                    let url = tauri::Url::parse(&format!("http://127.0.0.1:{port}/"))
                        .expect("parse main url");
                    let win = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url))
                        .title("vibepm")
                        .inner_size(1200.0, 800.0)
                        .min_inner_size(900.0, 600.0)
                        .center()
                        .decorations(false)
                        .shadow(true)
                        .initialization_script(DRAG_REGION_SCRIPT)
                        .build()?;
                    eprintln!("[shell] main window created: visible={:?} decorated={:?}", win.is_visible(), win.is_decorated());
                    // S3 胶囊窗：alwaysOnTop + 无边框 + 关闭=隐藏（spec §4）；URL=sidecar 同源 → 共享 localStorage（clockSync 白捡）
                    let cap_url = tauri::Url::parse(&format!(
                        "http://127.0.0.1:{port}/plugins/plugin-todo-timer/preview/capsule.html"
                    ))
                    .expect("parse capsule url");
                    let cap = WebviewWindowBuilder::new(&handle, "capsule", WebviewUrl::External(cap_url))
                        .title("vibepm capsule")
                        .inner_size(640.0, 340.0)
                        .decorations(false)
                        .always_on_top(true)
                        .skip_taskbar(true)
                        .shadow(true)
                        .build()?;
                    eprintln!("[shell] capsule window created: visible={:?} topmost={:?}", cap.is_visible(), cap.is_always_on_top());
                }
                Err(msg) => {
                    // 超时/早退 → 报错窗（带输出尾巴，spec §2）
                    let payload = sidecar::encode_query(&msg);
                    WebviewWindowBuilder::new(&handle, "error", WebviewUrl::App("error.html".into()))
                        .title("vibepm 启动失败")
                        .inner_size(640.0, 420.0)
                        .initialization_script(&format!(
                            "window.__SIDECAR_ERROR__ = decodeURIComponent('{payload}');"
                        ))
                        .build()?;
                }
            }
            Ok(())
        })
        // M2 S7：岛命令面（NSD 原样并入，spec §10.2）
        .invoke_handler(tauri::generate_handler![
            island::get_network_stats,
            island::is_widget_visible,
            island::show_main_window,
            island::get_network_latency,
            island::set_window_bounds,
            island::start_island_animation,
            island::show_window_no_activate,
            island::sync_tray_menu,
            island::get_clipboard_text,
            notification::fetch_latest_notification,
            audio_spectrum::get_audio_spectrum,
            music_controller::set_target_player,
            music_controller::fetch_netease_music_info,
            music_controller::control_system_media,
            music_controller::get_random_cover_url,
            music_controller::get_smtc_cover,
            music_controller::fetch_netease_lyrics,
            music_controller::fetch_song_meta,
            music_controller::start_websocket_lyrics,
            music_controller::stop_websocket_lyrics,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        match &event {
            RunEvent::WindowEvent { label, event: we, .. } => {
                if matches!(we, tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed) {
                    eprintln!("[shell] window {label} event: {we:?}");
                }
            }
            RunEvent::ExitRequested { code, .. } => {
                eprintln!("[shell] ExitRequested code={code:?}");
            }
            RunEvent::Exit => {
                eprintln!("[shell] Exit -> killing sidecar");
                if let Some(state) = app_handle.try_state::<SidecarState>() {
                    if let Some(sc) = state.0.lock().unwrap().take() {
                        sc.shutdown();
                    }
                }
            }
            _ => {}
        }
    });
}
