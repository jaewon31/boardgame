# User sound replacements

- oxidvideos-placing-poker-chips-522515.mp3 → bet-user.wav
- oxidvideos-placing-poker-chips-522521.mp3 → raise-user.wav
- oxidvideos-taking-playing-card-3-522513.mp3 → deal-user.wav
- freesound_community-shuffling-cards-01-86984.mp3 → shuffle-user.wav
- freesound_community-allinpushchips-96121.mp3 → allin-user.wav

User supplied on 2026-11-09. Decoded to PCM16 mono 44.1 kHz with no trimming or gain adjustment. Original licenses are not relabeled as Kenney/CC0. Bet only is replaced; call retains chips-bet.wav. Deal and all board reveals share deal-user.wav. Shuffle begins 6–6.5 seconds before scheduled next hand, only after an observed result. All-in metadata preserves the legacy action kind for older clients. Existing playback fixes and all other effects are retained.

- table_knock_check.mp3 → check-user.wav (additional requested check replacement; same PCM conversion, no trimming or gain adjustment).

Validation: all 161 server tests and 13 mobile tests passed; TypeScript checks passed for every workspace; Android and iOS Expo exports succeeded. SHA-256 verification confirmed all six replacement assets in both platform exports. No EAS build or manual Railway deployment was run. Device listening validation is not part of this export check.
