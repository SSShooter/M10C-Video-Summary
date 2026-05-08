# Changelog

All notable changes to this project will be documented in this file.

## [2.1.0] - 2026-05-04

### Added
- **SPA Navigation Support**: Implemented single-page application (SPA) navigation support for Bilibili and YouTube. Using interval-based URL polling and history tracking, the extension now reliably reloads content scripts when navigating between videos without a full page refresh.
- **Mindmap Generation Prompts**: Integrated the video title into AI prompts, ensuring the generated mindmap's root node and content are more contextually accurate.
- **Auto-scroll for Summary**: The SummaryDisplay component now automatically scrolls to the bottom as new content streams in.
- **Performance Optimization**: Introduced controlled tab states and force-mounted content for the MindmapDisplay to improve rendering speed and prevent state loss.

### Fixed
- **Reliable Title Retrieval**: Added a `waitForElement` utility to ensure the YouTube video title is correctly captured even if the page loads slowly.
- **Interaction Blocking**: Fixed an issue where the Download dropdown in the MindmapDisplay would block user interaction by setting `modal={false}` on the Radix UI component.
- **UI Polishing**: Removed an unwanted bottom margin from the quick action container in the popup interface.

---

## [2.0.0] - 2026-04-20

### Changed
- **Framework Migration**: Major architectural shift from Plasmo to the **WXT** framework for better build performance and cross-browser support.
- **UI Refactoring**: Complete overhaul of the component structure, unifying the design of the Mindmap and Summary displays.
- **Storage Implementation**: Updated the storage layer to use WXT's storage API for better reliability.
