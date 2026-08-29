// vibepm 桌面壳（spec §7）：S1 骨架（sidecar 生命周期/单实例/错误窗）+ S2 主窗（无边框/拖拽/关闭隐藏）。
// S3 起胶囊窗、S4 托盘在本文件上叠加。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use std::sync::Mutex;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

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
        .on_window_event(|win, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if win.label() == "main" || win.label() == "capsule" {
                    api.prevent_close();
                    let _ = win.hide();
                }
            }
        })
        .setup(|app| {
            let handle = app.handle().clone();
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
