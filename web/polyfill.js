// Global model override state and request interceptor
window.__activeModelOverride = window.__activeModelOverride || null;

(function interceptModelRequests() {
  // 1. Intercept fetch
  var origFetch = window.fetch;
  window.fetch = async function(resource, init) {
    var url = typeof resource === 'string' ? resource : (resource ? resource.url : '');
    
    // Route OpenAI / DeepSeek models through /api/openai-proxy if active
    if (window.__activeModelOverride && (window.__activeModelOverride.includes('deepseek') || window.__activeModelOverride.includes('pickle'))) {
      if (url.includes('SendUserCascadeMessage') || url.includes('StreamCascadeTurn')) {
        console.log('[OpenAI Proxy Interceptor] Redirecting prompt to DeepSeek/OpenAI proxy:', window.__activeModelOverride);
        try {
          var userPrompt = "Hello";
          if (init && init.body) {
            var bodyText = typeof init.body === 'string' ? init.body : new TextDecoder().decode(init.body);
            var match = bodyText.match(/["']?(text|content)["']?\s*:\s*["']([^"']+)["']/i);
            if (match && match[2]) userPrompt = match[2];
          }

          var proxyResp = await origFetch('/api/openai-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: window.__activeModelOverride,
              messages: [{ role: 'user', content: userPrompt }]
            })
          });

          var proxyData = await proxyResp.json();
          var aiReply = (proxyData.choices && proxyData.choices[0] && proxyData.choices[0].message) ? proxyData.choices[0].message.content : "DeepSeek response placeholder";

          // Return fake gRPC response
          return new Response(new Uint8Array([0,0,0,0,0]), {
            status: 200,
            headers: { 'Content-Type': 'application/grpc-web+proto', 'grpc-status': '0' }
          });
        } catch(err) {
          console.error('[OpenAI Proxy Interceptor Error]', err);
        }
      }
    }

    if (window.__activeModelOverride && init && init.body && typeof init.body === 'string') {
      try {
        if (init.body.indexOf('gemini-3.6-flash') !== -1) {
          init.body = init.body.replace(/gemini-3\.6-flash(-[a-z]+)?/g, window.__activeModelOverride);
        }
      } catch(e) {}
    }
    return origFetch.apply(this, arguments);
  };

  // 2. Intercept XMLHttpRequest
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    if (window.__activeModelOverride && body && typeof body === 'string') {
      try {
        if (body.indexOf('gemini-3.6-flash') !== -1) {
          body = body.replace(/gemini-3\.6-flash(-[a-z]+)?/g, window.__activeModelOverride);
        }
      } catch(e) {}
    }
    return origSend.call(this, body);
  };
})();

// Inject models into React Dialog Menu
(function injectModelsToDialogMenu() {
  function applyInjection() {
    try {
      var dialogs = document.querySelectorAll("div[role='dialog']");
      dialogs.forEach(function(dialog) {
        if (!dialog.innerText || !dialog.innerText.includes("Model")) return;
        if (dialog.getAttribute("data-g37-injected") === "true") return;

        dialog.style.maxHeight = "80vh";
        dialog.style.overflowY = "auto";

        var itemButtons = Array.from(dialog.querySelectorAll("button"));
        var templateBtn = itemButtons.find(function(b) {
          return b.innerText && (b.innerText.includes("Gemini") || b.innerText.includes("Claude") || b.innerText.includes("GPT"));
        });
        if (!templateBtn) return;

        var container = templateBtn.parentElement;
        if (!container) return;

        dialog.setAttribute("data-g37-injected", "true");

        var oldInjected = container.querySelectorAll(".injected-model-row");
        oldInjected.forEach(function(b) { b.remove(); });

        var extraModels = [
          { id: "gemini-3.7-flash-high", name: "Gemini 3.7 Flash (High)" },
          { id: "gemini-3.7-flash-medium", name: "Gemini 3.7 Flash (Medium)" },
          { id: "gemini-3.7-flash-low", name: "Gemini 3.7 Flash (Low)" },
          { id: "deepseek-v4-flash-free", name: "DeepSeek v4 Flash (OpenAI Free)" },
          { id: "big-pickle", name: "Big Pickle (OpenAI Free)" }
        ];

        extraModels.slice().reverse().forEach(function(m) {
          var clone = templateBtn.cloneNode(true);
          clone.classList.add("injected-model-row");
          
          var spans = clone.querySelectorAll("span");
          var replaced = false;
          spans.forEach(function(s) {
            if (!replaced && s.children.length === 0 && s.innerText && (s.innerText.includes("Gemini") || s.innerText.includes("Claude") || s.innerText.includes("GPT"))) {
              s.innerText = m.name;
              replaced = true;
            }
          });
          if (!replaced) {
            clone.innerHTML = clone.innerHTML.replace(/Gemini [0-9\.]+ Flash \([^)]+\)/g, m.name);
          }

          clone.addEventListener("click", function(e) {
            e.stopPropagation();
            var btnSpan = document.querySelector("button span.text-ellipsis");
            if (btnSpan) btnSpan.innerText = m.name;
            window.__activeModelOverride = m.id;
            console.log("Selected model override:", m.id);
            dialog.style.display = "none";
          }, true);

          container.insertBefore(clone, templateBtn);
        });
      });
    } catch(e) {}
  }
  setInterval(applyInjection, 300);
})();
