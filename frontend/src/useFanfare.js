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
      // Audio Names
      // victory.mp3 - Clarion -Scott Buckley
      // victory2.mp3 - Stars in Her Skies - Scott Buckley
      // victory3.mp3 - Can't hold us - Macklemore & Ryan Lewis
      // victory4.mp3 - Hall Of Fame - The Script
      // victory5.mp3 - Live Your Life - Rihanna & TI
      // victory6.mp3 - All She Wrote - Eminem & TI
      // victory7.mp3 - Throne - Bring Me The Horizon
      // victory8.mp3 - Invincible -MGK & Ester Dean
      // victory9.mp3 - Born For Greatness - Papa Roach
      // victory10.mp3 - Bad To the Bone - George Thorogood & The Destroyers
      // victory11.mp3 - Legendary - Welshly Arms
      // victory12.mp3 - Legend - The Score
      // victory13.mp3 - Victory - Music for Video
      // victory14.mp3 - Champion - Bishop Briggs
      // victory15.mp3 - The Winner Takes It All - ABBA
      // victory16.mp3 - GTA 4 Theme
      // victory17.mp3 - GTA San Andreas Theme
      // victory18.mp3 - Heart Of Courage - Two Steps From Hell
      // victory19.mp3 - Succeed - AshamaluevMusic
      // victory20.mp3 - Skins - KREZUS

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
