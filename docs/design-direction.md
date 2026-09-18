# MediaCleaner — restrained utility redesign

## Brief and evidence

The owner rejected the mascot, rewards and oversized presentation. This is a private, local-first family utility, not a commercial engagement product. Keep the daily review limit and folder exclusions; remove playful pressure and decorative screens. The previous 320px capture placed the primary action below the fold because of the mascot and hero spacing.

## Directions considered

1. Plain file list: highest information density, but adds selection complexity to a ten-item review.
2. Editorial layout: clear reading hierarchy, but oversized headings and whitespace repeat the owner's concern.
3. Compact utility (selected): modest headings, neutral surfaces and a focused review action. Keeps familiar navigation without the ornamental hero.

The owner's request authorizes this direction and identity change. No extra libraries, accounts, paid assets or enterprise design infrastructure. Monetary ROI is not applicable to this family project; reduced effort and a successful review are the outcomes.

## Implementation handoff

- Name: MediaCleaner. No mascot, XP, levels, streaks or rewards in UI, notifications or persisted current-schema data.
- Typography: system sans, 24–26px page titles, 15–16px body, 13–14px metadata. Preserve OS font scaling.
- Color: neutral white/off-white surfaces, near-black primary text, readable slate secondary text and one blue interaction accent. Red only for destructive meaning.
- Layout: 16–20px horizontal spacing; small corner radii; no decorative shadows, oversized cards, hero or stat grid. Limit reading width on tablets.
- Touch targets: roughly 48px without enlarging all content. Labels stay visible in bottom navigation. Visible keyboard focus; no icon-only primary actions.
- Review: preview, filename/location, keep/delete. Native deletion must succeed before advancing. Cancel leaves data unchanged. Plain inline status, no celebration interruption or fake percentage.
- Home: daily review action visible at 320×640, compact factual progress, folder/reminder shortcuts. No urgency, guilt or points.
- Folders: protected list only, searchable picker on demand, descendant protection and explicit legacy-rule review.
- States: denied permission, unsupported Expo Go runtime, empty library, loading/cancel, failed deletion, unsaved progress retry, demo mode explicitly separate.
- Motion: only functional transitions, respecting reduced motion. No new animation runtime.

UI, storage/native operations and branding have separate implementation ownership. Existing review IDs, exclusions, preferences and real deletion totals must migrate without reset.

## Acceptance checks

- Core tests preserve exclusion safety, pagination, deletion cancellation and storage migration.
- Android Expo Go restriction is explained, not repeatedly sent to device settings as if denial were the cause.
- Browser test completes a review, cancels deletion, protects/restores a folder, changes settings and verifies demo isolation.
- No horizontal overflow at 320px or tablet widths. Primary action is visible at 320×640. Test increased text size and keyboard navigation.
- Text contrast target ≥4.5:1, essential controls ≥3:1. Screen-reader labels and native font scaling retained. Automated checks are not a claim of a full accessibility audit.
- No backend or telemetry; no reward for irreversible actions. Native permission/deletion testing requires an actual device/development build and is reported separately from browser simulation.
