//go:build windows

package main

import (
	"errors"
	"syscall"
	"unsafe"
)

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	user32           = syscall.NewLazyDLL("user32.dll")
	setConsoleOutCP  = kernel32.NewProc("SetConsoleOutputCP")
	setConsoleTitleW = kernel32.NewProc("SetConsoleTitleW")
	globalAlloc      = kernel32.NewProc("GlobalAlloc")
	globalLock       = kernel32.NewProc("GlobalLock")
	globalUnlock     = kernel32.NewProc("GlobalUnlock")
	openClipboard    = user32.NewProc("OpenClipboard")
	emptyClipboard   = user32.NewProc("EmptyClipboard")
	setClipboardData = user32.NewProc("SetClipboardData")
	closeClipboard   = user32.NewProc("CloseClipboard")
	messageBoxW      = user32.NewProc("MessageBoxW")
)

func consoleSetup() {
	setConsoleOutCP.Call(65001)
	if t, err := syscall.UTF16PtrFromString("토이블록 설치 도우미"); err == nil {
		setConsoleTitleW.Call(uintptr(unsafe.Pointer(t)))
	}
}

func setClipboard(text string) error {
	u, err := syscall.UTF16FromString(text)
	if err != nil {
		return err
	}
	if r, _, _ := openClipboard.Call(0); r == 0 {
		return errors.New("clipboard")
	}
	defer closeClipboard.Call()
	emptyClipboard.Call()
	h, _, _ := globalAlloc.Call(0x0002, uintptr(len(u)*2)) // GMEM_MOVEABLE
	if h == 0 {
		return errors.New("alloc")
	}
	p, _, _ := globalLock.Call(h)
	if p == 0 {
		return errors.New("lock")
	}
	copy(unsafe.Slice((*uint16)(unsafe.Pointer(p)), len(u)), u)
	globalUnlock.Call(h)
	if r, _, _ := setClipboardData.Call(13, h); r == 0 { // CF_UNICODETEXT
		return errors.New("set")
	}
	return nil
}

func msgBox(title, text string, flags uintptr) {
	t, _ := syscall.UTF16PtrFromString(title)
	b, _ := syscall.UTF16PtrFromString(text)
	messageBoxW.Call(0, uintptr(unsafe.Pointer(b)), uintptr(unsafe.Pointer(t)), flags|0x00010000) // MB_SETFOREGROUND
}
