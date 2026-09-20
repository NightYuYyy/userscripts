#Requires AutoHotkey v2.0
#SingleInstance Force

; ===== 配置 =====
REFRESH_MS := 5000                      ; 刷新间隔
SRC := A_ScriptDir "\badge.txt"         ; 数据源：改这个文件的内容，角标就跟着变

GetText() {
    global SRC
    try return Trim(FileRead(SRC, "UTF-8"))
    return "--"
}

; ===== 角标窗口 =====
g := Gui("+AlwaysOnTop -Caption +ToolWindow")
g.BackColor := "202020"
g.MarginX := 10, g.MarginY := 6
g.SetFont("s12 cWhite", "Segoe UI")
lbl := g.AddText("w140 Center", GetText())

OnMessage(0x201, (*) => PostMessage(0xA1, 2, 0, , "ahk_id " g.Hwnd))  ; 左键拖动
g.OnEvent("ContextMenu", (*) => ExitApp())                            ; 右键退出

g.Show("x" A_ScreenWidth - 180 " y" A_ScreenHeight - 100 " NoActivate")
WinSetTransparent(220, g)

SetTimer(() => lbl.Text := GetText(), REFRESH_MS)
