package main

import (
	"bufio"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"AuctionAssistantWeb/ledger"
)

func watchBarcode(app *ledger.App, root string) {
	script := captureScript(root)
	if script == "" {
		return
	}
	cell := os.Getenv("LEDGER_CELL")
	if cell == "" {
		cell = "2"
	}
	proc := os.Getenv("WOW_PROCESS")
	if proc == "" {
		proc = "WowClassic"
	}
	cmd := exec.Command("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-ProcessName", proc, "-Cell", cell)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	stdout, err := cmd.StdoutPipe()
	if err != nil || cmd.Start() != nil {
		return
	}
	appSet := app
	go func() {
		appSet.SetCapture("waiting")
		scan := bufio.NewScanner(stdout)
		for scan.Scan() {
			var msg struct {
				Info string `json:"info"`
				Text string `json:"text"`
			}
			if json.Unmarshal(scan.Bytes(), &msg) != nil {
				continue
			}
			if strings.Contains(strings.ToLower(msg.Info), "attached") {
				appSet.SetCapture("attached")
			}
			if msg.Text != "" {
				appSet.NoteBarcode(msg.Text)
			}
		}
		appSet.SetCapture("off")
	}()
}

func captureScript(root string) string {
	if path := os.Getenv("LEDGER_CAPTURE"); path != "" {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	for _, rel := range []string{
		filepath.Join("..", "wow-ai", "bridge", "capture.ps1"),
		filepath.Join("..", "bridge", "capture.ps1"),
	} {
		path := filepath.Clean(filepath.Join(root, rel))
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	return ""
}
