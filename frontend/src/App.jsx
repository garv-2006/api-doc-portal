import { useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const SAMPLE_SPEC = `{
  "baseUrl": "https://jsonplaceholder.typicode.com",
  "endpoints": [
    {
      "method": "GET",
      "path": "/posts/1",
      "description": "Fetch a single post by id"
    },
    {
      "method": "POST",
      "path": "/posts",
      "description": "Create a new post",
      "body": { "title": "foo", "body": "bar", "userId": 1 }
    },
    {
      "method": "GET",
      "path": "/posts/9999",
      "description": "Fetch a post that does not exist"
    }
  ]
}`;

export default function App() {
  const [specText, setSpecText] = useState(SAMPLE_SPEC);
  const [docs, setDocs] = useState(null);
  const [tests, setTests] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState({});
  const [runningId, setRunningId] = useState(null);
  const [activeTab, setActiveTab] = useState("docs");
  const [demoMode, setDemoMode] = useState(false);

  async function handleGenerate() {
    setError("");
    setLoading(true);
    setDocs(null);
    setTests(null);
    setResults({});
    try {
      let spec;
      try {
        spec = JSON.parse(specText);
      } catch {
        throw new Error("Spec must be valid JSON.");
      }

      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
      });

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`Backend error (${res.status}): ${detail}`);
      }

      const data = await res.json();
      setDocs(data.documentation || []);
      setTests((data.testCases || []).map((t, i) => ({ ...t, id: t.id || `t${i}` })));
      setDemoMode(!!data._demo_mode);
      setActiveTab("docs");
    } catch (e) {
      setError(e.message || "Something went wrong generating docs and tests.");
    } finally {
      setLoading(false);
    }
  }

  async function runTest(test) {
    setRunningId(test.id);
    const start = performance.now();
    try {
      const res = await fetch(`${API_BASE}/run-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: test.method,
          url: test.url,
          headers: test.headers || {},
          body: test.body || null,
        }),
      });
      const latency = Math.round(performance.now() - start);

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `Backend error (${res.status})`);
      }

      const data = await res.json();
      const pass = data.status === test.expectedStatus;
      setResults((r) => ({
        ...r,
        [test.id]: {
          status: data.status,
          pass,
          latency,
          body: JSON.stringify(data.body, null, 2),
          error: null,
        },
      }));
    } catch (e) {
      const latency = Math.round(performance.now() - start);
      setResults((r) => ({
        ...r,
        [test.id]: { status: null, pass: false, latency, body: "", error: e.message },
      }));
    } finally {
      setRunningId(null);
    }
  }

  async function runAll() {
    for (const t of tests) {
      await runTest(t);
    }
  }

  const passCount = Object.values(results).filter((r) => r.pass).length;
  const ranCount = Object.keys(results).length;

  return (
    <div className="container">
      <div className="header">
        <h1>API documentation and testing portal</h1>
        <p>Paste an API spec, generate docs and test cases with AI, then run the tests live.</p>
      </div>

      <div className="panel">
        <label>API spec (base URL + endpoints, JSON)</label>
        <textarea rows={10} value={specText} onChange={(e) => setSpecText(e.target.value)} />
        <div className="actions-row">
          <button onClick={handleGenerate} disabled={loading}>
            {loading ? "Generating..." : "Generate documentation and tests"}
          </button>
          {error && <span className="error-text">{error}</span>}
        </div>
      </div>

      {(docs || tests) && (
        <>
          {demoMode && (
            <p style={{ fontSize: 13, color: "#fbbf24", margin: "0 0 12px" }}>
              Showing example output (demo mode) — live AI generation is unavailable right now.
            </p>
          )}
          <div className="tabs">
            <button
              className={`tab-btn ${activeTab === "docs" ? "active" : ""}`}
              onClick={() => setActiveTab("docs")}
            >
              Documentation
            </button>
            <button
              className={`tab-btn ${activeTab === "tests" ? "active" : ""}`}
              onClick={() => setActiveTab("tests")}
            >
              Test cases {tests ? `(${tests.length})` : ""}
            </button>
          </div>

          {activeTab === "docs" && docs && (
            <div>
              {docs.map((d, i) => (
                <div className="card" key={i}>
                  <span className={`method-tag method-${d.method}`}>{d.method}</span>{" "}
                  <span className="endpoint-path">{d.path}</span>
                  <h3>{d.summary}</h3>
                  <p className="desc">{d.description}</p>
                  {d.parameters && d.parameters.length > 0 && (
                    <table className="params">
                      <tbody>
                        {d.parameters.map((p, j) => (
                          <tr key={j}>
                            <td style={{ fontFamily: "monospace" }}>{p.name}</td>
                            <td style={{ color: "#9a9a9a" }}>{p.type}</td>
                            <td style={{ color: p.required ? "#f87171" : "#7d7d7d" }}>
                              {p.required ? "required" : "optional"}
                            </td>
                            <td style={{ color: "#9a9a9a" }}>{p.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {d.exampleRequest && (
                    <details>
                      <summary>Example request / response</summary>
                      <pre>{JSON.stringify(d.exampleRequest, null, 2)}</pre>
                      <pre>{JSON.stringify(d.exampleResponse, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === "tests" && tests && (
            <div>
              <div className="summary-row">
                <span>{ranCount > 0 ? `${passCount} / ${ranCount} passed` : "No tests run yet"}</span>
                <button className="secondary" onClick={runAll} disabled={runningId !== null}>
                  Run all tests
                </button>
              </div>
              {tests.map((t) => {
                const r = results[t.id];
                return (
                  <div className="card" key={t.id}>
                    <div className="test-header">
                      <div>
                        <span className={`method-tag method-${t.method}`}>{t.method}</span>{" "}
                        <span className="endpoint-path">{t.url}</span>
                        <h3>{t.name}</h3>
                        <span className="test-meta">
                          {t.category} &middot; expects {t.expectedStatus}
                        </span>
                      </div>
                      <button onClick={() => runTest(t)} disabled={runningId === t.id}>
                        {runningId === t.id ? "Running..." : "Run test"}
                      </button>
                    </div>
                    {r && (
                      <div className="result-block">
                        <div className="result-status">
                          <span className={r.error ? "fail" : r.pass ? "pass" : "fail"}>
                            {r.error ? "Error" : r.pass ? "Passed" : "Failed"}
                          </span>
                          {r.status !== null && <span>Status {r.status}</span>}
                          <span>{r.latency}ms</span>
                        </div>
                        {r.error ? (
                          <p className="error-text">{r.error}</p>
                        ) : (
                          <pre>{r.body}</pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
