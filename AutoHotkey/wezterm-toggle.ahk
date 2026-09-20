#Requires AutoHotkey v2
#SingleInstance Force
DetectHiddenWindows true
SetTitleMatchMode 2

^Space::ToggleWezTerm()

ExecPath   := "C:\Program Files\WezTerm\wezterm-gui.exe"
; LogFile    := A_Desktop "\wezterm_toggle.txt"  ; ===== 注释日志文件 =====
LastHwnd   := 0
JustLaunch := false

ToggleWezTerm() {
    global ExecPath, LastHwnd, JustLaunch

    if LastHwnd && WinExist("ahk_id " LastHwnd) {
        title := WinGetTitle("ahk_id " LastHwnd)
        if IsRealTerminalWindow(title) {
            hwnd := LastHwnd
            ; Log("LastHwnd is still valid, using it")
        } else {
            LastHwnd := 0
            hwnd := GetWezMainHwnd()
            ; Log("LastHwnd title changed, resetting")
        }
    } else {
        ; Log("LastHwnd not valid, searching...")
        hwnd := GetWezMainHwnd()
    }

    if !hwnd {
        ; Log("No hwnd found, launching WezTerm...")
        Run ExecPath
        Sleep 600
        hwnd := GetWezMainHwnd()
        ; Log("After launch, GetWezMainHwnd returned: " hwnd)
        if hwnd {
            JustLaunch := true
            ; Log("Marked JustLaunch = true")
        }
    }

    if hwnd {
        LastHwnd := hwnd
        ; Log("Saved LastHwnd: " hwnd)

        if JustLaunch {
            ; Log("Just launched, showing and activating (not minimizing)")
            WinShow("ahk_id " hwnd)
            Sleep 100
            WinActivate("ahk_id " hwnd)
            JustLaunch := false
            return
        }

        isActive := WinActive("ahk_id " hwnd)
        ; Log("WinActive check: " isActive)

        if isActive {
            ; Log("Window is active, minimizing hwnd " hwnd)
            WinMinimize("ahk_id " hwnd)
            ; Log("Minimized")
        } else {
            ; Log("Window is not active, showing and activating hwnd " hwnd)
            WinShow("ahk_id " hwnd)
            Sleep 100
            WinActivate("ahk_id " hwnd)
            ; Log("Shown and activated")
        }
    }
}

GetWezMainHwnd() {
    hwnd := WinActive("ahk_exe wezterm-gui.exe")
    if hwnd {
        title := WinGetTitle("ahk_id " hwnd)
        ; Log("WinActive found hwnd: " hwnd ", title: " title)
        if IsRealTerminalWindow(title) {
            ; Log("Active window is real terminal, returning " hwnd)
            return hwnd
        }
    }

    hwnd := WinExist("ahk_exe wezterm-gui.exe")
    if hwnd {
        title := WinGetTitle("ahk_id " hwnd)
        ; Log("WinExist found hwnd: " hwnd ", title: " title)
        if IsRealTerminalWindow(title) {
            ; Log("Found real terminal window, returning " hwnd)
            return hwnd
        } else {
            ; Log("Found window is not real terminal, returning 0")
        }
    }

    ; Log("No real terminal window found, returning 0")
    return 0
}

IsRealTerminalWindow(title) {
    if InStr(title, "invisible") || InStr(title, "__wgl") || InStr(title, "NVOGLDC")
        return false
    if InStr(title, "probing")
        return false
    if InStr(title, "~") || InStr(title, "[")
        return true
    return false
}

; ===== 日志函数（注释掉，需要调试时反注释） =====
; Log(msg) {
;     global LogFile
;     timestamp := FormatTime(A_Now, "yyyy-MM-dd HH:mm:ss.fff")
;     line := "[" timestamp "] " msg "`n"
;     FileAppend(line, LogFile)
; }
