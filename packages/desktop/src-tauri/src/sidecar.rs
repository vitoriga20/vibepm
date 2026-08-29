// sidecar 生命周期（spec §2/§4）：spawn node.exe + server/dist/bin.js → health 轮询 → kill；
// 孤儿防护：spawn 前按 PID 文件清理残留，正常退出 kill + 删 PID 文件（spec §3 案 B）。
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::Manager;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const HEALTH_TIMEOUT: Duration = Duration::from_secs(30);
const POLL_INTERVAL: Duration = Duration::from_millis(300);
const LOG_CAP: usize = 32 * 1024;

pub struct Sidecar {
    child: Child,
    pub port: u16,
    pid_file: PathBuf,
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.pid_file);
    }
}

impl Sidecar {
    /// 阻塞 kill（RunEvent::Exit 用）；Drop 兜底
    pub fn shutdown(mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.pid_file);
    }
}

/// 定位 sidecar 目录（含 node.exe + server/dist/bin.js），四级查找：
/// 1) env VIBEPM_SIDECAR_DIR
/// 2) exe 同级及向上回溯 ≤4 层的 sidecar/out（便携包布局 exe+sidecar 同级；dev 产物
///    target/release 直跑 = 上溯 3 层 packages/desktop/sidecar/out；NSIS 安装版 exe 与 sidecar 同根）
/// 3) dev 相对（tauri dev cwd=src-tauri → ../sidecar/out）
/// 4) 发布 resource_dir
pub fn sidecar_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(v) = std::env::var("VIBEPM_SIDECAR_DIR") {
        let p = PathBuf::from(v);
        if p.join("node.exe").exists() {
            return Some(p);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent().map(Path::to_path_buf);
        for _ in 0..5 {
            let Some(d) = dir else { break };
            let p = d.join("sidecar").join("out");
            if p.join("node.exe").exists() {
                return std::path::absolute(&p).ok();
            }
            dir = d.parent().map(Path::to_path_buf);
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        let p = cwd.join("..").join("sidecar").join("out");
        if p.join("node.exe").exists() {
            return std::path::absolute(&p).ok();
        }
    }
    if let Ok(r) = app.path().resource_dir() {
        let p = r.join("sidecar").join("out");
        if p.join("node.exe").exists() {
            return Some(p);
        }
    }
    None
}

fn free_port() -> std::io::Result<u16> {
    let l = TcpListener::bind("127.0.0.1:0")?;
    let port = l.local_addr()?.port();
    drop(l);
    Ok(port)
}

fn app_data(app: &tauri::AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().unwrap_or_else(|_| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 孤儿清理：读 PID 文件，tasklist 确认 image 是 node.exe 才 taskkill（防 PID 复用误杀）
fn cleanup_orphan(pid_file: &Path) {
    eprintln!("[sidecar] cleanup_orphan: reading {:?}", pid_file);
    let Ok(s) = std::fs::read_to_string(pid_file) else { eprintln!("[sidecar] cleanup_orphan: no pid file"); return };
    let pid: u32 = s.trim().parse().unwrap_or(0);
    eprintln!("[sidecar] cleanup_orphan: recorded pid={pid}");
    if pid > 0 && image_name_is_node(pid) {
        eprintln!("[sidecar] cleanup_orphan: killing orphan {pid}");
        let r = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        eprintln!("[sidecar] cleanup_orphan: taskkill -> {:?}", r.map(|o| o.status));
    }
    let _ = std::fs::remove_file(pid_file);
    eprintln!("[sidecar] cleanup_orphan: done");
}

fn image_name_is_node(pid: u32) -> bool {
    let out = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output();
    eprintln!("[sidecar] tasklist pid={pid} -> {:?}", out.as_ref().map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string()));
    out.ok()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .map(|l| l.to_lowercase().contains("node.exe"))
                .unwrap_or(false)
        })
        .unwrap_or(false)
}

fn health_ok(port: u16) -> bool {
    let Ok(mut s) = TcpStream::connect(("127.0.0.1", port)) else { return false };
    let _ = s.set_read_timeout(Some(Duration::from_millis(1500)));
    let req = format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if s.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = String::new();
    s.read_to_string(&mut buf).is_ok() && buf.starts_with("HTTP/1.1 200") && buf.contains("\"ok\":true")
}

fn pump(mut stream: impl Read, sink: Arc<Mutex<String>>) {
    let mut buf = [0u8; 4096];
    loop {
        match stream.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                let mut logs = sink.lock().unwrap();
                logs.push_str(&String::from_utf8_lossy(&buf[..n]));
                let len = logs.len();
                if len > LOG_CAP {
                    *logs = logs.split_off(len - LOG_CAP / 2);
                }
            }
        }
    }
}

/// spawn sidecar 并阻塞等 health 就绪；失败带 stderr 尾巴（spec §2 超时报错窗用）
pub fn spawn_and_wait(app: &tauri::AppHandle) -> Result<Sidecar, String> {
    eprintln!("[sidecar] spawn_and_wait: resolving dir");
    let dir = sidecar_dir(app).ok_or_else(|| {
        "sidecar 目录未找到（需要 packages/desktop/sidecar/out，先跑 build.mjs，或设 VIBEPM_SIDECAR_DIR）".to_string()
    })?;
    eprintln!("[sidecar] spawn_and_wait: dir={}", dir.display());
    let node_exe = dir.join("node.exe");
    let bin_js = dir.join("server").join("dist").join("bin.js");
    if !bin_js.exists() {
        return Err(format!("sidecar 缺少 {}", bin_js.display()));
    }

    let data_dir = app_data(app);
    cleanup_orphan(&data_dir.join("sidecar.pid"));

    let port = free_port().map_err(|e| format!("探测空闲端口失败: {e}"))?;
    eprintln!("[sidecar] spawn_and_wait: port={port}");

    // patch：关浏览器自开（临时注入不落 profile，spec §3 拍板）
    let patch_file = data_dir.join("desktop-patch.json");
    std::fs::write(&patch_file, r#"{"web_ui":{"open_browser":false}}"#)
        .map_err(|e| format!("写 patch 文件失败: {e}"))?;

    let mut child = Command::new(&node_exe)
        .arg(&bin_js)
        .args(["web", "--port", &port.to_string(), "--patch"])
        .arg(&patch_file)
        .current_dir(dir.join("server"))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map_err(|e| format!("spawn sidecar 失败: {e}"))?;
    eprintln!("[sidecar] spawned child pid={}", child.id());

    // PID 记录（孤儿防护）
    let pid_file = data_dir.join("sidecar.pid");
    let _ = std::fs::write(&pid_file, child.id().to_string());

    let logs = Arc::new(Mutex::new(String::new()));
    if let Some(out) = child.stdout.take() {
        let sink = logs.clone();
        std::thread::spawn(move || pump(out, sink));
    }
    if let Some(err) = child.stderr.take() {
        let sink = logs.clone();
        std::thread::spawn(move || pump(err, sink));
    }

    let started = Instant::now();
    loop {
        if let Some(status) = child.try_wait().ok().flatten() {
            return Err(format!(
                "sidecar 提前退出（{status}）\n--- 输出 ---\n{}",
                last_chars(&logs.lock().unwrap(), 2000)
            ));
        }
        if health_ok(port) {
            return Ok(Sidecar { child, port, pid_file });
        }
        if started.elapsed() > HEALTH_TIMEOUT {
            return Err(format!(
                "health 轮询超时（{HEALTH_TIMEOUT:?}），sidecar 无响应\n--- 输出 ---\n{}",
                last_chars(&logs.lock().unwrap(), 2000)
            ));
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

fn last_chars(s: &str, n: usize) -> String {
    s.chars().rev().take(n).collect::<Vec<_>>().into_iter().rev().collect()
}

/// stderr/输出尾巴 → error.html query 安全段
pub fn encode_query(s: &str) -> String {
    let mut o = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => o.push(b as char),
            _ => o.push_str(&format!("%{b:02X}")),
        }
    }
    o
}
