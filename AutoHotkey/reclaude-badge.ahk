#Requires AutoHotkey v2.0
#SingleInstance Force

; ReClaude 额度悬浮角标 —— 桌面常驻卡片:拼车 5h 剩余额度 + 进度条 + 每秒跳动的刷新倒计时 + 号状态
; 认证:API Key(ReClaude 设置页生成),存在同目录 reclaude-badge.ini,不进 git
; 操作:左键拖动 / 右键退出。用量越高卡片越偏黄/红,号异常或请求失败变红。

INI      := A_ScriptDir "\reclaude-badge.ini"
API      := "https://www.reclaude.ai/api/v1/carpool/quota"
FETCH_MS := 60000            ; 拉数据间隔(毫秒)
TICK_MS  := 1000             ; 倒计时跳秒间隔(毫秒)

; 配色
C_BG := "1B1C22", C_TITLE := "8A8A93", C_MUTE := "6B6B73", C_TEXT := "E4E4E7"
C_GREEN := "3ECF8E", C_AMBER := "FBBF24", C_RED := "F87171"

; ---- 读 key,没有就问一次并存起来 ----
key := IniRead(INI, "auth", "api_key", "")
if (key = "") {
    ib := InputBox("粘贴你的 ReClaude API Key(rck_ 开头)", "ReClaude 角标 · 首次设置", "w400 h130")
    if (ib.Result != "OK" || Trim(ib.Value) = "") {
        MsgBox("没有 API Key,退出。")
        ExitApp()
    }
    key := Trim(ib.Value)
    IniWrite(key, INI, "auth", "api_key")
}

; ---- 卡片 ----
W := 190, H := 104
g := Gui("+AlwaysOnTop -Caption +ToolWindow")
g.BackColor := C_BG
g.OnEvent("ContextMenu", (*) => ExitApp())
OnMessage(0x201, DragMove)        ; 左键拖动(静态文本默认点击穿透到窗口)

g.SetFont("s8 bold c" C_TITLE, "Segoe UI")
cTitle := g.AddText("x14 y12 w90", "RECLAUDE")
g.SetFont("s8 c" C_MUTE, "Segoe UI")
cState := g.AddText("x100 y12 w76 Right", "")

g.SetFont("s19 bold c" C_GREEN, "Segoe UI")
cNum := g.AddText("x14 y26 w80", "$--")
g.SetFont("s9 c" C_MUTE, "Segoe UI")
cCap := g.AddText("x92 y40 w56", "/ $--")
cPct := g.AddText("x100 y28 w76 Right", "")

cBar := g.AddProgress("x14 y60 w162 h6 +0x01 Background2A2A31 c" C_GREEN, 0)

g.SetFont("s10 bold c" C_TEXT, "Segoe UI")
cCd := g.AddText("x14 y74 w162", "刷新 --")

g.Show("x" (A_ScreenWidth - W - 16) " y" (A_ScreenHeight - H - 56) " w" W " h" H " NoActivate")
WinGetPos(, , &ww, &wh, g.Hwnd)                       ; 物理像素(DPI 安全)
WinSetRegion("0-0 w" ww " h" wh " R20-20", g.Hwnd)    ; 圆角

; ---- 状态缓存(倒计时靠它每秒重算,不用每秒请求)----
gResets := 0, gHas := false

Fetch()
SetTimer(Fetch, FETCH_MS)
SetTimer(Tick, TICK_MS)

; 拉数据 → 更新静态部分 + 颜色
Fetch() {
    global
    try {
        req := ComObject("WinHttp.WinHttpRequest.5.1")
        req.Open("GET", API, false)
        req.SetRequestHeader("Authorization", "Bearer " key)
        req.Send()
        if (req.Status = 401) {
            Bad("Key 无效")
            return
        }
        if (req.Status != 200) {
            Bad("HTTP " req.Status)
            return
        }
        body := req.ResponseText
        quota := Num(body, "quota_usd"), used := Num(body, "used_usd")
        gResets := Num(body, "resets_at_ms"), gHas := true
        RegExMatch(body, '"state":"(\w+)"', &m), state := m ? m[1] : "?"

        remain := quota - used
        pct := quota > 0 ? Round(used / quota * 100) : 0
        ok := (state = "active")
        accent := (!ok || pct >= 90) ? C_RED : (pct >= 70) ? C_AMBER : C_GREEN

        cNum.Value := Format("${:.0f}", remain)
        cNum.SetFont("c" accent)
        cCap.Value := Format("/ ${:.0f}", quota)
        cPct.Value := "已用 " pct "%"
        cBar.Value := pct
        cBar.Opt("c" accent)
        cState.Value := ok ? "" : state
        cState.SetFont("c" (ok ? C_MUTE : C_RED))
        Tick()
    } catch {
        Bad("离线")
    }
}

; 每秒:只重算倒计时
Tick() {
    global gResets, gHas, cCd
    if (!gHas)
        return
    cCd.Value := "刷新 " Countdown(gResets)
}

Bad(msg) {
    global gHas, cNum, cCap, cPct, cState, cCd, cBar, C_RED
    gHas := false
    cNum.Value := "—", cNum.SetFont("c" C_RED)
    cCap.Value := "", cPct.Value := ""
    cState.Value := msg, cState.SetFont("c" C_RED)
    cCd.Value := "刷新 --"
    cBar.Value := 0, cBar.Opt("c" C_RED)
}

; 从 JSON 抠字段(数字或带引号数字),避开引入 JSON 库
Num(json, keyname) {
    if RegExMatch(json, '"' keyname '":"?([0-9.]+)"?', &m)
        return m[1] + 0
    return 0
}

; 毫秒时间戳 → 每秒跳动的 "2h 42m 46s"
Countdown(ms) {
    if (ms <= 0)
        return "--"
    nowMs := DateDiff(A_NowUTC, "19700101000000", "Seconds") * 1000
    s := Integer((ms - nowMs) / 1000)
    if (s <= 0)
        return "即将刷新"
    h := s // 3600, s -= h * 3600
    mn := s // 60, s -= mn * 60
    return h > 0 ? Format("{}h {:02d}m {:02d}s", h, mn, s) : Format("{}m {:02d}s", mn, s)
}

DragMove(*) {
    global g
    PostMessage(0xA1, 2, 0, , "ahk_id " g.Hwnd)
}
