from __future__ import annotations

import builtins
import inspect
from typing import Any

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)


DOC_URL_TEMPLATES = {
    "math": "https://docs.python.org/3/library/math.html#math.{name}",
    "cmath": "https://docs.python.org/3/library/cmath.html#cmath.{name}",
    "statistics": "https://docs.python.org/3/library/statistics.html#statistics.{name}",
    "random": "https://docs.python.org/3/library/random.html#random.{name}",
    "decimal": "https://docs.python.org/3/library/decimal.html#decimal.{name}",
    "fractions": "https://docs.python.org/3/library/fractions.html#fractions.{name}",
    "numpy": "https://numpy.org/doc/stable/reference/generated/numpy.{name}.html",
    "scipy": "https://docs.scipy.org/doc/scipy/reference/generated/scipy.{name}.html",
    "sympy": "https://docs.sympy.org/latest/search.html?q={name}",
    "mpmath": "https://mpmath.org/doc/current/search.html?q={name}",
}

OPTIONAL_MODULES = [
    "math",
    "cmath",
    "statistics",
    "random",
    "decimal",
    "fractions",
    "numpy",
    "scipy",
    "sympy",
    "mpmath",
]

LIB_ALIASES = {
    "np": "numpy",
    "sp": "sympy",
}

HUMAN_SEARCH_MAP: dict[str, dict[str, list[str]]] = {
    "square root": {
        "math": ["sqrt"],
        "cmath": ["sqrt"],
        "numpy": ["sqrt"],
        "sympy": ["sqrt"],
        "mpmath": ["sqrt"],
    },
    "square": {"math": ["pow"], "numpy": ["square"], "sympy": ["Pow"]},
    "power": {"math": ["pow"], "numpy": ["power"], "sympy": ["Pow"]},
    "sine": {"math": ["sin"], "numpy": ["sin"], "sympy": ["sin"], "mpmath": ["sin"], "cmath": ["sin"]},
    "cosine": {"math": ["cos"], "numpy": ["cos"], "sympy": ["cos"], "mpmath": ["cos"], "cmath": ["cos"]},
    "tangent": {"math": ["tan"], "numpy": ["tan"], "sympy": ["tan"], "mpmath": ["tan"], "cmath": ["tan"]},
    "arc sine": {"math": ["asin"], "numpy": ["arcsin"], "sympy": ["asin"], "mpmath": ["asin"], "cmath": ["asin"]},
    "arc cosine": {"math": ["acos"], "numpy": ["arccos"], "sympy": ["acos"], "mpmath": ["acos"], "cmath": ["acos"]},
    "arc tangent": {"math": ["atan"], "numpy": ["arctan"], "sympy": ["atan"], "mpmath": ["atan"], "cmath": ["atan"]},
    "log": {"math": ["log"], "numpy": ["log"], "sympy": ["log"], "mpmath": ["log"], "cmath": ["log"]},
    "natural log": {"math": ["log"], "numpy": ["log"], "sympy": ["log"], "mpmath": ["log"], "cmath": ["log"]},
    "log base 10": {"math": ["log10"], "numpy": ["log10"], "sympy": ["log"], "mpmath": ["log10"]},
    "exponential": {"math": ["exp"], "numpy": ["exp"], "sympy": ["exp"], "mpmath": ["exp"], "cmath": ["exp"]},
    "absolute": {"math": ["fabs"], "numpy": ["abs"], "sympy": ["Abs"], "mpmath": ["fabs"], "cmath": ["fabs"]},
    "factorial": {"math": ["factorial"], "sympy": ["factorial"], "mpmath": ["factorial"]},
    "gamma": {"math": ["gamma"], "scipy": ["special.gamma"], "sympy": ["gamma"], "mpmath": ["gamma"]},
    "mean": {"statistics": ["mean"], "numpy": ["mean"], "scipy": ["mean"]},
    "median": {"statistics": ["median"], "numpy": ["median"], "scipy": ["median"]},
    "variance": {"statistics": ["variance"], "numpy": ["var"], "scipy": ["var"]},
    "standard deviation": {"statistics": ["stdev"], "numpy": ["std"], "scipy": ["std"]},
    "random number": {"random": ["random"], "numpy": ["random"], "scipy": ["random"]},
    "uniform random": {"random": ["uniform"], "numpy": ["uniform"], "scipy": ["uniform"]},
    "normal distribution": {"random": ["gauss", "normalvariate"], "numpy": ["random"], "scipy": ["stats.norm"]},
}


def get_human_matches(query: str, lib_name: str) -> tuple[list[str], list[str]]:
    if not query:
        return [], []
    normalized = query.lower()
    matched_terms: list[str] = []
    matches: list[str] = []
    for phrase, mapping in HUMAN_SEARCH_MAP.items():
        if phrase in normalized:
            matched_terms.append(phrase)
            matches.extend(mapping.get(lib_name, []))

    deduped: list[str] = []
    seen: set[str] = set()
    for item in matches:
        if item not in seen:
            deduped.append(item)
            seen.add(item)
    return deduped, matched_terms


class SafeImporter:
    def __init__(self, allowed: dict[str, Any]):
        self.allowed = allowed

    def __call__(self, name: str, globals=None, locals=None, fromlist=(), level: int = 0):
        if name in self.allowed:
            return self.allowed[name]
        raise ImportError(f"Module '{name}' is not allowed")


def load_modules() -> dict[str, Any]:
    loaded: dict[str, Any] = {}
    for module_name in OPTIONAL_MODULES:
        try:
            loaded[module_name] = __import__(module_name)
        except Exception:
            continue
    return loaded


AVAILABLE_MODULES = load_modules()


def build_function_index() -> dict[str, set[str]]:
    index: dict[str, set[str]] = {}
    for name, module in AVAILABLE_MODULES.items():
        try:
            members = inspect.getmembers(module)
            functions = {
                member_name
                for member_name, member_value in members
                if callable(member_value)
            }
            index[name] = functions
        except Exception:
            index[name] = set()
    return index


FUNCTION_INDEX = build_function_index()


def extract_function_signature(fn_name: str, module_obj: Any) -> str:
    try:
        fn = getattr(module_obj, fn_name, None)
        if fn and callable(fn):
            sig = inspect.signature(fn)
            return f"{fn_name}{sig}"
    except Exception:
        pass
    return fn_name


def extract_function_doc(fn_name: str, module_obj: Any) -> str:
    try:
        fn = getattr(module_obj, fn_name, None)
        if fn and callable(fn):
            doc = inspect.getdoc(fn) or ""
            lines = doc.split("\n")
            first_line = lines[0].strip() if lines else ""
            return first_line[:150]
    except Exception:
        pass
    return ""


def build_function_metadata() -> dict[str, dict[str, dict[str, str]]]:
    metadata: dict[str, dict[str, dict[str, str]]] = {}
    for lib_name, module_obj in AVAILABLE_MODULES.items():
        metadata[lib_name] = {}
        functions = FUNCTION_INDEX.get(lib_name, set())
        for fn_name in functions:
            sig = extract_function_signature(fn_name, module_obj)
            doc = extract_function_doc(fn_name, module_obj)
            metadata[lib_name][fn_name] = {"signature": sig, "doc": doc}
    return metadata


FUNCTION_METADATA = build_function_metadata()


def safe_globals() -> dict[str, Any]:
    allowed_builtins = {
        "abs": builtins.abs,
        "min": builtins.min,
        "max": builtins.max,
        "sum": builtins.sum,
        "range": builtins.range,
        "len": builtins.len,
        "round": builtins.round,
        "pow": builtins.pow,
    }

    globals_dict: dict[str, Any] = {
        "__builtins__": allowed_builtins,
        "__import__": SafeImporter(AVAILABLE_MODULES),
    }

    for key, module in AVAILABLE_MODULES.items():
        globals_dict[key] = module

    if "numpy" in AVAILABLE_MODULES:
        globals_dict["np"] = AVAILABLE_MODULES["numpy"]
    if "sympy" in AVAILABLE_MODULES:
        globals_dict["sp"] = AVAILABLE_MODULES["sympy"]

    return globals_dict


def serialize_value(val: Any) -> Any:
    """Convert non-JSON-serializable objects to serializable forms."""
    if isinstance(val, dict):
        return {k: serialize_value(v) for k, v in val.items()}
    elif isinstance(val, (list, tuple)):
        return [serialize_value(v) for v in val]
    elif hasattr(val, "__dict__") and not isinstance(val, (type, type(None))):
        # Custom object (including PageNamespace) - convert to dict
        return {k: serialize_value(v) for k, v in vars(val).items()}
    else:
        return val


def eval_lines(lines: list[str], pages_context: dict[str, dict[str, Any]] = None) -> dict[str, Any]:
    results: list[str] = []
    globals_dict = safe_globals()
    locals_dict: dict[str, Any] = {}

    if pages_context:
        for page_name, page_vars in pages_context.items():
            class PageNamespace:
                pass
            ns = PageNamespace()
            for var_name, var_value in page_vars.items():
                setattr(ns, var_name, var_value)
            locals_dict[page_name] = ns

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            results.append("")
            continue

        try:
            value = None
            try:
                value = eval(line, globals_dict, locals_dict)
            except SyntaxError:
                exec(line, globals_dict, locals_dict)

            if value is None:
                results.append("")
            else:
                results.append(repr(value))
        except Exception as exc:
            results.append(f"Error: {exc}")

    exported_context = {k: serialize_value(v) for k, v in locals_dict.items() if not k.startswith("_") and not isinstance(v, type)}
    
    return {"results": results, "context": exported_context}


@app.get("/")
def index():
    return render_template("index.html")


@app.post("/api/evaluate")
def evaluate():
    payload = request.get_json(force=True)
    lines = payload.get("lines", [])
    context = payload.get("context", {})
    if not isinstance(lines, list):
        return jsonify({"error": "Invalid lines"}), 400

    results = eval_lines([str(line) for line in lines], context)
    return jsonify({"results": results["results"], "context": results["context"]})


@app.get("/api/libs")
def libs():
    response = []
    for name in OPTIONAL_MODULES:
        response.append(
            {
                "name": name,
                "available": name in AVAILABLE_MODULES,
                "docTemplate": DOC_URL_TEMPLATES.get(name, ""),
            }
        )
    return jsonify({"libraries": response})


@app.get("/api/function-search")
def function_search():
    raw_term = (request.args.get("name") or "").strip()
    term = raw_term
    if "." in raw_term:
        term = raw_term.split(".")[-1]
    results = []

    for lib_name in OPTIONAL_MODULES:
        doc_template = DOC_URL_TEMPLATES.get(lib_name, "")
        doc_url = doc_template.format(name=term) if doc_template else ""
        functions = FUNCTION_INDEX.get(lib_name, set())
        available = lib_name in AVAILABLE_MODULES
        matches: list[str] = []
        library_match = False
        human_matches: list[str] = []
        human_terms: list[str] = []
        if term:
            lower_term = term.lower()
            library_match = lower_term in lib_name.lower() or LIB_ALIASES.get(lower_term) == lib_name
            exact = [fn for fn in functions if fn.lower() == lower_term]
            prefix = [fn for fn in functions if fn.lower().startswith(lower_term) and fn not in exact]
            contains = [
                fn
                for fn in functions
                if lower_term in fn.lower() and fn not in exact and fn not in prefix
            ]
            matched_fns = (exact + prefix + contains)[:15]
            matches = [
                {
                    "name": fn,
                    "signature": FUNCTION_METADATA.get(lib_name, {}).get(fn, {}).get("signature", fn),
                    "doc": FUNCTION_METADATA.get(lib_name, {}).get(fn, {}).get("doc", ""),
                }
                for fn in matched_fns
            ]
            human_matches, human_terms = get_human_matches(raw_term, lib_name)

        results.append(
            {
                "library": lib_name,
                "available": available,
                "docUrl": doc_url,
                "matches": matches,
                "matchCount": len(matches),
                "libraryMatch": library_match,
                "humanMatches": human_matches,
                "humanTerms": human_terms,
            }
        )

    return jsonify({"query": term, "results": results})


@app.post("/api/function-info")
def function_info():
    lib_name = (request.args.get("lib") or "").strip()
    fn_name = (request.args.get("name") or "").strip()
    
    if not lib_name or not fn_name:
        return jsonify({"error": "Missing lib or name"}), 400
    
    metadata = FUNCTION_METADATA.get(lib_name, {}).get(fn_name, {})
    doc_template = DOC_URL_TEMPLATES.get(lib_name, "")
    doc_url = doc_template.format(name=fn_name) if doc_template else ""
    
    return jsonify({
        "library": lib_name,
        "name": fn_name,
        "signature": metadata.get("signature", fn_name),
        "doc": metadata.get("doc", ""),
        "docUrl": doc_url,
    })


# Error log storage
ERROR_LOGS = []

@app.post("/api/log-error")
def log_error():
    """Store client-side or evaluation errors for debugging."""
    payload = request.get_json(force=True)
    error_msg = payload.get("message", "Unknown error")
    error_type = payload.get("type", "client")
    line_no = payload.get("lineNo", None)
    
    import datetime
    timestamp = datetime.datetime.now().isoformat()
    
    error_entry = {
        "timestamp": timestamp,
        "type": error_type,
        "message": error_msg,
        "lineNo": line_no
    }
    
    ERROR_LOGS.append(error_entry)
    # Keep last 100 errors
    if len(ERROR_LOGS) > 100:
        ERROR_LOGS.pop(0)
    
    return jsonify({"logged": True})


@app.get("/api/error-logs")
def get_error_logs():
    """Retrieve all logged errors."""
    return jsonify({"errors": ERROR_LOGS})


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
