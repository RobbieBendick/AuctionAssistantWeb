/// <reference types="vite/client" />

interface WowheadPower {
  refreshLinks: () => void;
}

interface Window {
  LEDGER_API?: string;
  $WowheadPower?: WowheadPower;
}
