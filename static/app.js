const editor = document.getElementById("editor");
const overlay = document.getElementById("overlay");
const status = document.getElementById("status");
const functionSearch = document.getElementById("functionSearch");
const searchResults = document.getElementById("searchResults");
const searchWrapper = document.getElementById("searchWrapper");
const variablesWrapper = document.getElementById("variablesWrapper");
const searchPane = document.getElementById("searchPane");
const variablesPane = document.getElementById("variablesPane");
const toggleSearchBtn = document.getElementById("toggleSearch");
const toggleVarsBtn = document.getElementById("toggleVars");
const closeSearchBtn = document.getElementById("closeSearch");
const closeVariablesBtn = document.getElementById("closeVariables");
const runBtn = document.getElementById("runBtn");
const clearBtn = document.getElementById("clearBtn");
const editorInfo = document.getElementById("editorInfo");
const tabsContainer = document.getElementById("tabs");
const addTabBtn = document.getElementById("addTabBtn");
const variablesContent = document.getElementById("variablesContent");
const mainContainer = document.getElementById("mainContainer");
const searchSplitter = document.getElementById("searchSplitter");
const variablesSplitter = document.getElementById("variablesSplitter");
const searchDockBtn = document.getElementById("searchDockBtn");
const variablesDockBtn = document.getElementById("variablesDockBtn");

// Error Modal elements
const errorModal = document.getElementById("errorModal");
const errorLogsList = document.getElementById("errorLogsList");
const closeErrorModal = document.getElementById("closeErrorModal");
const closeErrorsBtn = document.getElementById("closeErrorsBtn");
const clearErrorsBtn = document.getElementById("clearErrorsBtn");

let previousLines = [];
let latestResults = [];
let debounceTimer = null;
let searchInfoTimer = null;
let pages = [];
let errorLogs = [];
let currentPageId = null;
let pageIdCounter = 0;
let isResizingVertical = false;
let activeResizePane = null;

const renderLines = (lines) => {
  overlay.innerHTML = "";

  lines.forEach((_, index) => {
    const row = document.createElement("div");
    row.className = "overlay-row";

    const number = document.createElement("span");
    number.className = "overlay-number";
    number.textContent = String(index + 1).padStart(2, " ");

    const spacer = document.createElement("span");
    spacer.className = "overlay-spacer";

    const result = document.createElement("span");
    result.className = "overlay-result";
    result.textContent = latestResults[index] || "";

    row.appendChild(number);
    row.appendChild(spacer);
    row.appendChild(result);
    overlay.appendChild(row);
  });
};

const updateResultsFrom = (startIndex, results) => {
  latestResults = results;
  const rows = overlay.querySelectorAll(".overlay-row");
  for (let i = startIndex; i < results.length; i += 1) {
    const row = rows[i];
    if (row) {
      const result = row.querySelector(".overlay-result");
      if (result) {
        result.textContent = results[i] || "";
      }
    }
  }
};

const getChangedLineIndex = (lines) => {
  const max = Math.max(lines.length, previousLines.length);
  for (let i = 0; i < max; i += 1) {
    if (lines[i] !== previousLines[i]) {
      return i;
    }
  }
  return -1;
};

const evaluateLines = async (lines, startIndex) => {
  status.textContent = "Evaluating...";
  editorInfo.textContent = "Evaluating...";
  try {
    const allPagesContext = {};
    pages.forEach(page => {
      if (page.id !== currentPageId && page.results) {
        allPagesContext[page.name] = page.context || {};
      }
    });

    const response = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, startIndex, context: allPagesContext }),
    });

    const data = await response.json();
    if (response.ok) {
      updateResultsFrom(startIndex, data.results || []);
      const currentPage = pages.find(p => p.id === currentPageId);
      if (currentPage) {
        currentPage.context = data.context || {};
      }
      renderVariables();
      status.textContent = "Ready";
      editorInfo.textContent = `${lines.length} lines`;
      
      // Log any errors in the results
      data.results.forEach((result, idx) => {
        if (result && result.includes("Error:")) {
          logError(result, "evaluation", idx + startIndex + 1);
        }
      });
    } else {
      const errorMsg = data.error || "Evaluation failed";
      status.textContent = errorMsg;
      editorInfo.textContent = "Error";
      logError(errorMsg, "api");
    }
  } catch (error) {
    status.textContent = "Evaluation failed";
    editorInfo.textContent = "Failed";
    logError(`Network error: ${error.message}`, "network");
  }
};

const scheduleEvaluation = () => {
  const lines = editor.value.split("\n");
  const changedIndex = getChangedLineIndex(lines);

  if (changedIndex === -1) {
    return;
  }

  previousLines = [...lines];
  renderLines(lines);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    evaluateLines(lines, changedIndex);
  }, 250);
};

editor.addEventListener("scroll", () => {
  overlay.scrollTop = editor.scrollTop;
});

const buildSearchResults = (payload) => {
  searchResults.innerHTML = "";
  if (!payload.query) {
    return;
  }

  payload.results.forEach((item) => {
    if (item.matches.length === 0 && item.humanMatches.length === 0 && !item.libraryMatch) {
      return;
    }

    const card = document.createElement("div");
    card.className = "search-item";

    const header = document.createElement("div");
    header.className = "search-header";
    const suffix = item.available ? "" : " (missing)";
    header.textContent = item.library + suffix;

    card.appendChild(header);

    const allMatches = [...new Set([...(item.matches || []).map(m => m.name || m), ...(item.humanMatches || [])])];
    
    allMatches.forEach((matchName) => {
      const match = (item.matches || []).find(m => (m.name || m) === matchName);
      const quickInfo = document.createElement("div");
      quickInfo.className = "search-match-item";

      const matchDisplay = document.createElement("div");
      matchDisplay.className = "search-match-name";
      matchDisplay.textContent = matchName;

      if (match && match.doc) {
        const docPreview = document.createElement("div");
        docPreview.className = "search-match-doc";
        docPreview.textContent = match.doc;
        quickInfo.appendChild(matchDisplay);
        quickInfo.appendChild(docPreview);
      } else {
        quickInfo.appendChild(matchDisplay);
      }

      const actions = document.createElement("div");
      actions.className = "search-actions";

      const insertBtn = document.createElement("button");
      insertBtn.className = "search-btn";
      insertBtn.textContent = "Insert";
      insertBtn.onclick = () => {
        let prefix = "";
        if (item.library === "numpy") {
          prefix = "np.";
        } else if (item.library === "sympy") {
          prefix = "sp.";
        } else {
          prefix = item.library + ".";
        }
        editor.value += `${prefix}${matchName}()`;
        editor.focus();
        scheduleEvaluation();
      };

      const docsBtn = document.createElement("button");
      docsBtn.className = "search-btn";
      docsBtn.textContent = "Docs";
      docsBtn.onclick = () => {
        const docTemplates = {
          "math": "https://docs.python.org/3/library/math.html#math.{name}",
          "cmath": "https://docs.python.org/3/library/cmath.html#cmath.{name}",
          "statistics": "https://docs.python.org/3/library/statistics.html#statistics.{name}",
          "random": "https://docs.python.org/3/library/random.html#random.{name}",
          "decimal": "https://docs.python.org/3/library/decimal.html#decimal.{name}",
          "fractions": "https://docs.python.org/3/library/fractions.html#fractions.{name}",
          "numpy": "https://numpy.org/doc/stable/reference/generated/numpy.{name}.html",
          "scipy": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.{name}.html",
          "sympy": "https://docs.sympy.org/latest/search.html?q={name}",
          "mpmath": "https://mpmath.org/doc/current/search.html?q={name}"
        };
        const template = docTemplates[item.library];
        const url = template.replace("{name}", matchName);
        window.open(url, "_blank");
      };

      actions.appendChild(insertBtn);
      actions.appendChild(docsBtn);
      quickInfo.appendChild(actions);
      card.appendChild(quickInfo);
    });

    searchResults.appendChild(card);
  });
};

const fetchFunctionSearch = async (term) => {
  if (!term) {
    searchResults.innerHTML = "";
    return;
  }

  const response = await fetch(`/api/function-search?name=${encodeURIComponent(term)}`);
  const data = await response.json();
  buildSearchResults(data);
};

functionSearch.addEventListener("input", (event) => {
  clearTimeout(searchInfoTimer);
  const term = event.target.value.trim();
  fetchFunctionSearch(term);
  
  searchInfoTimer = setTimeout(() => {
    fetchFunctionSearch(term);
  }, 1000);
});

editor.addEventListener("input", scheduleEvaluation);

const openPane = (wrapper, pane) => {
  wrapper.classList.remove("hidden");
  pane.classList.add("open");
  if (!pane.style.width || pane.style.width === "0px") {
    pane.style.width = "320px";
  }
};

const closePane = (wrapper, pane) => {
  pane.classList.remove("open");
  pane.style.width = "0px";
  wrapper.classList.add("hidden");
  wrapper.classList.remove("floating");
};

const enableDragging = (wrapper) => {
  if (!window.interact) {
    return;
  }
  interact(wrapper).draggable({
    allowFrom: ".drag-handle",
    listeners: {
      start(event) {
        wrapper.classList.add("floating");
        wrapper.dataset.x = wrapper.dataset.x || "0";
        wrapper.dataset.y = wrapper.dataset.y || "0";
      },
      move(event) {
        const x = (parseFloat(wrapper.dataset.x) || 0) + event.dx;
        const y = (parseFloat(wrapper.dataset.y) || 0) + event.dy;
        wrapper.style.transform = `translate(${x}px, ${y}px)`;
        wrapper.dataset.x = x;
        wrapper.dataset.y = y;
      }
    }
  });
};

const toggleDock = (wrapper, button) => {
  const current = wrapper.dataset.dock || "right";
  const next = current === "right" ? "left" : "right";
  wrapper.dataset.dock = next;
  button.textContent = next === "right" ? "Dock Left" : "Dock Right";
};

toggleSearchBtn.addEventListener("click", () => {
  openPane(searchWrapper, searchPane);
  functionSearch.focus();
});

toggleVarsBtn.addEventListener("click", () => {
  openPane(variablesWrapper, variablesPane);
});

closeSearchBtn.addEventListener("click", () => {
  closePane(searchWrapper, searchPane);
});

closeVariablesBtn.addEventListener("click", () => {
  closePane(variablesWrapper, variablesPane);
});

searchDockBtn.addEventListener("click", () => {
  toggleDock(searchWrapper, searchDockBtn);
  searchWrapper.classList.remove("floating");
  searchWrapper.style.transform = "";
});

variablesDockBtn.addEventListener("click", () => {
  toggleDock(variablesWrapper, variablesDockBtn);
  variablesWrapper.classList.remove("floating");
  variablesWrapper.style.transform = "";
});

searchSplitter.addEventListener("mousedown", (event) => {
  event.preventDefault();
  isResizingVertical = true;
  activeResizePane = searchPane;
});

variablesSplitter.addEventListener("mousedown", (event) => {
  event.preventDefault();
  isResizingVertical = true;
  activeResizePane = variablesPane;
});

document.addEventListener("mouseup", () => {
  isResizingVertical = false;
  activeResizePane = null;
});

document.addEventListener("mousemove", (event) => {
  if (isResizingVertical && activeResizePane) {
    const wrapper = activeResizePane === searchPane ? searchWrapper : variablesWrapper;
    const wrapperRect = wrapper.getBoundingClientRect();
    const dock = wrapper.dataset.dock || "right";
    let newWidth;
    if (dock === "left") {
      newWidth = event.clientX - wrapperRect.left;
    } else {
      newWidth = wrapperRect.right - event.clientX;
    }
    const clamped = Math.max(220, Math.min(newWidth, 520));
    activeResizePane.style.width = `${clamped}px`;
  }
});

runBtn.addEventListener("click", () => {
  const lines = editor.value.split("\n");
  evaluateLines(lines, 0);
});

clearBtn.addEventListener("click", () => {
  editor.value = "";
  previousLines = [];
  latestResults = [];
  renderLines([]);
  editorInfo.textContent = "Ready";
  saveCurrentPage();
  renderVariables();
});

const createPage = (name) => {
  const id = pageIdCounter++;
  const page = {
    id,
    name: name || `Page${id + 1}`,
    content: "",
    results: [],
    context: {}
  };
  pages.push(page);
  return page;
};

const startRenameTab = (page, tab, tabName) => {
  const input = document.createElement("input");
  input.className = "tab-rename";
  input.value = page.name;
  tab.replaceChild(input, tabName);
  input.focus();
  input.select();

  const finish = (apply) => {
    const value = input.value.trim();
    if (apply && value) {
      page.name = value;
    }
    renderTabs();
  };

  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
};

const renderTabs = () => {
  tabsContainer.innerHTML = "";
  pages.forEach(page => {
    const tab = document.createElement("div");
    tab.className = "tab";
    if (page.id === currentPageId) {
      tab.classList.add("active");
    }

    const tabName = document.createElement("span");
    tabName.className = "tab-name";
    tabName.textContent = page.name;
    tabName.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      startRenameTab(page, tab, tabName);
    });
    tabName.onclick = () => switchToPage(page.id);

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "×";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      if (pages.length > 1) {
        const idx = pages.findIndex(p => p.id === page.id);
        pages.splice(idx, 1);
        if (currentPageId === page.id) {
          switchToPage(pages[0].id);
        } else {
          renderTabs();
        }
      }
    };

    tab.appendChild(tabName);
    if (pages.length > 1) {
      tab.appendChild(closeBtn);
    }
    tabsContainer.appendChild(tab);
  });
};

const renderVariables = () => {
  variablesContent.innerHTML = "";
  if (pages.length === 0) {
    variablesContent.textContent = "No pages.";
    return;
  }

  const list = document.createElement("div");
  list.className = "variables-list";

  pages.forEach(page => {
    const section = document.createElement("div");
    section.className = "variables-page";

    const title = document.createElement("div");
    title.className = "variables-page-title";
    title.textContent = page.name;

    section.appendChild(title);

    const entries = Object.entries(page.context || {});
    if (entries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "variable-value";
      empty.textContent = "No variables";
      section.appendChild(empty);
    }

    entries.forEach(([key, value]) => {
      const row = document.createElement("div");
      row.className = "variable-item";

      const info = document.createElement("div");

      const name = document.createElement("div");
      name.className = "variable-name";
      name.textContent = key;

      const val = document.createElement("div");
      val.className = "variable-value";
      try {
        val.textContent = typeof value === "string" ? value : JSON.stringify(value);
      } catch (error) {
        val.textContent = String(value);
      }

      info.appendChild(name);
      info.appendChild(val);

      const actions = document.createElement("div");
      actions.className = "variable-actions";

      const insertBtn = document.createElement("button");
      insertBtn.className = "variable-btn";
      insertBtn.textContent = "Insert";
      insertBtn.addEventListener("click", () => {
        const reference = `${page.name}.${key}`;
        editor.value += `\n${reference}`;
        editor.focus();
        scheduleEvaluation();
      });

      actions.appendChild(insertBtn);

      row.appendChild(info);
      row.appendChild(actions);
      section.appendChild(row);
    });

    list.appendChild(section);
  });

  variablesContent.appendChild(list);
};

const saveCurrentPage = () => {
  const page = pages.find(p => p.id === currentPageId);
  if (page) {
    page.content = editor.value;
    page.results = [...latestResults];
  }
};

const switchToPage = (pageId) => {
  saveCurrentPage();
  currentPageId = pageId;
  const page = pages.find(p => p.id === pageId);
  if (page) {
    editor.value = page.content;
    previousLines = page.content.split("\n");
    latestResults = [...(page.results || [])];
    renderLines(previousLines);
    renderTabs();
    renderVariables();
  }
};

// Error logging functions
const logError = async (message, type = "client", lineNo = null) => {
  const error = { timestamp: new Date().toISOString(), type, message, lineNo };
  errorLogs.push(error);
  if (errorLogs.length > 100) errorLogs.shift();
  
  try {
    await fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, type, lineNo }),
    });
  } catch (e) {
    console.error("Failed to log error to server:", e);
  }
};

const renderErrorLogs = () => {
  if (errorLogs.length === 0) {
    errorLogsList.innerHTML = "<p style='color: #aaa;'>No errors logged yet.</p>";
    return;
  }

  errorLogsList.innerHTML = "";
  [...errorLogs].reverse().forEach(error => {
    const entry = document.createElement("div");
    entry.className = "error-log-entry";
    
    const timestamp = document.createElement("div");
    timestamp.className = "timestamp";
    timestamp.textContent = new Date(error.timestamp).toLocaleString();
    
    const badge = document.createElement("span");
    badge.className = "type-badge";
    badge.textContent = error.type.toUpperCase();
    
    const message = document.createElement("div");
    message.className = "message";
    message.textContent = error.message;
    if (error.lineNo !== null) {
      message.textContent += ` (Line ${error.lineNo})`;
    }
    
    entry.appendChild(timestamp);
    entry.appendChild(badge);
    entry.appendChild(message);
    errorLogsList.appendChild(entry);
  });
};

const showErrorModal = async () => {
  try {
    const response = await fetch("/api/error-logs");
    const data = await response.json();
    errorLogs = data.errors || [];
  } catch (e) {
    console.error("Failed to fetch error logs:", e);
  }
  renderErrorLogs();
  errorModal.style.display = "flex";
};

const hideErrorModal = () => {
  errorModal.style.display = "none";
};

// Error modal event listeners
editorInfo.addEventListener("click", showErrorModal);
closeErrorModal.addEventListener("click", hideErrorModal);
closeErrorsBtn.addEventListener("click", hideErrorModal);
clearErrorsBtn.addEventListener("click", async () => {
  errorLogs = [];
  renderErrorLogs();
  try {
    await fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Logs cleared", type: "system" }),
    });
  } catch (e) {
    console.error("Failed to clear logs:", e);
  }
});

// Close modal when clicking outside
errorModal.addEventListener("click", (e) => {
  if (e.target === errorModal) {
    hideErrorModal();
  }
});

addTabBtn.addEventListener("click", () => {
  const page = createPage();
  switchToPage(page.id);
});

const bootstrap = () => {
  const initialPage = createPage("Main");
  currentPageId = initialPage.id;
  initialPage.content = editor.value;
  previousLines = editor.value.split("\n");
  renderLines(previousLines);
  renderTabs();
  renderVariables();
  openPane(searchWrapper, searchPane);
  openPane(variablesWrapper, variablesPane);
  enableDragging(searchWrapper);
  enableDragging(variablesWrapper);
  evaluateLines(previousLines, 0);
};

bootstrap();
