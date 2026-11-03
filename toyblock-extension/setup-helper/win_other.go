//go:build !windows

package main

import "fmt"

// 윈도우가 아닌 곳(시험용): 클립보드·알림 창 대신 화면에 찍습니다
func consoleSetup()                            {}
func setClipboard(text string) error           { fmt.Println("  [clipboard]", text); return nil }
func msgBox(title, text string, flags uintptr) { fmt.Println("  [msgbox]", title, "|", text) }
