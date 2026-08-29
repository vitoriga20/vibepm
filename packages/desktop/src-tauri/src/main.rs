// vibepm 桌面壳 S1（spec §7）：壳骨架 = single-instance + sidecar 生命周期 + 主窗创建 + 退出 kill。
// S2 起：无边框/托盘/胶囊窗在本文件上叠加。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;

use std::sync::Mutex;

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct SidecarState(Mutex<Option<sidecar::Sidecar>>);

fn main() {
    let app = tauri::Builder::default()
        // 单实例必须最先注册：二次启动 → 唤出已有主窗（spec §2）
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
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
                        .build()?;
                    eprintln!("[shell] main window created: {:?}", win.is_visible());
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
