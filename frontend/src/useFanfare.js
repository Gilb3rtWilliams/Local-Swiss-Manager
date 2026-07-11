// Plays the victory fanfare when a tournament finishes.
// The file lives in /public (frontend/public/victory.mp3), which Vite serves
// unprocessed from the site root — so it's reachable at "/victory.mp3"
// regardless of which route is currently active. Don't import it as a
// module asset; a plain absolute path is all that's needed here.

let audio = null;

export function playFanfare() {
  try {
    if (!audio) {
      audio = new Audio("/victory13.mp3");
      audio.volume = 0.8;
    }
    audio.currentTime = 0;
    audio.play().catch((err) => {
      // Browsers can block audio playback until the user has interacted
      // with the page at least once (autoplay policy). Since this fires
      // from a useEffect reacting to state rather than directly inside a
      // click handler, that block can occasionally still apply even though
      // submitting the final round's results was itself a real click.
      // Swallow it here rather than letting an unhandled rejection surface —
      // there's nothing actionable to do about it after the fact.
      console.warn("Victory fanfare didn't play:", err.message);
    });
  } catch (err) {
    console.error("Could not play victory fanfare:", err);
  }
}
