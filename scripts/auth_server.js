const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const http = require("http");
const https = require("https");
const { URL } = require("url");
const { execSync } = require("child_process");

const accountManager = require("../src/account_manager");

const PORT = 8088;
let activeOAuthSessions = {};

function getAccountsData() {
    const raw = accountManager.loadAccounts();
    const accounts = [];
    let foundActive = false;
    let targetActiveId = raw.__activeId || (raw.active_account ? raw.active_account.id : null);

    for (const key in raw) {
        if (key.startsWith("__") || key === "active_account") continue;
        const acc = raw[key];
        acc.id = acc.id || key;
        const isActive = (String(acc.id) === String(targetActiveId) || acc.email.toLowerCase() === String(targetActiveId || "").toLowerCase());
        if (isActive) foundActive = true;
        accounts.push({
            id: acc.id,
            email: acc.email,
            name: acc.name || acc.email,
            isActive: isActive
        });
    }

    if (!foundActive && accounts.length > 0) {
        accounts[0].isActive = true;
        raw.__activeId = accounts[0].id;
        accountManager.saveAccounts(raw);
        targetActiveId = accounts[0].id;
    }

    return { activeId: targetActiveId, accounts, raw };
}

async function processOAuthCode(code, port) {
    const redirectUri = `http://127.0.0.1:${port}/oauth-callback`;
    const tokenData = await accountManager.exchangeCode(code, redirectUri);
    const userInfo = await accountManager.getUserInfo(tokenData.access_token);
    const raw = accountManager.loadAccounts();

    let targetId = null;
    for (const key in raw) {
        if (key.startsWith("__") || key === "active_account") continue;
        const acc = raw[key];
        if (acc.email && acc.email.toLowerCase() === userInfo.email.toLowerCase()) {
            targetId = acc.id || key;
            break;
        }
    }

    if (!targetId) {
        targetId = String(accountManager.getNextNumericId(raw));
    }

    const updatedAccount = {
        id: targetId,
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        token: {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expiry_timestamp: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
            id_token: tokenData.id_token || ""
        }
    };

    raw[targetId] = updatedAccount;
    accountManager.saveAccounts(raw);
    await activateAccountById(targetId);
    return updatedAccount;
}

async function activateAccountById(targetId) {
    const raw = accountManager.loadAccounts();
    let found = null;
    for (const key in raw) {
        if (key.startsWith("__") || key === "active_account") continue;
        const acc = raw[key];
        acc.id = acc.id || key;
        if (String(acc.id) === String(targetId) || acc.email.toLowerCase() === String(targetId).toLowerCase()) {
            found = acc;
            break;
        }
    }
    if (!found) {
        for (const key in raw) {
            if (key.startsWith("__") || key === "active_account") continue;
            found = raw[key];
            found.id = found.id || key;
            break;
        }
    }
    if (!found) {
        throw new Error("Нет доступных аккаунтов.");
    }

    try {
        await accountManager.ensureFreshToken(found);
    } catch (e) {
        console.warn(`Warning refreshing token: ${e.message}`);
        if (e.message && (e.message.includes("invalid_grant") || e.message.includes("revoked") || e.message.includes("expired"))) {
            throw new Error(`Токен аккаунта ${found.email} истек или отозван Google. Пожалуйста, авторизуйтесь заново.`);
        }
    }

    accountManager.syncAntigravityGlobalFiles(found);

    try {
        await accountManager.writeToCredentialStore(found.token);
        console.log("[auth_server] Successfully wrote active token to CredentialStore!");
    } catch (e) {
        console.warn(`Warning writing credential store: ${e.message}`);
    }

    try {
        await accountManager.injectTokenIntoIde(found, "agent");
        console.log("[auth_server] Successfully injected token into IDE SQLite!");
    } catch (e) {
        console.warn(`Warning SQLite injection: ${e.message}`);
    }

    raw.__activeId = found.id;
    accountManager.saveAccounts(raw);

    try {
        console.log("[auth_server] Stopping old language_server instance...");
        try { execSync("systemctl --user stop antigravity-server.service", { stdio: "ignore" }); } catch(_) {}
        try { execSync("pkill -9 -f language_server", { stdio: "ignore" }); } catch(_) {}
        await new Promise(r => setTimeout(r, 1000));
        execSync("systemctl --user start antigravity-server.service", { stdio: "inherit" });
        console.log("[auth_server] Cleanly started antigravity-server.service!");
    } catch (e) {
        console.error(`Error restarting service: ${e.message}`);
    }

    return found;
}

function checkServerReady() {
    return new Promise((resolve) => {
        const req = https.get("https://127.0.0.1:9000/", { rejectUnauthorized: false, timeout: 1500 }, (res) => {
            resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
            req.destroy();
            resolve(false);
        });
    });
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", chunk => { body += chunk.toString(); });
        req.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error("Invalid JSON body"));
            }
        });
        req.on("error", reject);
    });
}

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        });
        res.end();
        return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
        if (pathname === "/api/accounts" && req.method === "GET") {
            const { accounts, activeId } = getAccountsData();
            sendJson(res, 200, { success: true, activeId, accounts });
        }
        else if (pathname === "/api/ping" && req.method === "GET") {
            const isReady = await checkServerReady();
            sendJson(res, 200, { success: true, ready: isReady });
        }
        else if (pathname === "/api/switch" && req.method === "POST") {
            const body = await parseJsonBody(req);
            if (!body.id) {
                sendJson(res, 400, { success: false, error: "Missing account id" });
                return;
            }
            const activeAcc = await activateAccountById(body.id);
            sendJson(res, 200, { success: true, activeAccount: activeAcc.email });
        }
        else if (pathname === "/api/rename" && req.method === "POST") {
            const body = await parseJsonBody(req);
            if (!body.id || !body.name) {
                sendJson(res, 400, { success: false, error: "Missing id or name" });
                return;
            }
            const raw = accountManager.loadAccounts();
            let targetKey = null;
            for (const key in raw) {
                if (key.startsWith("__") || key === "active_account") continue;
                const acc = raw[key];
                acc.id = acc.id || key;
                if (String(acc.id) === String(body.id) || acc.email.toLowerCase() === String(body.id).toLowerCase()) {
                    targetKey = key;
                    break;
                }
            }
            if (!targetKey) {
                sendJson(res, 404, { success: false, error: "Account not found" });
                return;
            }
            raw[targetKey].name = body.name.trim();
            accountManager.saveAccounts(raw);
            sendJson(res, 200, { success: true });
        }
        else if (pathname === "/api/delete" && req.method === "POST") {
            const body = await parseJsonBody(req);
            if (!body.id) {
                sendJson(res, 400, { success: false, error: "Missing account id" });
                return;
            }
            const raw = accountManager.loadAccounts();
            let targetKey = null;
            for (const key in raw) {
                if (key.startsWith("__") || key === "active_account") continue;
                const acc = raw[key];
                acc.id = acc.id || key;
                if (String(acc.id) === String(body.id) || acc.email.toLowerCase() === String(body.id).toLowerCase()) {
                    targetKey = key;
                    break;
                }
            }
            if (!targetKey) {
                sendJson(res, 404, { success: false, error: "Account not found" });
                return;
            }
            delete raw[targetKey];
            accountManager.saveAccounts(raw);
            sendJson(res, 200, { success: true });
        }
        else if (pathname === "/api/oauth/start" && req.method === "GET") {
            const { server: oauthServer, state, port } = await accountManager.startOAuthServer(
                async (code) => {
                    try {
                        await processOAuthCode(code, port);
                    } catch (e) {
                        console.error("OAuth process error:", e);
                    }
                },
                (err) => console.error("OAuth server error:", err)
            );

            activeOAuthSessions[state] = { port, timestamp: Date.now() };
            const redirectUri = `http://127.0.0.1:${port}/oauth-callback`;
            const authUrl = accountManager.buildAuthUrl(redirectUri, state);
            sendJson(res, 200, { success: true, authUrl, port, state });
        }
        else if (pathname === "/api/oauth/submit-code" && req.method === "POST") {
            const body = await parseJsonBody(req);
            let input = (body.code || body.url || "").trim();
            if (!input) {
                sendJson(res, 400, { success: false, error: "Missing code or URL" });
                return;
            }

            let code = input;
            let port = body.port || 8888;

            if (input.includes("code=")) {
                try {
                    const parsedUrl = new URL(input.startsWith("http") ? input : `http://localhost/${input}`);
                    code = parsedUrl.searchParams.get("code") || code;
                    if (parsedUrl.port) port = parseInt(parsedUrl.port, 10);
                } catch (e) {}
            }

            try {
                const account = await processOAuthCode(code, port);
                sendJson(res, 200, { success: true, account });
            } catch (e) {
                console.error("Manual code exchange error:", e);
                sendJson(res, 400, { success: false, error: e.message });
            }
        }
        else {
            sendJson(res, 404, { success: false, error: "Not found" });
        }
    } catch (err) {
        console.error("API error:", err);
        sendJson(res, 500, { success: false, error: err.message });
    }
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`Antigravity Auth REST API Server running on http://127.0.0.1:${PORT}`);
});
