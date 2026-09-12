# DoseAngel: App Store Connect Copy (draft)

Note: I could not verify that TripSit's absence from iOS is specifically due to Apple's drug-naming guidelines. No source confirms it, so treat that as unconfirmed, not precedent. Independent of that claim, the copy below still leans conservative on purpose, avoiding named controlled substances in anything reviewers see before installing (description, keywords, screenshots), consistent with Apple's actual 1.4.3 restriction against apps that encourage drug consumption. The in-app Combos/Substances screens still name MDMA, LSD, cocaine, etc., and reviewers do install and test the binary, so conservative metadata reduces risk but doesn't eliminate it. Two honest paths forward if it gets bounced: reframe the built-in substance list as generic, removable "types" with no bundled drug names (custom types only), or pursue Android first where this restriction doesn't exist.

---

## App Name
**DoseAngel**

## Subtitle (30 char max)
**Substance Timing & Safety** (25/30)

Alternates:
- "Know What's in Your System" (26/30)
- "Timing, Interactions, Safety" (28/30)

## Promotional Text (170 char max, editable without review)
> Track multiple substances as overlapping curves. See peak, comedown, and interaction risk in real time, fully offline. (119/170)

## Keywords (100 char max, comma-separated, no spaces)
```
harm reduction,interaction checker,trip planner,dose timer,pharmacokinetics,drug safety,party safety
```
(100/100, deliberately omits specific substance names)

## Description (4000 char max)

This is what was actually submitted to App Store Connect (supersedes the earlier draft below it in git history).

```
DoseAngel is a free, non-commercial harm reduction tool built for the community, that helps you plan ahead and keep track of where you are in your trip.

Most risky decisions happen while under the influence, when it's hard to track time or know if you're rising, at peak, or coming down. DoseAngel helps you plan ahead, see what's active in your system, and understand your current state before you consider redosing, significantly reducing the risk of overdose or dangerous combinations.

Key features:

Plan ahead: map out your doses before you start and see predicted peak and comedown times, so you know roughly what to expect

Live state tracking: a real time graph shows what's active in your system right now, including what stage you're in, coming up, at peak, or coming down

Combination checker: look up any two substances to see documented interaction risk before you combine them

Risky combination warnings: get an automatic warning if what you're about to take interacts with something already active, before you confirm

Customizable substances: adjust onset, peak, and offset timing for any bundled substance, or build your own from scratch

Everything is stored on your device, no internet connection required. No accounts, no data collection, nothing ever sent anywhere. Free, with no in-app purchases.

DoseAngel is a planning and reference tool, not medical advice. It does not diagnose or treat any condition, and it does not calculate or recommend dosages. Always check with a doctor in addition to using this app, and before making any medical decisions. In an emergency, contact your local emergency services immediately.
```

## Rejection response (2026-07-22)
Rejected under Guideline 1.4.1: the submitted description had no medical disclaimer at all. Added a closing line mirroring Apple's requested language: "remind users to check with a doctor in addition to using the app and before making any medical decisions."

**Action:** Paste the updated Description block above into App Store Connect (App Information > Description), then reply to the rejection message in App Store Connect confirming the change.

## What's New (v1.0)
```
First release of DoseAngel: live superposition tracking, Plan mode for previewing timing before you commit, a combination-interaction reference, and a fully offline, on-device design.
```

## What's New (v1.0.1)
```
This update focuses on smarter warnings and more control over your substance library.

Redose check: get warned before starting a new timer for something that's already active and hasn't reached its peak yet, a separate check from the interaction warning so it's never silently skipped.

Editable timing: adjust onset, comeup, peak, and offset for any bundled substance to match your own experience, with a one-tap reset back to the default.

Revised interaction data: interaction ratings and explanations have been re-checked and refined for accuracy, with a couple of new substances added to the database.

Plus smaller timing corrections, a smoother onboarding walkthrough, and general bug fixes.
```

## Category
Primary: **Health & Fitness** (Medical is the other option, but Medical apps face additional Apple review requirements around clinical accuracy claims; Health & Fitness better matches a reference/planning tool with no diagnostic claims).

## Age Rating Questionnaire
The "Frequent/Intense References to Drugs, Alcohol, or Tobacco" question should be answered honestly (Frequent/Intense). This pushes the rating to 17+. Trying to soften this answer to get a lower rating is more likely to trigger manual scrutiny than the honest 17+ answer.

## App Review Notes (private, reviewers only, not public)
```
DoseAngel is a personal harm-reduction planning tool, not a dosage calculator. It does not tell users how much of anything to take. Its only function is to let a user record when they took something and visualize the resulting timing curve (onset/peak/offset), including the combined effect when tracking more than one substance at once.

The bundled "Substances" library provides population-average timing data sourced from PsychonautWiki (a widely cited harm-reduction reference wiki) and an interaction-severity reference sourced from TripSit's combination data (also a widely used harm-reduction resource). This data is read-only reference material, analogous to a drug-interaction reference in a pharmacy app, not promotional or instructional content encouraging use.

The app does not facilitate the purchase, sale, or acquisition of any substance. It has no social features, no marketplace, no messaging. All data is stored locally on-device with no network calls; see Settings > Privacy & disclosure inside the app.

The interaction-warning feature is a safety feature: when a user is about to log a second substance that has a known dangerous or unsafe interaction with something already active, the app blocks the action with a warning modal until the user explicitly confirms. This is designed to reduce harm for people who are already making their own choices, not to encourage those choices.

Happy to answer any questions or walk through specific screens if useful for review.
```

---

## Submission readiness
- Privacy Policy URL: https://doseangel.com/privacy (live)
- Support URL: https://doseangel.com/support (live)
- 6.9" iPhone screenshots (1320×2868), 3–10 images: ready, stored locally outside this project (suggested set: Live graph, Plan mode, Combos screen, Disclosure screen)
- Apple Developer account + bundle ID (`com.odedrin.DoseAngel`): registered
