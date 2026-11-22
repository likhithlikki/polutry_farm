// Public config (safe for GitHub). The access KEY is NOT stored here:
// it is typed once in the page and kept in this browser's localStorage.
window.CONFIG = {
  APPS_SCRIPT_URL: "",      // https://script.google.com/macros/s/XXXX/exec
  MOCK: false,              // production default; use ?mock=1 for explicit local demo only
  POLL_MS: 15000,           // status refresh (each Google call takes ~3 s)
  CMD_POLL_MS: 5000,        // named command progress polling
  GPIO_PENDING_POLL_MS: 2500, // GPIO read-back while a pin command is pending
  CMD_TIMEOUT_S: 180
};
