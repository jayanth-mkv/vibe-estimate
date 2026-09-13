import { expect, type Locator } from "@playwright/test";
import { Buffer } from "node:buffer";
import jsQR from "jsqr";

/** Decode the rendered SVG as pixels, independently of the QR encoder. */
export async function decodedQr(locator: Locator): Promise<string> {
  await expect(locator).toBeVisible();
  const pixels = await locator.evaluate(async (element: SVGSVGElement) => {
    const bounds = element.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * 2));
    const height = Math.max(1, Math.round(bounds.height * 2));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("A canvas is required to verify the invitation image.");
    const image = new Image();
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(element)], { type: "image/svg+xml" }));
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("The invitation image could not be rendered."));
        image.src = url;
      });
      context.drawImage(image, 0, 0, width, height);
      const bytes = context.getImageData(0, 0, width, height).data;
      // Keep one compact string across the browser protocol instead of hundreds
      // of thousands of individually serialized/traced numeric values.
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return { width, height, base64: btoa(binary) };
    } finally { URL.revokeObjectURL(url); }
  });
  const decoded = jsQR(Uint8ClampedArray.from(Buffer.from(pixels.base64, "base64")), pixels.width, pixels.height);
  expect(Boolean(decoded), "The displayed QR code must decode from its rendered pixels.").toBe(true);
  return decoded!.data;
}
