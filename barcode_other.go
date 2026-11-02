//go:build !windows

package main

import "AuctionAssistantWeb/ledger"

func watchBarcode(app *ledger.App, root string) {
	_, _ = app, root
}
