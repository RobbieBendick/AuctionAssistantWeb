package ledger

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type App struct {
	mu        sync.Mutex
	DataPath  string
	PublicDir string
	Remote    string
	Token     string
	savedAt   string
	capture   string
	lastPush  string
}

type fileDoc struct {
	Events  []Event `json:"events"`
	Summary Summary `json:"summary"`
}

func (a *App) readStore() []Event {
	body, err := os.ReadFile(a.DataPath)
	if err != nil {
		return []Event{}
	}
	var list []Event
	if json.Unmarshal(body, &list) == nil && list != nil {
		return list
	}
	var doc fileDoc
	if json.Unmarshal(body, &doc) == nil && doc.Events != nil {
		return doc.Events
	}
	return []Event{}
}

func (a *App) writeStore(events []Event) error {
	if events == nil {
		events = []Event{}
	}
	if err := os.MkdirAll(filepath.Dir(a.DataPath), 0o755); err != nil {
		return err
	}
	body, err := json.MarshalIndent(fileDoc{Events: events, Summary: Summarize(events)}, "", "  ")
	if err != nil {
		return err
	}
	tmp := a.DataPath + ".tmp"
	if err := os.WriteFile(tmp, body, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, a.DataPath)
}

func (a *App) pushRemote(events []Event) {
	if a.Remote == "" || len(events) == 0 {
		return
	}
	ids := make([]string, len(events))
	for i, event := range events {
		ids[i] = event.ID
	}
	stamp := strings.Join(ids, ",")
	a.mu.Lock()
	if stamp == a.lastPush {
		a.mu.Unlock()
		return
	}
	a.mu.Unlock()
	payload, _ := json.Marshal(map[string]any{"events": events})
	req, err := http.NewRequest(http.MethodPost, strings.TrimRight(a.Remote, "/")+"/api/ledger", bytes.NewReader(payload))
	if err != nil {
		return
	}
	req.Header.Set("content-type", "application/json")
	if a.Token != "" {
		req.Header.Set("authorization", "Bearer "+a.Token)
	}
	res, err := iconClient.Do(req)
	if err != nil {
		return
	}
	defer res.Body.Close()
	io.Copy(io.Discard, res.Body)
	if res.StatusCode >= 200 && res.StatusCode < 300 {
		a.mu.Lock()
		a.lastPush = stamp
		a.mu.Unlock()
	}
}

func (a *App) ImportSaved(files []string) []Event {
	var incoming []Event
	var newest time.Time
	for _, file := range files {
		info, err := os.Stat(file)
		if err != nil {
			continue
		}
		if info.ModTime().After(newest) {
			newest = info.ModTime()
		}
		body, err := os.ReadFile(file)
		if err != nil {
			continue
		}
		incoming = append(incoming, ParseWire(string(body))...)
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	if !newest.IsZero() {
		a.savedAt = newest.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	before := a.readStore()
	events := MergeEvents(before, incoming)
	if len(events) != len(before) {
		_ = a.writeStore(events)
		go a.pushRemote(events)
	}
	return events
}

func (a *App) NoteBarcode(text string) {
	event, ok := ParseLine(text)
	if !ok {
		return
	}
	a.mu.Lock()
	before := a.readStore()
	events := MergeEvents(before, []Event{event})
	if len(events) == len(before) {
		a.mu.Unlock()
		return
	}
	_ = a.writeStore(events)
	a.savedAt = time.Now().UTC().Format("2006-01-02T15:04:05.000Z")
	a.mu.Unlock()
	a.pushRemote(events)
}

func (a *App) SetCapture(state string) {
	a.mu.Lock()
	a.capture = state
	a.mu.Unlock()
}

func (a *App) localPayload(watching int) []byte {
	a.mu.Lock()
	defer a.mu.Unlock()
	events := a.readStore()
	var saved *string
	if a.savedAt != "" {
		saved = &a.savedAt
	}
	capture := a.capture
	if capture == "" {
		capture = "off"
	}
	body, _ := json.Marshal(struct {
		Events   []Event `json:"events"`
		Summary  Summary `json:"summary"`
		SavedAt  *string `json:"savedAt"`
		Watching int     `json:"watching"`
		Capture  string  `json:"capture"`
	}{events, Summarize(events), saved, watching, capture})
	return body
}

func (a *App) LocalHandler(findFiles func() []string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/ledger", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			writeJSON(w, http.StatusOK, a.localPayload(len(findFiles())))
			return
		}
		if r.Method == http.MethodPost {
			var body struct {
				Events []Event `json:"events"`
			}
			_ = json.NewDecoder(r.Body).Decode(&body)
			a.mu.Lock()
			events := MergeEvents(a.readStore(), body.Events)
			_ = a.writeStore(events)
			a.mu.Unlock()
			writeJSON(w, http.StatusOK, a.localPayload(len(findFiles())))
			return
		}
		http.Error(w, "Not found", http.StatusNotFound)
	})
	mux.HandleFunc("/icon/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/icon/")
		file, err := LoadIcon(filepath.Join(filepath.Dir(a.DataPath), "icons"), id)
		if err != nil {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		http.ServeFile(w, r, file)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		file := publicFile(a.PublicDir, r.URL.Path)
		if file == "" && !strings.Contains(filepath.Base(r.URL.Path), ".") {
			file = publicFile(a.PublicDir, "/")
		}
		if file == "" {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		w.Header().Set("cache-control", "no-store")
		http.ServeFile(w, r, file)
	})
	return mux
}

func publicFile(root, urlPath string) string {
	rel := strings.TrimPrefix(urlPath, "/")
	if rel == "" {
		rel = "index.html"
	}
	if strings.Contains(rel, "..") {
		return ""
	}
	file := filepath.Join(root, filepath.FromSlash(rel))
	cleanRoot := filepath.Clean(root)
	cleanFile := filepath.Clean(file)
	if cleanFile != cleanRoot && !strings.HasPrefix(cleanFile, cleanRoot+string(os.PathSeparator)) {
		return ""
	}
	info, err := os.Stat(cleanFile)
	if err != nil || info.IsDir() {
		return ""
	}
	return cleanFile
}

func writeJSON(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("content-type", "application/json; charset=utf-8")
	w.Header().Set("cache-control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
