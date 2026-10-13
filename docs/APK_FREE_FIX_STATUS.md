# APK free booking import and pin scheduling

Base: feat/vision-crosscheck (0a58dd8810f38fac1b732b816ded5c879348bc4e).
Working branch: fix/native-booking-and-routing.

## Changed behavior

- One screenshot/camera importer per booking form. APK images stay on the device.
- Bundled ML Kit Korean/Latin OCR runs sequentially; empty OCR and permissions failures are reported instead of swallowed.
- Korean/English labeled booking fields and Korean date/time formats fill the existing editable form.
- Success/failure status only, with a copyable diagnostic on failure. Incomplete extraction fills available fields but reports failure; unknown fields are never fabricated.
- No cloud key prompt or paid API dependency in the APK import flow.
- Required fields and date validation prevent blank reservations in the form, native SQLite create path, and server create path.
- Accommodation addresses are visible and open map search. Native accommodation changes invalidate the linked itinerary cache.
- APK uses locally bundled Leaflet 1.9.4 and OpenStreetMap tiles, not a Google key-dependent map. Tiles require internet.
- Map taps save coordinates to the selected day's SQLite itinerary. Existing places without coordinates can be assigned a pin.
- Fixed first stop, open visiting route; device DP finds exact minimum for <=12 stops, nearest-neighbor/2-opt for 13-25. OSRM road-time matrix is fetched online. If unavailable, clearly labeled straight-distance estimates are used.
- Start time and stay duration produce a preview schedule. Existing visiting times change only after explicit application; midnight overflow is rejected.
- Map line joins stops; it is not turn-by-turn road geometry.

## Validation

PASS: node scripts/check-local-booking.mjs (Korean bookings/dates, blank and invalid reservation rejection, asymmetric road matrix versus brute-force minimum, larger-route uniqueness, authored TS/TSX syntax).
PASS: strict TypeScript check for shared vision/parser/validation/route modules.

NOT RUN: full dependency installation/typecheck/frontend build/Android build. This environment blocks registry.npmjs.org downloads. Java 21/Android SDK are also not installed here.
NOT RUN: browser render/device end-to-end test. No browser executable is available in the container.

GitHub Actions workflow is prepared to install dependencies, run local tests/full checks, build web assets, generate the native Android project, and publish a debug APK artifact. It has not been uploaded or run.

## Limits needing real-device acceptance

OCR plus explicit-field parsing is not a general multimodal language model. Unlabeled, multi-leg, visually unusual, or low-resolution booking screenshots may yield incomplete fields. No claim of universal booking-screen recognition is made. Test the user's actual flight, hotel, and rental screenshots before marking this requirement complete.

Public map/road services have availability and usage limits; no paid fallback is enabled. Existing stored pin coordinates work without geocoding. Debug APK signatures must match the currently installed app to update without uninstalling or losing local data. No new APK is yet available.
