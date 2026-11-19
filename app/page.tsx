"use client";
import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Files,
  Scissors,
  RotateCw,
  ImagePlus,
  ShieldCheck,
  CodeXml,
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

const tools = [
  {
    id: "merge" as Tool,
    title: "Merge PDF",
    description:
      "Bring your documents together. Combine multiple PDFs into one.",
    icon: Files,
    color: "violet",
    action: "Merge PDFs",
  },
  {
    id: "split" as Tool,
    title: "Split PDF",
    description:
      "Keep just what you need. Extract pages or save them separately.",
    icon: Scissors,
    color: "coral",
    action: "Split PDF",
  },
  {
    id: "rotate" as Tool,
    title: "Rotate PDF",
    description:
      "A fresh perspective. Turn selected pages the right way around.",
    icon: RotateCw,
    color: "blue",
    action: "Rotate PDF",
  },
  {
    id: "images" as Tool,
    title: "Images to PDF",
    description: "Give your images a home. Turn JPGs and PNGs into a PDF.",
    icon: ImagePlus,
    color: "green",
    action: "Create PDF",
  },
];
export default function Home() {
  const [active, setActive] = useState<Tool>("merge");
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
    if (input.current) input.current.value = "";
  }
  function choose(id: Tool) {
    if (busy) return;
    reset();
    setActive(id);
  }
  function add(incoming: File[]) {
    setError("");
    setResult(null);
    const valid = incoming.every((f) =>
      active === "images"
        ? /\.(jpe?g|png)$/i.test(f.name)
        : /\.pdf$/i.test(f.name),
    );
    if (!valid) {
      setError(
        active === "images"
          ? "Please choose JPG or PNG images."
          : "Please choose PDF files.",
      );
      return;
    }
    const next =
      active === "split" || active === "rotate"
        ? incoming
        : [...files, ...incoming];
    if ((active === "split" || active === "rotate") && next.length > 1) {
      setError("This tool accepts one PDF at a time.");
      return;
    }
    if (
      next.length > 100 ||
      next.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024
    ) {
      setError(
        "Choose up to 100 files, with a combined size of 100 MB or less.",
      );
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
      const { processPdf } = await import("@/lib/pdf");
      const data = await Promise.all(
        files.map(async (f) => ({
          name: f.name,
          bytes: new Uint8Array(await f.arrayBuffer()),
        })),
      );
      const output = await processPdf(active, data, { pages, angle, separate });
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
        <a className="brand" href="#" aria-label="Paperfree home">
          <span className="brandmark">
            <Files size={23} />
          </span>
          paperfree<span className="brand-dot">.</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#tools">PDF tools</a>
          <a href="#privacy">Your privacy</a>
          <a
            className="github"
            href="https://github.com/Hastha26/free-pdf-toolkit"
          >
            <CodeXml size={17} /> <span>Open source</span>
          </a>
        </nav>
      </header>
      <main>
        <section className="hero">
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
              No uploads
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
        </section>
        <section id="tools" className="tools">
          <div className="section-heading">
            <div>
              <span className="eyebrow">SMALL TOOLS. BIG DIFFERENCE.</span>
              <h2>Make light work of paperwork.</h2>
            </div>
            <span className="tool-count">4 tools. Zero paywalls.</span>
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
        <section className="workspace" aria-labelledby="workspace-title">
          <div className="workspace-head">
            <div>
              <span className={`mini-icon ${tool.color}`}>
                <tool.icon size={21} />
              </span>
              <h2 id="workspace-title">{tool.title}</h2>
            </div>
            <span>
              <LockKeyhole size={14} /> Only on your device
            </span>
          </div>
          <div className="workspace-body">
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
                  : `Drop your ${active === "images" ? "images" : "PDF" + (active === "merge" ? "s" : "")} here`}
              </h3>
              <p>
                or choose{" "}
                {active === "images" ? "JPG and PNG images" : "PDF files"} from
                your device
              </p>
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
                accept={active === "images" ? ".jpg,.jpeg,.png" : ".pdf"}
                multiple={active === "merge" || active === "images"}
                onChange={(e) => {
                  add(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
                hidden
              />
              <small>Up to 100 MB total · Files never leave your browser</small>
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
                <button
                  className="primary process"
                  disabled={busy}
                  onClick={run}
                >
                  {busy ? "Processing on your device…" : tool.action}
                </button>
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
                    Download {result.name.endsWith("zip") ? "ZIP" : "PDF"}
                  </a>
                </div>
              )}
            </div>
          </div>
          <div className="workspace-foot">
            <ShieldCheck size={17} /> Private by default. Your files are
            processed locally, never uploaded.
          </div>
        </section>
        <section className="privacy" id="privacy">
          <div className="privacy-symbol">
            <ShieldCheck size={35} />
          </div>
          <div>
            <span className="eyebrow">YOUR DOCUMENTS. YOUR BUSINESS.</span>
            <h2>
              What happens in your browser,
              <br />
              stays in your browser.
            </h2>
            <p>
              No file uploads, accounts, or tracking analytics. Files stay in
              this tab’s memory while you work. Clear your selection or close
              the tab to release them; downloaded files remain on your device.
            </p>
          </div>
          <div className="privacy-notes">
            <div>
              <b>Free, with practical limits</b>
              <p>
                Up to 100 files and 100 MB per operation. Large documents may
                need more memory or time.
              </p>
            </div>
            <div>
              <b>Focused on the essentials</b>
              <p>
                Office conversion, OCR, password removal, and advanced
                compression are outside this first release.
              </p>
            </div>
          </div>
        </section>
        <section className="faq">
          <h2>A few things worth knowing.</h2>
          <details>
            <summary>Can I use sensitive documents?</summary>
            <p>
              The app does not send your document contents to a server or store
              them in browser storage. Your host still receives normal page
              requests and may log connection information. Use a trusted device
              and follow your organization’s rules.
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
