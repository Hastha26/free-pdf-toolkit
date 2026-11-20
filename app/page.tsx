"use client";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Files,
  CodeXml,
  Scissors,
  RotateCw,
  ImagePlus,
  ShieldCheck,
  Upload,
  X,
  ChevronUp,
  ChevronDown,
  Check,
  Download,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import type { Tool } from "@/lib/pdf";
import { tools, type AppTool } from "@/lib/tools";
import { convertOnService, serviceUrl, type ServiceTool } from "@/lib/service";
import dynamic from "next/dynamic";
const PdfEditor = dynamic(() => import("./PdfEditor"), { ssr: false });

async function runBatch<T>(
  files: File[],
  concurrency: number,
  task: (file: File) => Promise<T>,
): Promise<T[]> {
  const results: T[] = Array(files.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, async () => {
      while (index < files.length) {
        const current = index++;
        results[current] = await task(files[current]);
      }
    }),
  );
  return results;
}
export default function Home() {
  const [active, setActive] = useState<AppTool>("merge");
  const [toolFocused, setToolFocused] = useState(false);
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:8765");
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState("default");
  const [serviceStatus, setServiceStatus] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pages, setPages] = useState("");
  const [angle, setAngle] = useState(90);
  const [separate, setSeparate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const tool = tools.find((t) => t.id === active)!;
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  function reset() {
    setFiles([]);
    setPages("");
    setError("");
    setResult(null);
    setConsent(false);
    setMode("default");
    if (input.current) input.current.value = "";
  }
  function choose(id: AppTool) {
    if (busy) return;
    reset();
    setActive(id);
    setToolFocused(true);
    requestAnimationFrame(() =>
      document.getElementById("hero")?.scrollIntoView({ block: "start" }),
    );
  }
  function add(incoming: File[]) {
    setConsent(false);
    setError("");
    setResult(null);
    const valid = incoming.every((f) =>
      tool.accept.split(",").some((ext) => f.name.toLowerCase().endsWith(ext)),
    );
    if (!valid) {
      setError(`Choose a supported file: ${tool.accept}.`);
      return;
    }
    const next = active === "edit" ? incoming : [...files, ...incoming];
    if (active === "edit" && next.length > 1) {
      setError("This tool accepts one PDF at a time.");
      return;
    }
    setFiles(next);
  }
  function move(index: number, delta: number) {
    setResult(null);
    setFiles((old) => {
      const next = [...old];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      if (tool.service) {
        if (!consent)
          throw new Error(
            "Confirm sending this file to your conversion service first.",
          );
        const { zipSync } = await import("fflate");
        const results = await runBatch(files, 3, async (file) => {
          try {
            return {
              output: await convertOnService(
                active as ServiceTool,
                file,
                endpoint,
                apiKey,
                mode,
              ),
              error: "",
            };
          } catch (failure) {
            return {
              output: null,
              error:
                failure instanceof Error
                  ? failure.message
                  : "Conversion failed.",
            };
          }
        });
        const archive: Record<string, Uint8Array> = {};
        const failures = results.flatMap((result, i) =>
          result.error ? [`${files[i].name}: ${result.error}`] : [],
        );
        if (failures.length)
          setError(
            `${failures.length} file(s) failed. ${failures.slice(0, 3).join(" | ")}`,
          );
        const completed = results.flatMap((result) =>
          result.output ? [result.output] : [],
        );
        if (!completed.length) return;
        for (let i = 0; i < results.length; i++)
          if (results[i].output) {
            const output = results[i].output!;
            archive[
              `${String(i + 1).padStart(3, "0")}-${files[i].name.replace(/[^a-zA-Z0-9._-]/g, "_")}.${output.name.split(".").pop()}`
            ] = new Uint8Array(await output.blob.arrayBuffer());
          }
        const blob =
          files.length === 1
            ? completed[0].blob
            : new Blob([new Uint8Array(zipSync(archive, { level: 0 }))], {
                type: "application/zip",
              });
        setResult({
          url: URL.createObjectURL(blob),
          name:
            files.length === 1
              ? completed[0].name
              : `paperfree-${active}-batch.zip`,
        });
        return;
      }
      const { processPdf } = await import("@/lib/pdf");
      if ((active === "split" || active === "rotate") && files.length > 1) {
        const { zipSync } = await import("fflate");
        const archive: Record<string, Uint8Array> = {};
        for (let i = 0; i < files.length; i++) {
          const processed = await processPdf(
            active as Tool,
            [
              {
                name: files[i].name,
                bytes: new Uint8Array(await files[i].arrayBuffer()),
              },
            ],
            { pages, angle, separate },
          );
          archive[
            `${String(i + 1).padStart(3, "0")}-${files[i].name.replace(/[^a-zA-Z0-9._-]/g, "_")}.${processed.name.split(".").pop()}`
          ] = new Uint8Array(processed.bytes);
        }
        setResult({
          url: URL.createObjectURL(
            new Blob([new Uint8Array(zipSync(archive, { level: 0 }))], {
              type: "application/zip",
            }),
          ),
          name: `paperfree-${active}-batch.zip`,
        });
        return;
      }
      const data = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      const output = await processPdf(active as Tool, data, {
        pages,
        angle,
        separate,
      });
      const blob = new Blob([new Uint8Array(output.bytes)], {
        type: output.type,
      });
      setResult({ url: URL.createObjectURL(blob), name: output.name });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try a smaller file.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header>
        <a
          className="brand"
          href="#"
          aria-label="Paperfree home"
          onClick={() => setToolFocused(false)}
        >
          <span className="brandmark">
            <Files size={23} />
          </span>
          paperfree<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          <button className="nav-tool" disabled={busy} onClick={() => choose("merge")}>
            Merge PDF
          </button>
          <button className="nav-tool" disabled={busy} onClick={() => choose("split")}>
            Split PDF
          </button>
          <button className="nav-tool" disabled={busy} onClick={() => choose("compress")}>
            Compress PDF
          </button>
          <details className="header-tools">
            <summary>
              Convert PDF <ChevronDown size={17} />
            </summary>
            <div className="header-tool-menu" aria-label="Choose a conversion tool">
              {tools.filter((item) => item.service || item.id === "images").map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  onClick={(event) => {
                    choose(item.id);
                    event.currentTarget.closest("details")?.removeAttribute("open");
                  }}
                >
                  <item.icon size={18} />
                  {item.title}
                </button>
              ))}
            </div>
          </details>
          <details className="header-tools">
            <summary>
              All PDF tools <ChevronDown size={17} />
            </summary>
            <div className="header-tool-menu" aria-label="Choose a PDF tool">
              {tools.map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  onClick={(event) => {
                    choose(item.id);
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open");
                  }}
                >
                  <item.icon size={18} />
                  {item.title}
                </button>
              ))}
            </div>
          </details>
        </nav>
      </header>
      <main>
        <section id="hero" className={`hero ${toolFocused ? "hero-focused" : ""}`}>
          <div className="eyebrow">
            <Sparkles size={14} /> LESS FRICTION. MORE DONE.
          </div>
          <h1>
            Your PDFs.
            <br />A little more <span>possibility.</span>
          </h1>
          <p>
            Everyday PDF tools, without the everyday hassle.
            <br className="desktop" /> Free to use. Simple by design. Yours to
            keep private.
          </p>
          <div className="hero-badges">
            <span>
              <Check />
              No sign-up
            </span>
            <span>
              <Check />
              Local PDF tools
            </span>
            <span>
              <Check />
              Always open source
            </span>
          </div>
          <div className="paper-art" aria-hidden="true">
            <div className="paper back">
              <i />
              <i />
              <i />
            </div>
            <div className="paper front">
              <FileText size={42} />
              <b>PDF</b>
              <i />
              <i />
            </div>
            <span className="art-badge">
              <ShieldCheck size={23} />
            </span>
            <span className="art-spark">✳</span>
          </div>
          <section
            id="workspace"
            className="workspace"
            aria-labelledby="workspace-title"
          >
            <div className="workspace-head">
              <div>
                <span className={`mini-icon ${tool.color}`}>
                  <tool.icon size={21} />
                </span>
                <h2 id="workspace-title">{tool.title}</h2>
              </div>
              <span>
                <LockKeyhole size={14} />{" "}
                {tool.service
                  ? "Self-hosted conversion"
                  : "Only on your device"}
              </span>
            </div>
            <div className="workspace-body">
              <p className="tool-note">{tool.note}</p>
              {tool.service && (
                <div className="service-panel">
                  <h3>Your conversion service</h3>
                  <p>
                    These tools upload the selected file to your configured
                    server. The supplied service deletes temporary files after
                    processing. Use only a server you trust.
                  </p>
                  <div className="options">
                    <label>
                      Service URL
                      <input
                        type="url"
                        value={endpoint}
                        disabled={busy}
                        onChange={(e) => {
                          setEndpoint(e.target.value);
                          setConsent(false);
                          setServiceStatus("");
                        }}
                      />
                    </label>
                    <label>
                      API key (if configured)
                      <input
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        disabled={busy}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setConsent(false);
                        }}
                      />
                    </label>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      setServiceStatus("Checking…");
                      try {
                        const r = await fetch(
                          `${serviceUrl(endpoint)}/health`,
                          {
                            headers: apiKey ? { "X-API-Key": apiKey } : {},
                            signal: AbortSignal.timeout(5000),
                            credentials: "omit",
                            redirect: "error",
                          },
                        );
                        if (!r.ok) throw new Error();
                        const status = await r.json();
                        setServiceStatus(
                          status.office
                            ? "Connected. LibreOffice is ready."
                            : "Connected. LibreOffice is missing; Office-to-PDF is unavailable.",
                        );
                      } catch {
                        setServiceStatus(
                          "Service unavailable. Start Docker Compose, then check the URL and API key.",
                        );
                      }
                    }}
                  >
                    Check connection
                  </button>
                  <p role="status">{serviceStatus}</p>
                  <small>
                    Local setup: <code>docker compose up --build -d</code>.
                    Settings stay in this tab.
                  </small>
                </div>
              )}

              <div
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (!busy) setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  if (!busy) add(Array.from(e.dataTransfer.files));
                }}
              >
                <span className="upload-icon">
                  <Upload size={27} />
                </span>
                <h3>
                  {files.length
                    ? "Need to add another file?"
                    : `Drop your ${active === "images" ? "images" : tool.service && active.endsWith("-pdf") ? "Office document" : "PDF" + (active === "merge" ? "s" : "")} here`}
                </h3>
                <p>or choose {tool.accept} files from your device</p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  <Upload size={17} />
                  Choose files
                </button>
                <input
                  ref={input}
                  type="file"
                  aria-label="Choose files"
                  accept={tool.accept}
                  multiple={active !== "edit"}
                  onChange={(e) => {
                    add(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                  hidden
                />
                <small>
                  {tool.service
                    ? "Batch conversion · Sent only to the service you configure"
                    : "No fixed file-count limit · Processed in your browser"}
                </small>
              </div>
              {files.length > 0 && (
                <div className="selection">
                  <div className="selection-title">
                    <strong>
                      {files.length} file{files.length > 1 ? "s" : ""} selected
                    </strong>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={reset}
                    >
                      Clear all
                    </button>
                  </div>
                  <ol className="file-list">
                    {files.map((f, i) => (
                      <li key={`${f.name}-${i}`}>
                        <FileText size={20} />
                        <span>
                          <b>{f.name}</b>
                          <small>{(f.size / 1024 / 1024).toFixed(2)} MB</small>
                        </span>
                        <button
                          aria-label={`Move ${f.name} up`}
                          disabled={busy || i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          aria-label={`Move ${f.name} down`}
                          disabled={busy || i === files.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <ChevronDown size={18} />
                        </button>
                        <button
                          aria-label={`Remove ${f.name}`}
                          disabled={busy}
                          onClick={() => {
                            setResult(null);
                            setFiles(files.filter((_, j) => j !== i));
                          }}
                        >
                          <X size={18} />
                        </button>
                      </li>
                    ))}
                  </ol>
                  {(active === "split" || active === "rotate") && (
                    <div className="options">
                      <label>
                        Pages{" "}
                        <input
                          value={pages}
                          disabled={busy}
                          placeholder="All pages, or e.g. 1, 3-5"
                          onChange={(e) => {
                            setPages(e.target.value);
                            setResult(null);
                          }}
                        />
                        <small>
                          Leave blank for all pages. Page numbers start at 1.
                        </small>
                      </label>
                      {active === "split" ? (
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={separate}
                            disabled={busy}
                            onChange={(e) => {
                              setSeparate(e.target.checked);
                              setResult(null);
                            }}
                          />{" "}
                          Save each selected page as a PDF in a ZIP
                        </label>
                      ) : (
                        <label>
                          Clockwise rotation
                          <select
                            value={angle}
                            disabled={busy}
                            onChange={(e) => {
                              setAngle(Number(e.target.value));
                              setResult(null);
                            }}
                          >
                            <option value={90}>90 degrees</option>
                            <option value={180}>180 degrees</option>
                            <option value={270}>270 degrees</option>
                          </select>
                        </label>
                      )}
                    </div>
                  )}
                  {tool.service && (
                    <>
                      {active === "pdf-powerpoint" && (
                        <div className="options">
                          <label>
                            Slide content
                            <select
                              value={mode}
                              disabled={busy}
                              onChange={(e) => {
                                setMode(e.target.value);
                                setResult(null);
                              }}
                            >
                              <option value="default">
                                Visual pages (not editable text)
                              </option>
                              <option value="text">
                                Editable text (simple layout)
                              </option>
                            </select>
                          </label>
                        </div>
                      )}
                      {active === "pdf-excel" && (
                        <div className="options">
                          <label>
                            Extraction mode
                            <select
                              value={mode}
                              disabled={busy}
                              onChange={(e) => {
                                setMode(e.target.value);
                                setResult(null);
                              }}
                            >
                              <option value="default">Detect tables</option>
                              <option value="rows">Text rows</option>
                            </select>
                          </label>
                        </div>
                      )}
                      <label className="upload-consent">
                        <input
                          type="checkbox"
                          checked={consent}
                          disabled={busy}
                          onChange={(e) => setConsent(e.target.checked)}
                        />
                        Send these files to {endpoint} for conversion.
                      </label>
                    </>
                  )}
                  {active === "edit" && (
                    <PdfEditor
                      key={files[0].name + files[0].lastModified}
                      file={files[0]}
                      onChange={() => setResult(null)}
                      onReady={(blob, name) =>
                        setResult({ url: URL.createObjectURL(blob), name })
                      }
                    />
                  )}
                  {active !== "edit" && (
                    <button
                      className="primary process"
                      disabled={busy}
                      onClick={run}
                    >
                      {busy
                        ? tool.service
                          ? "Converting on your service…"
                          : "Processing on your device…"
                        : tool.action}
                    </button>
                  )}
                </div>
              )}
              <div aria-live="polite" aria-atomic="true">
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                {result && (
                  <div className="success">
                    <span>
                      <Check size={22} />
                      <b>Your file is ready.</b>
                    </span>
                    <a
                      className="primary"
                      href={result.url}
                      download={result.name}
                    >
                      <Download size={17} />
                      Download {result.name.split(".").pop()?.toUpperCase()}
                    </a>
                  </div>
                )}
              </div>
            </div>
            <div className="workspace-foot">
              <ShieldCheck size={17} />{" "}
              {tool.service
                ? "Files are sent to your service only after you confirm and start conversion."
                : "Private by default. This tool processes files locally in your browser."}
            </div>
          </section>
        </section>
        <section id="tools" className="tools">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SMALL TOOLS. BIG DIFFERENCE.</span>
              <h2>Make light work of paperwork.</h2>
            </div>
            <span className="tool-count">12 tools. Zero paywalls.</span>
          </div>
          <div className="tool-grid">
            {tools.map((t) => (
              <button
                key={t.id}
                className={`tool-card ${t.color} ${active === t.id ? "selected" : ""}`}
                onClick={() => choose(t.id)}
                aria-pressed={active === t.id}
                disabled={busy}
              >
                <span className="tool-icon">
                  <t.icon size={25} />
                </span>
                <h3>{t.title}</h3>
                <p>{t.description}</p>
                <span className="card-bottom">
                  {active === t.id ? "Selected tool" : "Use this tool"}
                  {active === t.id && <Check size={16} />}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="privacy" id="privacy">
          <div className="privacy-symbol">
            <ShieldCheck size={35} />
          </div>
          <div>
            <span className="eyebrow">YOUR DOCUMENTS. YOUR BUSINESS.</span>
            <h2>
              Local when possible.
              <br />
              Your server when needed.
            </h2>
            <p>
              Merge, split, rotate, images, and editing run in this tab.
              Compression and Office conversions send files to your chosen
              self-hosted service with your confirmation. No accounts or
              tracking analytics. Downloaded files stay on your device.
            </p>
          </div>
          <div className="privacy-notes">
            <div>
              <b>Free, with practical limits</b>
              <p>
                Select as many files as your device and server can handle. Batch
                conversions run concurrently; very large jobs can still fail if
                memory or time runs out.
              </p>
            </div>
            <div>
              <b>Honest conversion limits</b>
              <p>
                PDF-to-Office exports offer text/table extraction or visual
                slides, not perfect reconstruction. OCR and password removal are
                not included.
              </p>
            </div>
          </div>
        </section>
        <section className="faq">
          <h2>A few things worth knowing.</h2>
          <details>
            <summary>Can I use sensitive documents?</summary>
            <p>
              Local tools keep file contents in your browser. Service tools
              upload only to the URL shown in the conversion panel. The supplied
              service removes temporary files before returning a result, but
              other operators may have different policies. Use trusted devices
              and services, and follow your organization’s rules.
            </p>
          </details>
          <details>
            <summary>Will everything in my original PDF be preserved?</summary>
            <p>
              These tools focus on page content. Bookmarks, interactive forms,
              attachments, and digital signatures may not survive page copying
              or edits. Keep your originals and check downloaded results before
              using them.
            </p>
          </details>
          <details>
            <summary>What image formats are supported?</summary>
            <p>
              JPEG and PNG. Each image gets its own A4 page with margins,
              automatically oriented to fit. Other formats and animated images
              are not supported.
            </p>
          </details>
        </section>
      </main>
      <footer>
        <a className="brand" href="#">
          <span className="brandmark">
            <Files size={18} />
          </span>
          paperfree.
        </a>
        <span>A little less paperwork. A little more freedom.</span>
        <a href="https://github.com/Hastha26/free-pdf-toolkit">
          Built in the open <CodeXml size={16} />
        </a>
      </footer>
    </>
  );
}
