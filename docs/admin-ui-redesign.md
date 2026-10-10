# Administrator UI redesign

This document tracks the administrator interface redesign. The editable design source is [Mirai Tracker — Admin UI](https://www.figma.com/design/YwGAKtG05GLJg9hXRXJuQt).

## Content rules

- Keep operational information that helps a user complete work: lecture date and time, subject, faculty, batch, campus, topic, status, delivery state, deadlines and actions.
- Remove milestone labels, implementation notes, permission explanations and prose that teaches users how the website works.
- Use short page titles, compact status summaries and clear action labels.
- Preserve validation, permission, audit and calculation behavior when changing presentation.

## Completed

- [x] Created the first editable desktop administrator overview in Figma.
- [x] Added Mirai colors, Inter typography and reusable metric-card and status-chip components.
- [x] Used the Mirai light wordmark on the dark navigation background.
- [x] Removed the `Available workspaces` permission-explainer block from every role.
- [x] Simplified the alert center while retaining all lecture and delivery details.
- [x] Removed milestone and tutorial copy from administrator workspaces.
- [x] Updated frontend tests for the concise interface.
- [x] Verified all 45 frontend tests, TypeScript checks and the production build.
- [x] Checked the cleaned interface in a browser with a Campus Manager session.
- [x] Designed the Admin campus-selection entry screen and selected-campus workspace in Figma.
- [x] Added the personalized `Welcome back, {first name}` administrator greeting.
- [x] Added the HI-Tech, Rathinam and Jaggannath campus choices.
- [x] Required global Admin and Program Manager accounts to select a campus before the full workspace navigation appears.
- [x] Added a visible active-campus switcher after entry.
- [x] Preselected and locked campus scope in academic setup, faculty access and timetable setup.
- [x] Updated the active Neon campus catalog to the same three campuses.

## Next implementation sequence

- [ ] Connect campus-specific overview metrics and today's lecture table to live data.
- [ ] Apply the same layout system to timetable setup.
- [ ] Apply it to faculty access.
- [ ] Apply it to lesson plans and planned topic dates.
- [ ] Apply it to progress dashboards and exam readiness.
- [ ] Apply it to exports and alerts.
- [ ] Design and verify responsive tablet and mobile layouts after the desktop administrator structure is approved.

The content cleanup is implemented in the web app. The complete visual React implementation of the Figma overview is the next UI phase.
