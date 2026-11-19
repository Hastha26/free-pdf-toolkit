"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PDFDocument, degrees } from "pdf-lib";
import { openPdf } from "@/lib/viewer";

type Mark = {
  page: number;
  kind: "text" | "rectangle" | "pen" | "image";
  points: number[][];
  text: string;
  color: string;
  size: number;
  image?: string;
  aspect?: number;
};
export default function PdfEditor({
  file,
  onReady,
  onChange,
}: {
  file: File;
  onChange: () => void;
  onReady: (blob: Blob, name: string) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [kind, setKind] = useState<Mark["kind"]>("text");
  const [text, setText] = useState("Your text");
  const [color, setColor] = useState("#6653d9");
  const [size, setSize] = useState(22);
  const [image, setImage] = useState("");
  const [aspect, setAspect] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dimensions, setDimensions] = useState({
    width: 600,
    height: 800,
    scale: 1,
  });
  const canvas = useRef<HTMLCanvasElement>(null);
  const gesture = useRef<Mark | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let dispose: (() => Promise<void>) | undefined;
    setError("");
    setMarks([]);
    setPage(1);
    setReady(false);
    file
      .arrayBuffer()
      .then((b) => openPdf(new Uint8Array(b)))
      .then(({ doc: d, dispose: release }) => {
        dispose = release;
        if (cancelled) return release();

        setDoc(d);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Unable to open this PDF. Use a valid, unencrypted document ",
          );
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [file]);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let task: { cancel: () => void } | undefined;
    setReady(false);
    (async () => {
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({
        scale: Math.min(1.5, 1600 / Math.max(base.width, base.height)),
      });
      if (cancelled || !canvas.current) return;
      const c = canvas.current;
      c.width = viewport.width;
      c.height = viewport.height;
      setDimensions({
        width: viewport.width,
        height: viewport.height,
        scale: viewport.scale,
      });
      const render = p.render({
        canvas: c,
        canvasContext: c.getContext("2d")!,
        viewport,
      });
      task = render;
      await render.promise;
      if (!cancelled) setReady(true);
    })().catch((e) => {
      if (!cancelled && e?.name !== "RenderingCancelledException")
        setError("This page could not be displayed.");
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page]);
  useEffect(() => {
    onChange();
  }, [marks]);
  function point(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
  }
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (!ready || busy) return;
    if (kind === "image" && !image) {
      setError("Choose a PNG or JPG for the image tool first.");
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const mark: Mark = {
      page,
      kind,
      points: [point(e)],
      text,
      color,
      size,
      image: kind === "image" ? image : undefined,
      aspect,
    };
    gesture.current = mark;
    setMarks((old) => [...old, mark]);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    if (
      !gesture.current ||
      !["pen", "rectangle"].includes(gesture.current.kind)
    )
      return;
    const mark = {
      ...gesture.current,
      points:
        gesture.current.kind === "pen"
          ? [...gesture.current.points, point(e)]
          : [gesture.current.points[0], point(e)],
    };
    gesture.current = mark;
    setMarks((old) => [...old.slice(0, -1), mark]);
  }
  async function exportPdf() {
    if (!doc || !marks.length) return;
    setBusy(true);
    setError("");
    try {
      const output = await PDFDocument.load(await file.arrayBuffer());
      for (const number of new Set(marks.map((m) => m.page))) {
        const original = await doc.getPage(number);
        const viewport = original.getViewport({ scale: 1 });
        const layer = document.createElement("canvas");
        const scale = Math.min(
          2,
          2000 / Math.max(viewport.width, viewport.height),
        );
        layer.width = viewport.width * scale;
        layer.height = viewport.height * scale;
        const ctx = layer.getContext("2d")!;
        for (const mark of marks.filter((m) => m.page === number)) {
          const [x, y] = mark.points[0].map(
            (v, i) => v * (i === 0 ? layer.width : layer.height),
          );
          ctx.fillStyle = mark.color;
          ctx.strokeStyle = mark.color;
          ctx.lineWidth = 2 * scale;
          ctx.lineCap = "round";
          if (mark.kind === "text") {
            ctx.font = `${mark.size * scale}px Arial`;
            ctx.fillText(mark.text, x, y);
          }
          if (mark.kind === "rectangle" && mark.points[1])
            ctx.strokeRect(
              x,
              y,
              (mark.points[1][0] - mark.points[0][0]) * layer.width,
              (mark.points[1][1] - mark.points[0][1]) * layer.height,
            );
          if (mark.kind === "pen") {
            ctx.beginPath();
            mark.points.forEach((p, i) =>
              i
                ? ctx.lineTo(p[0] * layer.width, p[1] * layer.height)
                : ctx.moveTo(p[0] * layer.width, p[1] * layer.height),
            );
            ctx.stroke();
          }
          if (mark.kind === "image" && mark.image) {
            const img = new Image();
            img.src = mark.image;
            await img.decode();
            ctx.drawImage(
              img,
              x,
              y,
              layer.width * 0.25,
              (layer.width * 0.25 * img.height) / img.width,
            );
          }
        }
        const png = await output.embedPng(layer.toDataURL("image/png"));
        const [x, y] = viewport.convertToPdfPoint(0, viewport.height);
        output.getPage(number - 1).drawImage(png, {
          x,
          y,
          width: viewport.width,
          height: viewport.height,
          rotate: degrees(original.rotate),
        });
        layer.width = 0;
        layer.height = 0;
      }
      if (mounted.current)
        onReady(
          new Blob([new Uint8Array(await output.save())], {
            type: "application/pdf",
          }),
          "paperfree-edited.pdf",
        );
    } catch {
      setError("Could not save the edited PDF. Please try a smaller document.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="editor">
      <h3>Edit your PDF</h3>
      <p className="tool-note">
        Add content on top of the page. Existing text cannot be rewritten;
        covering text is not secure redaction. Keep your original.
      </p>
      <div className="editor-toolbar">
        {(kind === "text" || kind === "image") && (
          <button
            className="secondary"
            disabled={!ready || busy || (kind === "image" && !image)}
            onClick={() =>
              setMarks((old) => [
                ...old,
                {
                  page,
                  kind,
                  points: [[0.1, 0.2]],
                  text,
                  color,
                  size,
                  image: kind === "image" ? image : undefined,
                  aspect,
                },
              ])
            }
          >
            Place near top
          </button>
        )}
        <label>
          Tool
          <select
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value as Mark["kind"])}
          >
            <option value="text">Text</option>
            <option value="rectangle">Rectangle</option>
            <option value="pen">Freehand</option>
            <option value="image">Image</option>
          </select>
        </label>
        <label>
          Color
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        {kind === "text" && (
          <>
            <label>
              Text
              <input
                value={text}
                maxLength={500}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <label>
              Size
              <input
                type="number"
                min={8}
                max={72}
                value={size}
                onChange={(e) =>
                  setSize(
                    Math.max(8, Math.min(72, Number(e.target.value) || 8)),
                  )
                }
              />
            </label>
          </>
        )}
        {kind === "image" && (
          <label>
            PNG or JPG
            <input
              type="file"
              accept=".png,.jpg,.jpeg"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) {
                  setError("Use an image smaller than 5 MB.");
                  return;
                }
                const reader = new FileReader();
                reader.onload = async () => {
                  try {
                    const img = new Image();
                    img.src = String(reader.result);
                    await img.decode();
                    setAspect(img.height / img.width);
                    setImage(img.src);
                  } catch {
                    setError("Choose a valid PNG or JPEG.");
                  }
                };
                reader.readAsDataURL(f);
              }}
            />
          </label>
        )}
        <button
          className="secondary"
          disabled={!marks.length || busy}
          onClick={() => setMarks((m) => m.slice(0, -1))}
        >
          Undo
        </button>
        <button
          className="secondary"
          disabled={!marks.length || busy}
          onClick={() => setMarks([])}
        >
          Clear marks
        </button>
      </div>
      <div className="editor-pager">
        <button
          disabled={page === 1 || busy}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {doc?.numPages ?? "â€¦"}
        </span>
        <button
          disabled={!doc || page === doc.numPages || busy}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      <p className="tool-note">
        {ready
          ? "Click to place text or images. Drag to draw rectangles or freehand marks."
          : "Loading pageâ€¦"}
      </p>
      <div
        className="editor-page"
        style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}
      >
        <canvas ref={canvas} />
        <svg
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={() => {
            gesture.current = null;
          }}
          onPointerCancel={() => {
            gesture.current = null;
          }}
          aria-label="PDF annotation canvas"
        >
          {marks
            .filter((m) => m.page === page)
            .map((m, i) => {
              const [x, y] = [
                m.points[0][0] * dimensions.width,
                m.points[0][1] * dimensions.height,
              ];
              if (m.kind === "text")
                return (
                  <text
                    key={i}
                    x={x}
                    y={y}
                    fill={m.color}
                    fontSize={m.size * dimensions.scale}
                  >
                    {m.text}
                  </text>
                );
              if (m.kind === "image")
                return (
                  <image
                    key={i}
                    href={m.image}
                    x={x}
                    y={y}
                    width={dimensions.width * 0.25}
                    height={dimensions.width * 0.25 * (m.aspect ?? 1)}
                    preserveAspectRatio="xMinYMin meet"
                  />
                );
              if (m.kind === "rectangle" && m.points[1])
                return (
                  <rect
                    key={i}
                    x={Math.min(x, m.points[1][0] * dimensions.width)}
                    y={Math.min(y, m.points[1][1] * dimensions.height)}
                    width={Math.abs(m.points[1][0] * dimensions.width - x)}
                    height={Math.abs(m.points[1][1] * dimensions.height - y)}
                    fill="none"
                    stroke={m.color}
                    strokeWidth={2 * dimensions.scale}
                  />
                );
              return (
                <polyline
                  key={i}
                  points={m.points
                    .map(
                      (p) =>
                        `${p[0] * dimensions.width},${p[1] * dimensions.height}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={m.color}
                  strokeWidth={2 * dimensions.scale}
                />
              );
            })}
        </svg>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary process"
        disabled={!ready || !marks.length || busy}
        onClick={exportPdf}
      >
        {busy ? "Savingâ€¦" : "Save edited PDF"}
      </button>
    </div>
  );
}
