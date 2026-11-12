"use client";

import { useState } from "react";
import s from "./workspace.module.css";

export function SpaceImageInput({ initialImage, onProcessing }: {
  initialImage?: string | null;
  onProcessing: (processing: boolean) => void;
}) {
  const [image, setImage] = useState(initialImage ?? "");
  const [error, setError] = useState("");
  const [processing, setProcessing] = useState(false);
  return (
    <div>
      <input type="hidden" name="imageData" value={image} />
      <label>
        Space image
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={processing}
          onChange={async (event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (!file) return;
            setError("");
            if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
              setError("Choose a JPG, PNG or WebP image up to 10 MB.");
              return;
            }
            setProcessing(true);
            onProcessing(true);
            const url = URL.createObjectURL(file);
            try {
              const source = new Image();
              source.src = url;
              await source.decode();
              const canvas = document.createElement("canvas");
              const scale = Math.min(1, 960 / Math.max(source.width, source.height));
              canvas.width = Math.max(1, Math.round(source.width * scale));
              canvas.height = Math.max(1, Math.round(source.height * scale));
              const context = canvas.getContext("2d");
              if (!context) throw new Error();
              context.fillStyle = "white";
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(source, 0, 0, canvas.width, canvas.height);
              let result = canvas.toDataURL("image/jpeg", 0.8);
              while (result.length > 65000 && canvas.width > 160 && canvas.height > 160) {
                const smaller = document.createElement("canvas");
                smaller.width = Math.round(canvas.width * 0.8);
                smaller.height = Math.round(canvas.height * 0.8);
                smaller.getContext("2d")!.drawImage(canvas, 0, 0, smaller.width, smaller.height);
                canvas.width = smaller.width;
                canvas.height = smaller.height;
                context.drawImage(smaller, 0, 0);
                result = canvas.toDataURL("image/jpeg", 0.75);
              }
              if (result.length > 65000) throw new Error();
              setImage(result);
            } catch {
              setError("Unable to process this image. Please choose another file.");
            } finally {
              URL.revokeObjectURL(url);
              setProcessing(false);
              onProcessing(false);
            }
          }} />
      </label>
      <p>JPG, PNG or WebP, up to 10 MB. Images are resized for storage.</p>
      {processing && <p role="status">Preparing image…</p>}
      {error && <p role="alert">{error}</p>}
      {image && <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={s.spaceImagePreview} src={image} alt="Space image preview" />
        <button type="button" disabled={processing} onClick={() => setImage("")}>Remove image</button>
      </>}
    </div>
  );
}
