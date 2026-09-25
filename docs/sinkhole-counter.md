# Sinkhole shared counter and rings

The altar floor now uses three concentric procedural neon rings instead of the star texture. Particle and beam effects are preserved.

The counter subscribes to Firestore worldCounters/sinkhole and displays the shared server-confirmed count. Every completed entry performs a transaction increment, so simultaneous devices do not overwrite each other. The first successful jump creates the document. Player lock state prevents repeat counting during respawn. No personal local counter is used. Offline failed transactions are reported and are not silently presented as saved.

Deployment prerequisite: publish the complete updated firestore.rules file through Firebase Console → Firestore Database → Rules for project motri-4ed44. GitHub Pages deployment does not deploy Firestore rules. Keep the existing whispers and circuitLeaderboard rules; the new worldCounters rule is additive. Until rules are published, the counter shows an ellipsis and writes are denied. Anonymous sign-in uses the existing game setup.

Validation: JavaScript syntax and a simulated transaction-conflict test with 40 concurrent jumps and snapshot cache handling. Live Firebase authorization and cross-device operation require publishing the rules and have not been verified here.
