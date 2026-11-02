package ledger

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

var itemID = regexp.MustCompile(`^[1-9]\d*$`)
var iconName = regexp.MustCompile(`^[a-z0-9_]+$`)

func IconFromTooltip(body string) string {
	var data struct {
		Icon string `json:"icon"`
	}
	if json.Unmarshal([]byte(body), &data) != nil {
		return ""
	}
	icon := strings.ToLower(data.Icon)
	if !iconName.MatchString(icon) {
		return ""
	}
	return icon
}

var (
	iconClient = &http.Client{}
	iconMu     sync.Mutex
	iconWait   = map[string]*sync.Mutex{}
)

func LoadIcon(dir, id string) (string, error) {
	if !itemID.MatchString(id) {
		return "", os.ErrInvalid
	}
	file := filepath.Join(dir, id+".jpg")
	if info, err := os.Stat(file); err == nil && info.Size() > 32 {
		return file, nil
	}
	iconMu.Lock()
	gate, ok := iconWait[id]
	if !ok {
		gate = &sync.Mutex{}
		iconWait[id] = gate
		gate.Lock()
		iconMu.Unlock()
		defer func() {
			iconMu.Lock()
			delete(iconWait, id)
			iconMu.Unlock()
			gate.Unlock()
		}()
	} else {
		iconMu.Unlock()
		gate.Lock()
		gate.Unlock()
		if info, err := os.Stat(file); err == nil && info.Size() > 32 {
			return file, nil
		}
		return "", os.ErrNotExist
	}
	tip, err := fetchBytes("https://nether.wowhead.com/tooltip/item/" + id)
	if err != nil {
		return "", err
	}
	icon := IconFromTooltip(string(tip))
	if icon == "" {
		return "", os.ErrNotExist
	}
	jpg, err := fetchBytes("https://wow.zamimg.com/images/wow/icons/large/" + icon + ".jpg")
	if err != nil || len(jpg) < 32 || jpg[0] != 0xFF || jpg[1] != 0xD8 {
		return "", os.ErrNotExist
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	if err := os.WriteFile(file, jpg, 0o644); err != nil {
		return "", err
	}
	return file, nil
}

func fetchBytes(url string) ([]byte, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("user-agent", "AuctionAssistant")
	res, err := iconClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return nil, os.ErrNotExist
	}
	return io.ReadAll(res.Body)
}
