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
- [x] Verified all 47 frontend tests, TypeScript checks and the production build.
- [x] Checked the cleaned interface in a browser with a Campus Manager session.
- [x] Designed the Admin campus-selection entry screen and selected-campus workspace in Figma.
- [x] Added the personalized `Welcome back, {first name}` administrator greeting.
- [x] Added the HI-Tech, Rathinam and Jaggannath campus choices.
- [x] Required global Admin and Program Manager accounts to select a campus before the full workspace navigation appears.
- [x] Added a visible active-campus switcher after entry.
- [x] Used the selected campus context throughout academic setup without repeating the campus field; kept scope locked in faculty access and timetable setup.
- [x] Updated the active Neon campus catalog to the same three campuses.
- [x] Replaced the stacked workspace page with single-view sidebar navigation.
- [x] Made Overview the first screen after selecting a campus.
- [x] Added a personalized campus welcome, real campus context and role-aware quick actions.
- [x] Added subtle Mirai orbit motion with reduced-motion support.
- [x] Split semester import, exam readiness and planned dates into their own sidebar views.
- [x] Expanded User access to create Faculty, Campus Manager and Administrator accounts with role-safe scope.
- [x] Added a dedicated Subjects view in Academic setup with a shared subject catalog and creation form.
- [x] Polished the campus-selection gateway with balanced cards, accessible focus states and responsive desktop, tablet and mobile layouts.
- [x] Replaced plain data-loading messages with responsive content-shaped shimmer skeletons across the frontend.
- [x] Removed decorative boxed header icons and kept page titles aligned without empty visual space.
- [x] Normalized workspace spacing, control heights and disabled-action contrast across the administrator interface.
- [x] Added deliberate exit-and-enter transitions between campuses and workspaces with reduced-motion support.
- [x] Normalized workspace headings, section rows, upload controls and Lesson Plans content alignment.
- [x] Replaced premature selection prompts with content-shaped loading states across timetable, semesters, lesson plans and planned dates.
- [x] Refined the sign-in screen into a minimal Mirai-branded layout and removed demo credentials, technical notes and promotional filler.
- [x] Added 21st.dev-inspired staggered workspace transitions, staged screen entrances and restrained card and button interaction motion.
- [x] Added an enhanced transparent Mirai faculty portrait to the sign-in brand panel with responsive placement and subtle depth.
- [x] Replaced the soft login wordmark with a higher-resolution source, aligned the brand composition to one grid and synchronized asset loading before entrance motion.

## Next implementation sequence

- [ ] Connect campus-specific overview metrics and today's lecture table to live data.
- [ ] Apply the same layout system to timetable setup.
- [x] Apply it to user access.
- [x] Apply it to lesson plans and planned topic dates.
- [ ] Apply it to progress dashboards and exam readiness.
- [ ] Apply it to exports and alerts.
- [x] Design and verify responsive tablet and mobile layouts for the campus-selection gateway.

The campus entry, animated Overview and single-view workspace navigation are implemented in the web app. The next UI phase applies the same layout system inside each operational workspace.
