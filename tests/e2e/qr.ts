import { expect, type Locator } from "@playwright/test";
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
      return { width, height, values: Array.from(context.getImageData(0, 0, width, height).data) };
    } finally { URL.revokeObjectURL(url); }
  });
  const decoded = jsQR(Uint8ClampedArray.from(pixels.values), pixels.width, pixels.height);
  expect(Boolean(decoded), "The displayed QR code must decode from its rendered pixels.").toBe(true);
  return decoded!.data;
}
