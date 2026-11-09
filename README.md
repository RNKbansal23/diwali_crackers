# Diwali Studio

A local-first camera playground with five interactive firework effects, photos, video recording, synthesized firework audio, optional microphone mixing, and downloads. React, TypeScript and Canvas 2D keep the app small and usable without a GPU-specific dependency.

## Run

```sh
npm install
npm run dev
```

On Windows PowerShell with restricted script execution, use `npm.cmd` instead of `npm`.

Open http://localhost:5173 on this computer. For a phone, serve the production build over HTTPS (a plain LAN HTTP address cannot request the camera). Run `npm run build` to create `dist/`, then host that directory with any HTTPS static hosting service. No server API or account is needed.

## Use

Enable the camera, choose an effect, and tap the preview. Photo captures the current composited frame. Record video starts/stops a clip containing the camera, effects and enabled sound. The microphone toggle requests audio only when recording starts. Open Your moments and download files before closing or refreshing the app. Media is retained in session memory, not uploaded. Saved videos use a supported MP4 or WebM format; photos use PNG.

Ground effects are positioned in screen coordinates, not tracked real-world planes. The demo background is generated locally. Recording stops and finalizes when the page goes into the background. Browser/OS memory limits can affect long recordings; this version is intended for short clips. The service worker caches visited production assets for subsequent offline use; the first visit needs a connection. Installation support varies by browser.

## Verification checklist on actual devices

- Grant and deny camera permission; switch between front and rear cameras.
- Tap each effect and verify portrait/landscape tap alignment and mirrored front camera.
- Record 10–30 seconds with sound on/off and microphone on/off; download and play the file outside the browser.
- Take a photo while recording, clear effects, and open the gallery.
- Background the app during recording and verify the finalized clip.
- Test low-memory phones, rotation, keyboard controls and HTTPS camera access.

## Hand gestures

Enable your camera, then turn on **Hand gestures**. For an easy first test, switch to the front camera and keep your hands separated in good lighting. Up to four hands are detected, with independent pose, charge, cooldown and aiming state. Brief pose consensus, lower detection thresholds and 640-pixel input improve acquisition; overlapping hands and motion blur can still interrupt tracking. IDs are matched by wrist proximity and may swap when hands cross.

- **Point:** extend the index finger, tuck the thumb and fold the other fingers. Hold the aiming cursor in one area for 0.7 seconds for a sparkler. Move to another area or change pose to re-arm.
- **Pinch:** touch thumb and index fingertips together for a moment for a flowerpot at the pinch position. Release before triggering again.
- **Palm:** spread all fingers and hold for roughly half a second to launch a sky bloom. Change pose before triggering again.
- **Peace sign:** extend index and middle fingers with the thumb tucked for a chakri.
- **Fist:** close all fingers and hold briefly for a pop cracker.
- **Finger rocket:** extend index and middle fingers and stick the thumb out. A glowing orb and charge ring follow the fingertips. Hold for 0.55 seconds, then flick your wrist or fingers to fire a rocket that travels roughly 30% of the shorter preview dimension and bursts. Each hand has its own charge and a 0.9-second shot cooldown. Expand Gesture guide to adjust flick sensitivity. Fast movement, blur or occlusion may briefly lose tracking; a lost track does not count as a flick.
- **Happy Diwali banner:** hold two L-shaped hands (index finger and thumb out), or two open palms, side by side for a moment. A ribbon appears between the hands and follows their position, separation and angle. Paired palms display the banner rather than also launching individual palm fireworks. Lower either hand or change pose to dismiss it.

The hand outlines, charge orbs, rockets and banner are included in captured photos and videos. Tracking pauses while a gallery/help dialog is open. Detection runs in a worker, with at most one frame in flight and a cap around 16 frames per second; actual speed depends on hardware and number of hands. Rendering and recording remain separate. Geometry-based gestures may need adjustment for different hand angles and lighting.

Sky blooms and rocket bursts use XYZ particle positions, a perspective camera projection and depth sorting. Rockets travel into the scene, shrinking with distance, with trails and shaded spherical charge orbs. The banner is a stylized shaded ribbon. This is screen-composited 3D, with no real-world plane anchors, object occlusion or scene depth measurement. Other ground effects remain screen-based.

The app includes MediaPipe Tasks Vision 0.10.17 and matching WASM files under `public/vendor/mediapipe/`, with Apache license and attribution. The classic worker loads the actual CommonJS bundle with an `exports` shim; no CDN script is needed. The hand model is downloaded separately from Google storage (with browser caching), so the initial model download still requires internet access. Progress and errors distinguish runtime loading, model downloading, and WASM initialization. Camera frames are processed locally and are not uploaded. Gesture assets are not fully bundled for guaranteed offline use.

Run worker-loader regression checks with `node --test tests/hand-loader.test.mjs`. These simulate initialization and error reporting; they do not replace live camera tests.

Run all gesture/loader checks with `node --experimental-strip-types --test tests/gestures.test.mjs tests/hand-loader.test.mjs` on Node 22. Tests cover pose separation, reordered hand IDs, charge/flick/cooldown behavior, tracking gaps, paired framing, 3D projection, worker results and asset initialization. Test physical hands, slow devices, camera switching, and recordings on the intended devices as well.

With the Vite server running, `node tests/browser-smoke.mjs` exercises the app in headless Chrome using a fake camera and synthetic hand landmarks. It covers multi-hand banner activation, four concurrent hands, charged gun/flick/projectile pop, photo capture, gallery pause/resume and mobile overflow. Set `CHROME_PATH` if Chrome is installed elsewhere. This test checks app behavior, not the accuracy of the real MediaPipe detector.

## Future work

Real floor tracking with ARCore/ARKit or supported WebXR needs a separate camera-compositing and recording prototype. Native gallery integration and WhatsApp/virtual-camera integration are not included.
