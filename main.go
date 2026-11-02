package main

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"AuctionAssistantWeb/ledger"
)

func main() {
	root, _ := os.Getwd()
	port := os.Getenv("PORT")
	if port == "" {
		port = "4317"
	}
	app := &ledger.App{
		DataPath:  envOr("LEDGER_DATA", filepath.Join(root, "data", "ledger.json")),
		PublicDir: filepath.Join(root, "public"),
		Remote:    os.Getenv("LEDGER_REMOTE"),
		Token:     os.Getenv("LEDGER_TOKEN"),
	}
	if len(os.Args) > 1 && os.Args[1] == "-api" {
		fmt.Println("auction ledger api  http://0.0.0.0:" + port)
		if err := http.ListenAndServe(":"+port, app.APIHandler()); err != nil {
			fmt.Println(err)
			os.Exit(1)
		}
		return
	}
	files := func() []string {
		return findSaved(os.Getenv("WOW_SAVED"), envOr("WOW_ROOT", `C:\Program Files (x86)\World of Warcraft`))
	}
	app.ImportSaved(files())
	go func() {
		for {
			time.Sleep(2 * time.Second)
			app.ImportSaved(files())
		}
	}()
	watchBarcode(app, root)
	fmt.Println("auction ledger  http://127.0.0.1:" + port)
	found := files()
	if len(found) == 0 {
		fmt.Println("no AuctionAssistant.lua saved data yet")
	} else {
		fmt.Println("watching  " + strings.Join(found, ", "))
	}
	if err := http.ListenAndServe("127.0.0.1:"+port, app.LocalHandler(files)); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func findSaved(explicit, wow string) []string {
	if explicit != "" {
		return []string{explicit}
	}
	var found []string
	for _, flavor := range []string{"_anniversary_", "_classic_beta_", "_classic_", "_classic_era_"} {
		accounts := filepath.Join(wow, flavor, "WTF", "Account")
		names, err := os.ReadDir(accounts)
		if err != nil {
			continue
		}
		for _, name := range names {
			file := filepath.Join(accounts, name.Name(), "SavedVariables", "AuctionAssistant.lua")
			if info, err := os.Stat(file); err == nil && !info.IsDir() {
				found = append(found, file)
			}
		}
	}
	return found
}
