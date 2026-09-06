"use strict";
const video = document.getElementById("demo-video");
const status = document.getElementById("playback-status");

for (const button of document.querySelectorAll("button[data-time]")) {
  button.addEventListener("click", async () => {
    const time = Number(button.dataset.time);
    if (!Number.isFinite(time) || time < 0 || time > 175.6) return;
    video.currentTime = time;
    try {
      await video.play();
      status.textContent = "Chapter: " + button.children[1].textContent + ".";
      video.scrollIntoView({ block: "center", behavior: "instant" });
      video.focus({ preventScroll: true });
    } catch {
      status.textContent = "Playback could not start. Use the player controls, download the video, or read the transcript below.";
    }
  });
}
video.addEventListener("error", () => {
  status.textContent = "The video could not load. Try the download link or read the complete transcript below.";
}, { capture: true });
